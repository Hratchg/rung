from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import Response

from . import config, regions
from .audit import Audit, twist_log
from .emissions import (
    IDLE_GALLONS_PER_HOUR,
    IDLE_LIMIT_H,
    KG_CO2_PER_GALLON_DIESEL,
    KG_CO2_PER_IDLE_HOUR,
    SOURCES as EMISSION_SOURCES,
    Idle,
    co2_kg,
)
from .engine import RULES
from .feeds import warmup
from .gate import Assignment
from .gitdiff import TwistDiffs
from .models import (
    CALL_OUTCOMES,
    HOLD_LABELS,
    SILENCE_LABELS,
    SOURCE_SPECS,
    SOURCES,
    SPOOF_HOLD_NAMES,
    STRENGTH,
    CallIn,
    DecisionIn,
    JumpIn,
    LaneIn,
    RatedIn,
    RegionIn,
    SpeedIn,
    SpoofIn,
)
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
    say_lb,
    say_num,
    say_time,
)

log = logging.getLogger("rung.voice")

LEGEND = {
    "live": "Live from Terminal49",
    "simulated": "Simulated by the Pier 7 scenario",
}

scenario = Scenario(audit=Audit(config.AUDIT_PATH))
poller = Poller(scenario.apply_live)
voice = Voice()
twist_diffs = TwistDiffs()
region_holder = {"region": regions.REGIONS[regions.DEFAULT]}


def region() -> regions.Region:
    return region_holder["region"]


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

UNLOCALIZED = ("/api/prompts", "/api/retell/")


@app.middleware("http")
async def localize_api(request: Request, call_next):
    """The API edge of the region switch: generated sentences leave in the region's units and names."""
    response = await call_next(request)
    path = request.url.path
    r = region()
    if (
        r.id == regions.DEFAULT
        or not path.startswith("/api/")
        or path.startswith(UNLOCALIZED)
        or not response.headers.get("content-type", "").startswith("application/json")
    ):
        return response
    body = b"".join([chunk async for chunk in response.body_iterator])
    try:
        data = regions.localize(json.loads(body), r)
    except ValueError:
        return Response(body, status_code=response.status_code, media_type="application/json")
    headers = {k: v for k, v in response.headers.items() if k.lower() not in ("content-length", "content-type")}
    return Response(json.dumps(data), status_code=response.status_code, headers=headers, media_type="application/json")


def minutes_since(later: datetime, earlier: datetime) -> int:
    return max(0, int((later - earlier).total_seconds() // 60))


def dark_feed() -> list[dict]:
    """One banner line per dark feed: scenario source_dark events in scenario minutes, poller failures in real minutes."""
    sc = scenario
    out = []
    for source, since in sorted(sc.dark_sources.items()):
        minutes = minutes_since(sc.now, since)
        out.append(
            {
                "source": source,
                "cause": "scenario",
                "since": iso(since),
                "minutes": minutes,
                "text": f"{source.capitalize()} feed dark, {minutes} min",
                "detail": (
                    f"The queue keeps running from the snapshot taken at {say_time(since)}. "
                    f"Boxes that depend on the {source} feed wait, or go to a planner if they were about to leave."
                ),
            }
        )
    if poller.failing and poller.failing_since:
        minutes = minutes_since(datetime.now().astimezone(), parse_dt(poller.failing_since))
        out.append(
            {
                "source": "terminal",
                "cause": "poller",
                "since": poller.failing_since,
                "minutes": minutes,
                "text": f"Terminal feed dark, {minutes} min",
                "detail": f"{poller.snapshot()['message']} The queue keeps running from the snapshot in fixtures/t49_snapshot.json.",
            }
        )
    return out


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
        "reefers": [
            {
                "number": s.number,
                "circuit": s.reefer_model.circuit,
                "power_on": s.reefer_model.power_at(sc.now),
                "silent": s.reefer_model.silent_since(sc.now) is not None,
            }
            for s in sorted(sc.boxes.values(), key=lambda s: s.number)
            if s.reefer_model and not s.released_at
        ],
        "event_log": sc.event_log[-10:][::-1],
        "resets": sc.resets,
        "voice": voice.status(),
        "dark_feed": dark_feed(),
        "rated": sc.rated_info(),
        "emissions": emissions_info(),
        "region": region().public(),
        "regions": [{"id": r.id, "name": r.name, "locode": r.locode} for r in regions.REGIONS.values()],
    }


def emissions_info() -> dict:
    r = region()
    return {
        "kg_co2_per_idle_hour": round(KG_CO2_PER_IDLE_HOUR, 3),
        "idle_gallons_per_hour": IDLE_GALLONS_PER_HOUR,
        "kg_co2_per_gallon_diesel": KG_CO2_PER_GALLON_DIESEL,
        "idle_limit_hours": IDLE_LIMIT_H,
        "label": r.emissions_label or (
            f"{say_num(KG_CO2_PER_IDLE_HOUR, 2)} kg CO2 per truck idle hour. A heavy duty diesel truck burns about "
            f"{say_num(IDLE_GALLONS_PER_HOUR)} gallon of diesel an hour at idle, and each gallon makes "
            f"{say_num(KG_CO2_PER_GALLON_DIESEL, 2)} kg CO2."
        ),
        "rules": r.emissions_rules,
        "sources": list(EMISSION_SOURCES),
    }


IDLE_LEAD = {
    "kept": ("Leaves in its booked hour.", "Left in its booked hour."),
    "moved": ("New slot {window} lane {lane}.", "Moved to {window} lane {lane}."),
    "overflow": ("No open slot tonight.", "Had no open slot."),
    "hold": ("On HOLD, so it takes no slot.", "Was on HOLD, so it took no slot."),
    "dark": ("Waiting on a dark feed.", "Waited on a dark feed."),
}


def idle_label(state: BoxState, idle: Idle) -> str:
    if state.released_at:
        lead = "Gated out."
    else:
        lane, window = idle.slot or (None, None)
        lead = IDLE_LEAD[idle.cause][idle.settled].format(lane=lane, window=window)
    minutes = round(idle.hours * 60)
    if minutes == 0:
        return f"{lead} No idle at the gate."
    kg = say_num(co2_kg(idle.hours))
    if idle.settled:
        return f"{lead} Idled {minutes} min at the gate, {kg} kg CO2."
    if idle.cause == "dark":
        return f"{lead} Idled {minutes} min so far, {kg} kg CO2."
    return f"{lead} Idles {minutes} min at the gate, {kg} kg CO2."


def idle_payload(state: BoxState, plan: Assignment | None = None) -> dict | None:
    """The truck's expected idle tonight and its CO2. None when no truck is booked for the box."""
    idle = scenario.idle(state, plan)
    if idle is None:
        return None
    return {
        "minutes": round(idle.hours * 60),
        "co2_kg": round(co2_kg(idle.hours), 1),
        "so_far_minutes": round(idle.so_far(scenario.now) * 60),
        "cause": idle.cause,
        "settled": idle.settled,
        "label": idle_label(state, idle),
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


def silence_payload(state: BoxState) -> dict | None:
    s = state.decision.silence if state.decision else None
    if not s:
        return None
    return {**s, "since": iso(s["since"]), "label": SILENCE_LABELS[s["kind"]]}


def rated_clock(state: BoxState) -> dict | None:
    sc = scenario
    if not sc.is_rated(state):
        return None
    h = hours_between(sc.rated_deadline, sc.now)
    at = say_time(sc.rated_deadline)
    tail = f"{say_hours(h)} left" if h >= 0 else f"passed {say_hours(h)} ago"
    return {"deadline": iso(sc.rated_deadline), "hours": round(h, 1), "label": f"Rated. Gate out by {at}, {tail}"}


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
        label = f"{power}. Product {say_num(reading['product_temp_c'])} C, set {say_num(reading['set_point_c'])} C"
        silence = silence_payload(state)
        if silence:
            label = f"Silent since {say_time(parse_dt(silence['since']))}. {silence['label']}"
        out["reefer"] = {**reading, "silent": silence is not None, "label": label}
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
        "rated": rated_clock(state),
        "dray_carrier": (state.appointment or {}).get("dray_carrier"),
        "clocks": clocks(state, plan),
        "idle": idle_payload(state, plan),
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


def spoof_info(state: BoxState) -> dict:
    holds = (state.customs or {}).get("holds", []) + (state.terminal or {}).get("holds", [])
    active = {h["name"] for h in holds if h.get("status") == "hold"}
    return {
        "available": state.released_at is None,
        "weight_in_lbs": (state.carrier or {}).get("weight_in_lbs"),
        "holds": [{"name": n, "label": HOLD_LABELS[n], "active": n in active} for n in SPOOF_HOLD_NAMES],
        "spoofed": dict(state.spoofed),
    }


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
        _, plan = scenario.gate_plan()
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
            "clocks": clocks(state, plan),
            "idle": idle_payload(state, plan),
            "warmup": warmup(state.reefer_model, scenario.now) if state.reefer_model else None,
            "history": scenario.audit.lines(box=number),
            "rated": rated_clock(state),
            "silence": silence_payload(state),
            "spoof": spoof_info(state),
            "call": call_payload(state),
            "ask": {
                "available": state.released_at is None,
                "mode": voice.mode,
                "default_outcome": default_outcome(state.weight_case),
                "outcomes": [{"id": o, "label": OUTCOME_LABELS[o]} for o in CALL_OUTCOMES],
                "weight_case": state.weight_case,
            },
        }


@app.post("/api/box/{number}/spoof")
def post_spoof(number: str, body: SpoofIn) -> dict:
    hold = (body.hold.name, body.hold.on) if body.hold else None
    try:
        return scenario.spoof(number.strip().upper(), body.weight_in_lbs, hold)
    except KeyError:
        raise HTTPException(404, f"Box {number} not found.")
    except ValueError as exc:
        raise HTTPException(409, str(exc))


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


def rated_rows(plan: Assignment, by_box: dict) -> list[dict]:
    """Where each rated order stands tonight, while rated order mode is on."""
    sc = scenario
    if not sc.rated_on:
        return []
    latest = sc.rated_latest_window
    order = {w: i for i, w in enumerate(sc.windows)}
    out = []
    for number in sc.rated_boxes:
        state = sc.boxes[number]
        slot = plan.placed.get(number)
        if state.released_at:
            status, text = "released", f"Released at {say_time(state.released_at)}."
        elif slot:
            on_time = latest is not None and order[slot[1]] <= order[latest]
            status = "on_time" if on_time else "late"
            text = f"Planned {slot[1]} lane {slot[0]}. " + ("Gates out before the deadline." if on_time else "Misses the deadline.")
        elif number in plan.overflow:
            status, text = "overflow", "No slot before the deadline."
        elif number in plan.held:
            status, text = "held", "On HOLD. Takes no slot until the hold clears."
        elif state.appointment:
            status, text = "missed", f"Booked {state.appointment['window']}, a window that has ended."
        else:
            status, text = "no_appointment", "No appointment booked."
        a = by_box.get(number)
        out.append({"box": number, "status": status, "text": text, "urgency": a.urgency if a else state.decision.urgency})
    return out


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
    slid = sc.gate_slid()
    deadline = say_time(sc.rated_deadline) if sc.rated_deadline else ""

    def chip(a) -> dict:
        return {"box": a.box, "urgency": a.urgency, "step": a.step, "reefer": a.reefer, "lfd_today": a.lfd_today, "rated": a.rated}

    def idle_of(box: str) -> dict:
        hours = sc.idle(sc.boxes[box], plan).hours
        return {"idle_minutes": round(hours * 60), "co2_kg": round(co2_kg(hours), 1)}

    def overflow_reason(a) -> str:
        if a.rated and a.latest_window in windows:
            reason = f"No open slot from {a.window} to {a.latest_window}, the last window before the {deadline} gate out deadline. {full}"
        else:
            reason = f"No open slot from {a.window} to {windows[-1]}. {full}"
        if a.box in slid:
            lane, window = slid[a.box]
            reason += f" Slid when rated orders took the slots. Without them it had {window} lane {lane}."
        return reason

    placed = {
        box: {**chip(by_box[box]), "lane": lane, "window": window, "moved": box in moved_boxes}
        for box, (lane, window) in plan.placed.items()
    }
    overflow = [
        {
            **chip(by_box[box]),
            "lane": by_box[box].lane,
            "window": by_box[box].window,
            "slid": box in slid,
            "slid_from": {"lane": slid[box][0], "window": slid[box][1]} if box in slid else None,
            "reason": overflow_reason(by_box[box]),
            **idle_of(box),
        }
        for box in plan.overflow
    ]
    held = [
        {
            **chip(by_box[box]),
            "lane": by_box[box].lane,
            "window": by_box[box].window,
            "reason": f"On HOLD with the {owners[box]}. The box takes no slot until the hold clears.",
            **idle_of(box),
        }
        for box in plan.held
    ]
    non_hold = [a for a in rows if a.step != "HOLD"]
    reefers = [a for a in non_hold if a.reefer]
    lfd = [a for a in non_hold if a.lfd_today]

    def kept(group) -> int:
        return sum(a.box in plan.placed for a in group)

    rung_idle, blunt_idle = sc.idle_planned()
    rung_h, blunt_h = round(rung_idle, 1), round(blunt_idle, 1)
    rung_kg, blunt_kg = round(co2_kg(rung_idle)), round(co2_kg(blunt_idle))
    avoided_h, avoided_kg = round(blunt_h - rung_h, 1), blunt_kg - rung_kg

    return {
        "lanes": [{"id": lane, "open": lane not in sc.lanes_closed} for lane in range(1, sc.lane_count + 1)],
        "windows": windows,
        "ended_windows": [w for w in sc.windows if w not in windows],
        "capacity": sc.capacity,
        "units": plan.units,
        "placed": placed,
        "moved": [
            {
                **m.__dict__,
                "urgency": by_box[m.box].urgency,
                "reefer": by_box[m.box].reefer,
                "lfd_today": by_box[m.box].lfd_today,
                **idle_of(m.box),
            }
            for m in plan.moved
        ],
        "overflow": overflow,
        "held": held,
        "missed": sc.missed(),
        "rated": {**sc.rated_info(), "slid": len(slid), "rows": rated_rows(plan, by_box)},
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
                "idle_hours_plan": rung_h,
                "idle_co2_kg_plan": rung_kg,
            },
            "blunt": {
                **sc.counters_blunt(),
                "kept": 0,
                "reefers_kept": 0,
                "lfd_kept": 0,
                "idle_hours_plan": blunt_h,
                "idle_co2_kg_plan": blunt_kg,
            },
            "reefers_total": len(reefers),
            "lfd_total": len(lfd),
            "non_hold": len(non_hold),
            "idle_hours_avoided": avoided_h,
            "idle_co2_kg_avoided": avoided_kg,
            "idle_label": (
                f"Under the Rung plan these {len(rows)} trucks idle {say_num(rung_h)} h at the gate, {say_lb(rung_kg)} kg CO2. "
                f"Closing the terminal idles them {say_num(blunt_h)} h, {say_lb(blunt_kg)} kg CO2. "
                f"Rung avoids {say_num(avoided_h)} idle hours and {say_lb(avoided_kg)} kg CO2."
                if rows
                else "No trucks are left in the plan for tonight."
            ),
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
    return {
        "call_id": info["call_id"],
        "access_token": info["access_token"],
        "transport": info.get("transport"),
        "ice_servers": info.get("ice_servers") or [],
        "mode": info["mode"],
        "mock": info["mock"],
    }


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


@app.get("/api/prompts")
def get_prompts() -> dict:
    """The prompt and settings scripts/retell_setup.py sends to Retell, read from that script so they never drift."""
    from scripts import retell_setup

    llm = retell_setup.llm_args("https://rung.example")
    return {
        "retell": {
            "agent_name": retell_setup.AGENT_NAME,
            "source": "scripts/retell_setup.py",
            "prompt": llm["general_prompt"],
            "temperature": llm["model_temperature"],
            "variables": list(retell_setup.VARIABLES),
            "tools": [{"name": t["name"], "description": t["description"]} for t in llm["general_tools"]],
            "analysis": [{"name": a["name"], "description": a["description"]} for a in retell_setup.ANALYSIS],
            "functions_live": bool(voice.settings.public_base_url),
        },
    }


@app.get("/api/audit")
def get_audit(since: str = "", box: str = "", limit: int = 0, diff: bool = False) -> dict:
    git = twist_diffs.commits()
    with scenario.lock:
        scenario.advance()
        twists = twist_log(scenario.twists, RULES, config.TWIST_LOG_PATH, git, patches=diff)
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


@app.post("/api/scenario/rated")
def post_rated(body: RatedIn) -> dict:
    try:
        scenario.set_rated(body.on)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    with scenario.lock:
        return state_payload()


@app.post("/api/scenario/speed")
def post_speed(body: SpeedIn) -> dict:
    scenario.set_speed(body.minutes_per_second)
    with scenario.lock:
        return state_payload()


@app.post("/api/region")
def post_region(body: RegionIn) -> dict:
    try:
        region_holder["region"] = regions.get(body.region)
    except KeyError:
        raise HTTPException(400, f"Unknown region. Use one of {', '.join(regions.REGIONS)}.")
    with scenario.lock:
        return state_payload()


app.frontend("/", directory=config.FRONTEND_DIST, fallback="index.html", check_dir=False)
