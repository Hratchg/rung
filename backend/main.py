from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, Request

from . import config
from .audit import Audit, twist_log
from .engine import RULES
from .feeds import warmup
from .gate import Assignment
from .models import CALL_OUTCOMES, SOURCE_SPECS, SOURCES, STRENGTH, CallIn, DecisionIn, JumpIn, LaneIn, SpeedIn
from .scenario import EVENT_TYPES, BoxState, Scenario
from .t49 import Poller
from .voice import LIVE_GIVE_UP_SECONDS, OUTCOME_LABELS, POLL_SECONDS, Voice, default_outcome, spell_box
from .timefmt import (
    format_offset,
    hours_between,
    iso,
    lfd_deadline,
    parse_date,
    parse_dt,
    say_age,
    say_date,
    say_num,
)

log = logging.getLogger("rung.voice")

LEGEND = {
    "live": "Live from Terminal49",
    "simulated": "Simulated by the Pier 7 scenario",
}

scenario = Scenario(audit=Audit(config.AUDIT_PATH))
poller = Poller(scenario.apply_live)
voice = Voice()


def sync_call(number: str, call: dict) -> None:
    """Pull the transcript and, once it exists, the analysis for one call, then apply it."""
    if not call["mock"] and time.time() - call["started_wall"] > LIVE_GIVE_UP_SECONDS:
        if call["outcome"] is None:
            note = "No analysis from Retell after 15 minutes."
            scenario.record_call(number, call["call_id"], {"outcome": "unknown", "callback_needed": True, "notes": note}, "timeout")
        scenario.call_update(number, call["call_id"], "ended", [])
        return
    got = voice.retrieve(call["call_id"], call["mock"])
    scenario.call_update(number, call["call_id"], got["status"], got["transcript"])
    if got["analysis"]:
        scenario.record_call(number, call["call_id"], got["analysis"], "call_analysis")


async def poll_calls() -> None:
    while True:
        for number, call in scenario.active_calls():
            try:
                await asyncio.to_thread(sync_call, number, call)
            except Exception as exc:  # one bad call must not stop the poller
                log.warning("Call %s poll failed: %s", call["call_id"], exc)
        await asyncio.sleep(POLL_SECONDS)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    tasks = [asyncio.create_task(poller.run()), asyncio.create_task(poll_calls())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="Rung", lifespan=lifespan)
app.state.scenario = scenario
app.state.poller = poller


def state_payload() -> dict:
    sc = scenario
    return {
        "terminal": sc.terminal_name,
        "clock": iso(sc.now),
        "clock_start": iso(sc.start),
        "offset": format_offset(sc.now - sc.start),
        "minutes_per_second": sc.speed,
        "mode": sc.mode,
        "lanes": sc.lane_count,
        "lanes_open": sc.lanes_open(),
        "dark_sources": sorted(sc.dark_sources),
        "counters": sc.counters(),
        "counters_blunt": sc.counters_blunt(),
        "legend": LEGEND,
        "poller": poller.snapshot(),
        "carriers": sc.carriers(),
        "scripted_events": sc.scripted_events(),
        "powered_reefers": sorted(
            s.number
            for s in sc.boxes.values()
            if s.reefer_model and not s.released_at and s.reefer_model.power_at(sc.now)
        ),
        "event_log": sc.event_log[-10:][::-1],
        "resets": sc.resets,
        "voice": voice.status(),
    }


def call_payload(state: BoxState) -> dict | None:
    call = state.call
    if not call:
        return None
    out = {k: v for k, v in call.items() if k != "started_wall"}
    out["outcome_label"] = OUTCOME_LABELS.get(call["outcome"]) if call["outcome"] else None
    return out


def badge(state: BoxState, name: str) -> str | None:
    present = state.reefer_model is not None if name == "reefer" else getattr(state, name) is not None
    if not present:
        return None
    return "live" if name in state.live_sources and state.live else "simulated"


def say_hours(hours: float) -> str:
    return say_age(abs(hours))


def planned_slot(state: BoxState, plan: Assignment | None) -> dict | None:
    """Where tonight's gate plan puts the box, when that differs from its booking."""
    appt = state.appointment
    if plan is None or not appt or state.released_at:
        return None
    slot = plan.placed.get(state.number)
    if slot is None:
        if state.number in plan.overflow:
            return {"lane": None, "window": None, "label": "No open slot tonight"}
        return None
    if slot == (appt["lane"], appt["window"]):
        return None
    return {"lane": slot[0], "window": slot[1], "label": f"Planned {slot[1]} lane {slot[0]}"}


def clocks(state: BoxState, plan: Assignment | None = None) -> dict:
    sc = scenario
    terminal = state.terminal or {}
    out: dict = {"lfd": None, "reefer": None, "appointment": None}
    lfd = parse_date(terminal.get("pickup_lfd"))
    if lfd:
        h = hours_between(lfd_deadline(lfd, sc.tz), sc.now)
        tail = f"{say_hours(h)} left" if h >= 0 else f"{say_hours(h)} past"
        out["lfd"] = {"date": lfd.isoformat(), "hours": round(h, 1), "label": f"LFD {say_date(lfd)}, {tail}"}
    reading = state.reefer_reading(sc.now)
    if reading:
        power = "Power on" if reading["power_on"] else "Power off"
        out["reefer"] = {
            **reading,
            "label": f"{power}. Product {say_num(reading['product_temp_c'])} C, set {say_num(reading['set_point_c'])} C",
        }
    appt = state.appointment
    if appt:
        at = parse_dt(appt["at"])
        closed = appt["lane"] in sc.lanes_closed
        planned = planned_slot(state, plan)
        label = f"Lane {appt['lane']} at {appt['window']}" + (". Lane closed" if closed else "")
        if planned:
            label += f". {planned['label']}"
        out["appointment"] = {
            "lane": appt["lane"],
            "window": appt["window"],
            "at": appt["at"],
            "hours": round(hours_between(at, sc.now), 1),
            "lane_closed": closed,
            "dray_carrier": appt["dray_carrier"],
            "planned": planned,
            "label": label,
        }
    return out


def queue_row(state: BoxState, plan: Assignment | None = None) -> dict:
    eff = scenario.effective(state)
    carrier = state.carrier or {}
    return {
        "number": state.number,
        "equipment_type": state.equipment_type,
        "equipment_length": carrier.get("equipment_length"),
        "urgency": eff["urgency"],
        "step": eff["step"],
        "engine_step": eff["engine_step"],
        "hand": eff["hand"],
        "reason": eff["reason"],
        "owner": eff["owner"],
        "pinned": eff["pinned"],
        "fired": eff["fired"],
        "conflicts": eff["conflicts"],
        "planner": eff["planner"],
        "live": state.live,
        "dray_carrier": (state.appointment or {}).get("dray_carrier"),
        "clocks": clocks(state, plan),
        "badges": {name: badge(state, name) for name in SOURCES},
    }


def sort_key(row: dict):
    lfd = (row["clocks"]["lfd"] or {}).get("date") or "9999-12-31"
    return (0 if row["pinned"] and row["step"] == "RELEASE" else 1, -row["urgency"], -STRENGTH[row["step"]], lfd, row["number"])


@app.get("/api/state")
def get_state() -> dict:
    with scenario.lock:
        scenario.advance()
        return state_payload()


@app.get("/api/queue")
def get_queue(carrier: str = "", step: str = "") -> list[dict]:
    with scenario.lock:
        scenario.advance()
        _, plan = scenario.gate_plan()
        rows = [queue_row(s, plan) for s in scenario.boxes.values() if s.released_at is None and s.decision]
    if carrier:
        rows = [r for r in rows if r["dray_carrier"] == carrier]
    if step:
        rows = [r for r in rows if r["step"] == step.upper()]
    rows.sort(key=sort_key)
    return rows


@app.get("/api/box/{number}")
def get_box(number: str) -> dict:
    state = scenario.boxes.get(number)
    if state and state.call and state.call["mock"] and scenario.call_active(number):
        # A mock call costs nothing to read, so the card gets each line without waiting for the poller.
        sync_call(number, dict(state.call))
    with scenario.lock:
        scenario.advance()
        state = scenario.boxes.get(number)
        if state is None:
            raise HTTPException(404, f"Box {number} not found.")
        d = state.decision
        raw = {
            "carrier": state.carrier,
            "terminal": state.terminal,
            "customs": state.customs,
            "weighbridge": state.weighbridge,
            "reefer": state.reefer_reading(scenario.now),
        }
        sources = {}
        for name in SOURCES:
            data = raw[name]
            if data is None:
                sources[name] = None
                continue
            spec = SOURCE_SPECS[name]
            observed = parse_dt(data.get(spec.observed_field))
            age_h = max(0.0, hours_between(scenario.now, observed)) if observed else None
            sources[name] = {
                "fields": data,
                "observed_at": iso(observed),
                "age": say_age(age_h),
                "age_h": round(age_h, 2) if age_h is not None else None,
                "trust": d.trust[name],
                "trust_reason": d.trust_detail[name].reason,
                "badge": badge(state, name),
                "dark": name in scenario.dark_sources or age_h is None or age_h > spec.dark_after_h,
            }
        rules = {r.id: r for r in RULES}
        return {
            "number": state.number,
            "live": state.live,
            "equipment_type": state.equipment_type,
            "equipment_length": (state.carrier or {}).get("equipment_length"),
            "appointment": state.appointment,
            "mode": scenario.mode,
            "sources": sources,
            "conflicts": [
                {"code": c.code, "sources": c.sources, "values": c.values, "sentence": c.sentence} for c in d.conflicts
            ],
            "fired": [
                {
                    "id": rid,
                    "name": rules[rid].name if rid in rules else "",
                    "step": d.votes.get(rid),
                    "why": d.whys.get(rid, ""),
                    "file": rules[rid].file if rid in rules else "",
                    "twist_tag": rules[rid].twist_tag if rid in rules else None,
                }
                for rid in d.fired
            ],
            "decision": scenario.effective(state),
            "clocks": clocks(state, scenario.gate_plan()[1]),
            "warmup": warmup(state.reefer_model, scenario.now) if state.reefer_model else None,
            "history": scenario.audit.lines(box=number),
            "call": call_payload(state),
            "ask": {
                "available": state.released_at is None,
                "mode": voice.mode,
                "default_outcome": default_outcome(state.weight_case),
                "outcomes": [{"id": o, "label": OUTCOME_LABELS[o]} for o in CALL_OUTCOMES],
                "weight_case": state.weight_case,
            },
        }


@app.post("/api/decision")
def post_decision(body: DecisionIn) -> dict:
    try:
        return scenario.planner_action(body.box, body.action, body.step, body.note.strip())
    except KeyError:
        raise HTTPException(404, f"Box {body.box} not found.")
    except ValueError as exc:
        raise HTTPException(409, str(exc))


def say_list(items: list) -> str:
    items = [str(x) for x in items]
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def gate_payload() -> dict:
    sc = scenario
    rows, plan = sc.gate_plan()
    by_box = {a.box: a for a in rows}
    moved_boxes = {m.box for m in plan.moved}
    windows = sc.open_windows()
    if not plan.lanes_open:
        full = "Every lane is closed."
    elif len(plan.lanes_open) == 1:
        full = f"Lane {plan.lanes_open[0]} is full."
    else:
        full = f"Lanes {say_list(plan.lanes_open)} are full."
    owners = {a.box: sc.effective(sc.boxes[a.box])["owner"] for a in rows if a.step == "HOLD"}

    def chip(a) -> dict:
        return {"box": a.box, "urgency": a.urgency, "step": a.step, "reefer": a.reefer, "lfd_today": a.lfd_today}

    placed = {
        box: {**chip(by_box[box]), "lane": lane, "window": window, "moved": box in moved_boxes}
        for box, (lane, window) in plan.placed.items()
    }
    overflow = [
        {
            **chip(by_box[box]),
            "lane": by_box[box].lane,
            "window": by_box[box].window,
            "reason": f"No open slot from {by_box[box].window} to {windows[-1]}. {full}",
        }
        for box in plan.overflow
    ]
    held = [
        {
            **chip(by_box[box]),
            "lane": by_box[box].lane,
            "window": by_box[box].window,
            "reason": f"On HOLD with the {owners[box]}. The box takes no slot until the hold clears.",
        }
        for box in plan.held
    ]
    non_hold = [a for a in rows if a.step != "HOLD"]
    reefers = [a for a in non_hold if a.reefer]
    lfd = [a for a in non_hold if a.lfd_today]

    def kept(group) -> int:
        return sum(a.box in plan.placed for a in group)

    return {
        "lanes": [{"id": lane, "open": lane not in sc.lanes_closed} for lane in range(1, sc.lane_count + 1)],
        "windows": windows,
        "ended_windows": [w for w in sc.windows if w not in windows],
        "capacity": sc.capacity,
        "units": plan.units,
        "placed": placed,
        "moved": [
            {**m.__dict__, "urgency": by_box[m.box].urgency, "reefer": by_box[m.box].reefer, "lfd_today": by_box[m.box].lfd_today}
            for m in plan.moved
        ],
        "overflow": overflow,
        "held": held,
        "missed": sc.missed(),
        "solve_ms": plan.solve_ms,
        "solver": plan.solver,
        "error": plan.error,
        "compare": {
            "appointments": len(rows),
            "rung": {
                **sc.counters(),
                "kept": len(plan.placed),
                "reefers_kept": kept(reefers),
                "lfd_kept": kept(lfd),
            },
            "blunt": {**sc.counters_blunt(), "kept": 0, "reefers_kept": 0, "lfd_kept": 0},
            "reefers_total": len(reefers),
            "lfd_total": len(lfd),
            "non_hold": len(non_hold),
        },
    }


@app.get("/api/gate")
def get_gate() -> dict:
    with scenario.lock:
        scenario.advance()
        return gate_payload()


@app.post("/api/gate/lanes")
def post_gate_lanes(body: LaneIn) -> dict:
    try:
        scenario.set_lane(body.lane, body.open)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    with scenario.lock:
        return gate_payload()


@app.post("/api/call/{number}")
def post_call(number: str, body: CallIn | None = None) -> dict:
    number = number.strip().upper()
    if number not in scenario.boxes:
        raise HTTPException(404, f"Box {number} not found.")
    if scenario.call_active(number):
        raise HTTPException(409, "A call for this box is already running.")
    try:
        variables, phone = scenario.call_variables(number)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    outcome = (body.mock_outcome if body else None) or default_outcome(scenario.boxes[number].weight_case)
    try:
        info = voice.start(variables, {"box": number}, phone, outcome)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Retell refused the call: {exc}")
    scenario.call_started(number, info, variables)
    return {"call_id": info["call_id"], "access_token": info["access_token"], "mode": info["mode"], "mock": info["mock"]}


STEP_SPOKEN = {
    "RELEASE": "is ready to go at its slot",
    "WATCH": "is not ready yet. We check it again at the next update",
    "ASK": "needs fresher information before it can go",
    "SLOW": "will go later or in another lane",
    "HOLD": "is on hold",
    "HAND": "is with a planner right now",
}


def lookup_text(number: str) -> str:
    state = scenario.boxes.get(number)
    if state is None:
        return f"I could not find container {spell_box(number)}. Please check the number and try again."
    if state.released_at:
        return f"Container {spell_box(number)} has been released at the gate."
    eff = scenario.effective(state)
    parts = [f"Container {spell_box(number)} {STEP_SPOKEN[eff['step']]}."]
    if eff["step"] == "HOLD" and eff["owner"]:
        parts.append(f"The {eff['owner']} has to clear it.")
    appt = state.appointment
    if appt:
        parts.append(f"Your appointment is lane {appt['lane']} at {appt['window']}.")
        planned = planned_slot(state, scenario.gate_plan()[1])
        if planned and planned["lane"]:
            parts.append(f"The plan for tonight moves you to lane {planned['lane']} at {planned['window']}.")
        elif planned:
            parts.append("There is no open slot for you tonight.")
    return " ".join(parts)


async def retell_body(request: Request) -> dict:
    raw = (await request.body()).decode("utf-8")
    if not voice.verify(raw, request.headers.get("x-retell-signature")):
        raise HTTPException(401, "Retell signature did not verify.")
    try:
        body = json.loads(raw or "{}")
    except json.JSONDecodeError:
        raise HTTPException(400, "Body is not JSON.")
    return body if isinstance(body, dict) else {}


def box_from(body: dict) -> str:
    args = body.get("args") if isinstance(body.get("args"), dict) else body
    call = body.get("call") if isinstance(body.get("call"), dict) else {}
    raw = args.get("container_number") or (call.get("metadata") or {}).get("box") or ""
    return "".join(str(raw).split()).upper()


@app.post("/api/retell/lookup")
async def post_retell_lookup(request: Request) -> dict:
    body = await retell_body(request)
    number = box_from(body)
    if not number:
        return {"result": "Which container number are you asking about?"}
    with scenario.lock:
        scenario.advance()
        return {"result": lookup_text(number)}


@app.post("/api/retell/record")
async def post_retell_record(request: Request) -> dict:
    body = await retell_body(request)
    number = box_from(body)
    args = body.get("args") if isinstance(body.get("args"), dict) else body
    call = body.get("call") if isinstance(body.get("call"), dict) else {}
    if number not in scenario.boxes:
        return {"result": "I could not find that container, so nothing was recorded."}
    analysis = {
        "outcome": args.get("outcome"),
        "callback_needed": args.get("callback_needed"),
        "notes": args.get("notes", ""),
    }
    eff = scenario.record_call(number, call.get("call_id") or args.get("call_id"), analysis, "record_function")
    return {"result": f"Recorded. Container {spell_box(number)} {STEP_SPOKEN[eff['step']]}."}


@app.get("/api/audit")
def get_audit(since: str = "", box: str = "", limit: int = 0) -> dict:
    with scenario.lock:
        scenario.advance()
        twists = twist_log(scenario.twists, RULES, config.TWIST_LOG_PATH)
    return {
        "lines": scenario.audit.lines(since or None, box.strip().upper() or None, max(0, limit)),
        "total": len(scenario.audit.buffer),
        "twists": twists,
    }


@app.post("/api/scenario/reset")
def post_reset() -> dict:
    scenario.reset()
    with scenario.lock:
        return state_payload()


@app.post("/api/scenario/jump")
def post_jump(body: JumpIn) -> dict:
    scenario.jump(body.t)
    with scenario.lock:
        return state_payload()


@app.post("/api/scenario/event")
def post_event(event: dict = Body(...)) -> dict:
    if event.get("type") not in EVENT_TYPES:
        raise HTTPException(400, f"Unknown event type. Use one of {', '.join(EVENT_TYPES)}.")
    try:
        entry = scenario.post_event(event)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(400, f"Bad event: {exc}")
    with scenario.lock:
        return {**state_payload(), "applied": entry}


@app.post("/api/scenario/speed")
def post_speed(body: SpeedIn) -> dict:
    scenario.set_speed(body.minutes_per_second)
    with scenario.lock:
        return state_payload()


app.frontend("/", directory=config.FRONTEND_DIST, fallback="index.html", check_dir=False)
