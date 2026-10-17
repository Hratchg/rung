from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException

from . import config
from .audit import Audit, twist_log
from .engine import RULES
from .feeds import warmup
from .gate import Assignment
from .models import SOURCE_SPECS, SOURCES, STRENGTH, DecisionIn, JumpIn, LaneIn, SpeedIn
from .scenario import EVENT_TYPES, BoxState, Scenario
from .t49 import Poller
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

LEGEND = {
    "live": "Live from Terminal49",
    "simulated": "Simulated by the Pier 7 scenario",
}

scenario = Scenario(audit=Audit(config.AUDIT_PATH))
poller = Poller(scenario.apply_live)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(poller.run())
    try:
        yield
    finally:
        task.cancel()
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
    }


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
            "call": None,
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
