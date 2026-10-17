from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException

from . import config
from .audit import Audit, twist_log
from .engine import RULES
from .feeds import warmup
from .models import SOURCE_SPECS, SOURCES, STRENGTH, DecisionIn, JumpIn, SpeedIn
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


def clocks(state: BoxState) -> dict:
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
        label = f"Lane {appt['lane']} at {appt['window']}" + (". Lane closed" if closed else "")
        out["appointment"] = {
            "lane": appt["lane"],
            "window": appt["window"],
            "at": appt["at"],
            "hours": round(hours_between(at, sc.now), 1),
            "lane_closed": closed,
            "dray_carrier": appt["dray_carrier"],
            "label": label,
        }
    return out


def queue_row(state: BoxState) -> dict:
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
        "clocks": clocks(state),
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
        rows = [queue_row(s) for s in scenario.boxes.values() if s.released_at is None and s.decision]
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
            "clocks": clocks(state),
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
