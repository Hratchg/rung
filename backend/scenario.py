"""Scenario loading, synthetic population, scenario clock, and events.

All randomness lives here and is driven by the scenario seed.
"""
from __future__ import annotations

import copy
import json
import random
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from stdnum import iso6346

from . import config
from .audit import Audit, decision_line
from .engine import evaluate
from .feeds import ReeferModel, circuit_for, loss_limit_c, reefer_model, weighbridge_reading
from .gate import Appt, Assignment, solve
from .models import CALL_OUTCOMES, CUSTOMS_HOLD_NAMES, HOLD_LABELS, STEPS, Box, Decision
from .t49 import map_container
from .timefmt import (
    format_offset,
    hours_between,
    iso,
    lfd_deadline,
    parse_date,
    parse_dt,
    parse_offset,
    say_lb,
    window_at,
)
from .voice import trucker_name

CALL_FINAL = ("ended", "error", "not_connected")
CALL_EFFECTS = {
    "confirmed_empty": "Trucker backed the manifest. C1 cleared and carrier trust raised.",
    "confirmed_loaded": "Trucker backed the scale. Weighbridge trust raised and the box goes to a planner.",
    "reschedule_accepted": "Trucker accepted a later slot. C1 stays open.",
    "unknown": "The call did not settle the weight. C1 stays open and the box stays on HOLD.",
}

OWNER_CODES = ("MSKU", "TCLU", "CMAU", "HLBU", "ONEU", "MSCU")
DRAY_CARRIERS = (
    "Harbor Freight Lines",
    "Bayline Drayage",
    "Pacific Coast Dray",
    "Port Runner Trucking",
    "Seaside Haulers",
)
REEFER_PROFILES = (
    (-18.0, ("frozen fish", "frozen poultry", "frozen shrimp")),
    (-1.4, ("chilled beef", "chilled lamb", "chilled pork")),
    (10.0, ("avocados", "citrus", "tomatoes")),
)
NON_REEFER_TYPES = (("dry", 80), ("open top", 6), ("flat rack", 5), ("tank", 5), ("bulk", 4))
HOLD_KINDS = ("customs", "line", "freight", "TMF")
HOLD_TEXT = {"customs": "CBP HOLD", "line": "LINE HOLD", "freight": "FREIGHT HOLD", "TMF": "TMF HOLD"}
SPOOF_HOLD_TEXT = {**HOLD_TEXT, "USDA": "USDA HOLD", "VACIS": "VACIS EXAM"}
DEMURRAGE_PER_DAY = {"reefer": 440, "dry": 275}
EVENT_TYPES = (
    "mode",
    "lanes_down",
    "lanes_up",
    "hold_placed",
    "hold_cleared",
    "reefer_power_off",
    "reefer_power_on",
    "source_dark",
    "source_back",
    "fee_increase",
    "twist",
    # Phase 5, silent reefer classifier. Each one only shapes the readings, the engine works out the class.
    "reefer_silent",
    "circuit_trip",
)
# Units on a tripped circuit drop off the monitoring system one minute apart as their racks lose power.
TRIP_STAGGER = timedelta(minutes=1)
SILENT_ASK_EFFECT = {
    "tripped": "Reefer crew asked to check circuit {circuit}.",
    "failed": "Reefer technician asked to inspect the unit.",
    "telemetry": "Reefer crew asked for a manual temperature read.",
}


def load_config(path: Path) -> dict:
    return json.loads(Path(path).read_text())


def daily_demurrage(equipment_type: str) -> int:
    return DEMURRAGE_PER_DAY["reefer" if equipment_type == "reefer" else "dry"]


def _weighted_pick(rng: random.Random, items: list, weight, n: int) -> list:
    keyed = [(rng.random() ** (1.0 / weight(item)), idx, item) for idx, item in enumerate(items)]
    keyed.sort(key=lambda k: (-k[0], k[1]))
    return [item for _, _, item in keyed[:n]]


def generate_synthetic(cfg: dict) -> list[dict]:
    syn = cfg["synthetic"]
    rng = random.Random(cfg["seed"])
    start = parse_dt(cfg["clock_start"])
    today = start.date()
    term = cfg["terminal"]
    windows: list[str] = term["windows"]
    fixed = cfg.get("containers", [])
    count = int(syn["count"])

    taken = {c["number"] for c in fixed}
    numbers: list[str] = []
    while len(numbers) < count:
        base = rng.choice(OWNER_CODES) + f"{rng.randrange(1_000_000):06d}"
        number = base + iso6346.calc_check_digit(base)
        if number not in taken:
            taken.add(number)
            numbers.append(number)

    reefer_idx = sorted(rng.sample(range(count), round(count * syn["reefer_share"])))
    reefer_profile = {i: REEFER_PROFILES[k % 3] for k, i in enumerate(reefer_idx)}

    hold_idx = sorted(rng.sample(range(count), round(count * syn["hold_rate"])))
    holds: dict[int, dict] = {}
    for k, i in enumerate(hold_idx):
        name = HOLD_KINDS[k % len(HOLD_KINDS)]
        holds[i] = {"name": name, "status": "pending" if k % 5 == 4 else "hold", "description": HOLD_TEXT[name]}

    units = [(lane, w, k) for lane in range(1, term["lanes"] + 1) for w in windows for k in range(term["capacity_per_lane_hour"])]
    used = Counter((c["appointment"]["lane"], c["appointment"]["window"]) for c in fixed if c.get("appointment"))
    skipped: Counter = Counter()
    free = []
    for lane, w, k in units:
        if skipped[(lane, w)] < used[(lane, w)]:
            skipped[(lane, w)] += 1
            continue
        free.append((lane, w, k))
    target = round(len(units) * (1 - syn["empty_slot_share"])) - sum(used.values())
    target = max(0, min(target, len(free), count))
    afternoon = {w for w in windows if "13:00" <= w <= "18:00"}
    tuesday = cfg.get("mode", "tuesday") == "tuesday" and afternoon

    def weight(unit):
        return 3.0 if tuesday and unit[1] in afternoon else 1.0

    chosen_units = _weighted_pick(rng, free, weight, target)
    appt_boxes = rng.sample(range(count), target)
    no_shows = set(rng.sample(range(target), round(target * syn["no_show_rate"])))
    appointment_for = {}
    for j, (i, unit) in enumerate(zip(appt_boxes, chosen_units)):
        lane, w, _ = unit
        appointment_for[i] = {
            "lane": lane,
            "window": w,
            "dray_carrier": rng.choice(DRAY_CARRIERS),
            "trucker_phone": f"+1310555{rng.randrange(10_000):04d}",
            "no_show": j in no_shows,
        }

    boxes: list[dict] = []
    for i, number in enumerate(numbers):
        profile = reefer_profile.get(i)
        if profile:
            equipment_type = "reefer"
            length = 40
        else:
            equipment_type = rng.choices([t for t, _ in NON_REEFER_TYPES], [w for _, w in NON_REEFER_TYPES])[0]
            length = rng.choices([20, 40, 45], [30, 60, 10])[0]
        weight_lb = round(rng.randint(4000, 48000), -1)
        hold = holds.get(i)
        active = hold is not None and hold["status"] == "hold"
        lfd = today + timedelta(days=rng.randint(-1, 6))
        days_past = (today - lfd).days
        fees = []
        if days_past > 0:
            fees.append({"type": "demurrage", "amount": days_past * daily_demurrage(equipment_type), "currency_code": "USD"})
        appt = appointment_for.get(i)
        appt_at = window_at(appt["window"], start) if appt else None
        arrived = start - timedelta(hours=rng.uniform(30, 140))
        block = "R" if profile else rng.choice("ABCDEFG")
        box = {
            "number": number,
            "live": False,
            "synthetic": True,
            "carrier": {
                "weight_in_lbs": weight_lb,
                "equipment_type": equipment_type,
                "equipment_length": length,
                "current_status": "not_available" if active else "available",
                "seal_number": f"SL{rng.randrange(10_000_000):07d}",
                "pod_arrived_at": iso(arrived),
                "pod_discharged_at": iso(arrived + timedelta(hours=rng.uniform(4, 18))),
                "observed_at": iso(start - timedelta(minutes=rng.randint(20, 360))),
            },
            "terminal": {
                "available_for_pickup": not active,
                "availability_known": True,
                "pickup_lfd": lfd.isoformat(),
                "fees_at_pod_terminal": fees,
                "location_at_pod_terminal": f"{block}-{rng.randint(1, 30):02d}-{rng.randint(1, 6):02d}",
                "pickup_appointment_at": iso(appt_at),
                "terminal_checked_at": iso(start - timedelta(minutes=rng.randint(5, 45))),
                "holds": [hold] if hold and hold["name"] not in CUSTOMS_HOLD_NAMES else [],
            },
            "customs": {
                "holds": [hold] if hold and hold["name"] in CUSTOMS_HOLD_NAMES else [],
                "observed_at": iso(start - timedelta(minutes=rng.randint(10, 60))),
            },
            "weighbridge": {
                "measured_weight_lbs": round(weight_lb * (1 + rng.uniform(0.01, 0.03)), -1),
                "measured_at": iso(start - timedelta(minutes=rng.randint(10, 120))),
                "method": rng.choice(("gate_weighbridge", "crane_load_cell")),
            },
            "appointment": appt,
        }
        if profile:
            set_point, cargos = profile
            box["reefer"] = {
                "set_point_c": set_point,
                "air_temp_c": round(set_point + rng.uniform(0.2, 0.8), 1),
                "product_temp_c": round(set_point + rng.uniform(0.0, 0.4), 1),
                "power_on": True,
                "last_seen": iso(start - timedelta(minutes=rng.randint(0, 59))),
                "cargo": rng.choice(cargos),
            }
        boxes.append(box)

    def plain_candidates():
        for b in boxes:
            if b["carrier"]["equipment_type"] == "dry" and b["appointment"] and not b["customs"]["holds"] and not b["terminal"]["holds"]:
                if parse_date(b["terminal"]["pickup_lfd"]) > today:
                    yield b

    picks = plain_candidates()
    heavy = next(picks)
    heavy["carrier"]["weight_in_lbs"] = 36000
    heavy["weighbridge"]["measured_weight_lbs"] = 40500
    heavy["weight_case"] = "heavy"
    empty = next(picks)
    empty["carrier"]["weight_in_lbs"] = 4400
    empty["carrier"]["current_status"] = "empty"
    empty["weighbridge"]["measured_weight_lbs"] = 41000
    empty["weight_case"] = "declared_empty"

    present = {b["number"] for b in boxes} | {c["number"] for c in fixed}
    for event in cfg.get("events", []):
        wanted = event.get("box")
        if wanted and wanted not in present:
            target_box = next(picks)
            target_box["number"] = wanted
            present.add(wanted)
    return boxes


class Clock:
    def __init__(self, start: datetime, minutes_per_second: float):
        self.anchor_sim = start
        self.anchor_real = time.monotonic()
        self.minutes_per_second = minutes_per_second

    def now(self) -> datetime:
        elapsed = time.monotonic() - self.anchor_real
        t = self.anchor_sim + timedelta(minutes=elapsed * self.minutes_per_second)
        return t.replace(microsecond=0)

    def set_now(self, t: datetime) -> None:
        self.anchor_sim = t
        self.anchor_real = time.monotonic()

    def set_speed(self, minutes_per_second: float) -> None:
        self.set_now(self.now())
        self.minutes_per_second = minutes_per_second


@dataclass
class BoxState:
    number: str
    live: bool
    synthetic: bool
    carrier: dict | None
    terminal: dict | None
    customs: dict | None
    weighbridge: dict | None
    reefer_model: ReeferModel | None
    appointment: dict | None
    weight_case: str | None = None
    live_sources: set[str] = field(default_factory=set)
    weight_asked: bool = False
    pending_release: bool = False
    decision: Decision | None = None
    signature: tuple | None = None
    planner: dict | None = None
    released_at: datetime | None = None
    demurrage_avoided: float = 0.0
    call: dict | None = None
    # Source name to the scenario time a judge last spoofed it.
    spoofed: dict[str, str] = field(default_factory=dict)

    def reefer_reading(self, now: datetime) -> dict | None:
        return self.reefer_model.reading(now) if self.reefer_model else None

    @property
    def equipment_type(self) -> str:
        return (self.carrier or {}).get("equipment_type") or ("reefer" if self.reefer_model else "dry")


def _signature(d: Decision) -> tuple:
    return (d.step, d.hand, tuple(d.fired), tuple(c.code for c in d.conflicts), d.owner)


class Scenario:
    def __init__(
        self,
        path: Path | None = None,
        minutes_per_second: float | None = None,
        audit: Audit | None = None,
    ):
        self.path = Path(path or config.SCENARIO_PATH)
        self.lock = threading.RLock()
        self.speed = config.MINUTES_PER_SECOND if minutes_per_second is None else minutes_per_second
        self.audit = audit or Audit(None)
        self.live_payload: tuple[dict, bool] | None = None
        self.resets = 0
        self.reset()

    def reset(self) -> None:
        with self.lock:
            self.audit.clear()
            cfg = load_config(self.path)
            self.cfg = cfg
            self.seed = int(cfg["seed"])
            self.start = parse_dt(cfg["clock_start"])
            self.tz = self.start.tzinfo
            term = cfg["terminal"]
            self.terminal_name = term["name"]
            self.lane_count = int(term["lanes"])
            self.windows = list(term["windows"])
            self.capacity = int(term["capacity_per_lane_hour"])
            self.mode = cfg.get("mode", "tuesday")
            self.lanes_closed: set[int] = set()
            self.dark_sources: dict[str, datetime] = {}
            self.events = sorted(
                ((self.start + parse_offset(e["t"]), i, e) for i, e in enumerate(cfg.get("events", []))),
                key=lambda x: (x[0], x[1]),
            )
            self.next_event = 0
            self.event_log: list[dict] = []
            self.twists: list[dict] = []
            self.gate_cache: tuple[tuple, list[Appt], Assignment, dict] | None = None
            self.boxes: dict[str, BoxState] = {}
            for c in list(cfg.get("containers", [])) + generate_synthetic(cfg):
                state = self._box_state(c)
                self.boxes[state.number] = state
            self.circuits: dict[str, list[BoxState]] = {}
            for state in sorted(self.boxes.values(), key=lambda s: s.number):
                if state.reefer_model and state.reefer_model.circuit:
                    self.circuits.setdefault(state.reefer_model.circuit, []).append(state)
            rated = cfg.get("rated_orders") or {}
            self.rated_on = False
            self.rated_deadline = self.start + parse_offset(rated["deadline"]) if rated.get("deadline") else None
            self.rated_boxes = [n for n in rated.get("boxes", []) if n in self.boxes] if self.rated_deadline else []
            self.rated_latest_window = self._latest_window(self.rated_deadline)
            self.clock = Clock(self.start, self.speed)
            self.now = self.start
            self.resets += 1
            if self.live_payload:
                self._overlay(*self.live_payload)
            self._advance_to(self.start)

    def _box_state(self, c: dict) -> BoxState:
        c = copy.deepcopy(c)
        appt = c.get("appointment")
        if appt:
            appt.setdefault("no_show", False)
            appt["at"] = iso(window_at(appt["window"], self.start))
        terminal = c.get("terminal")
        if terminal is not None:
            terminal.setdefault("holds", [])
        reefer = c.get("reefer")
        circuit = circuit_for((terminal or {}).get("location_at_pod_terminal"))
        return BoxState(
            number=c["number"],
            live=bool(c.get("live")),
            synthetic=bool(c.get("synthetic")),
            carrier=c.get("carrier"),
            terminal=terminal,
            customs=c.get("customs"),
            weighbridge=c.get("weighbridge"),
            reefer_model=reefer_model(c["number"], self.seed, reefer, parse_dt, circuit) if reefer else None,
            appointment=appt,
            weight_case=c.get("weight_case"),
        )

    def _latest_window(self, deadline: datetime | None) -> str | None:
        """The last window whose hour ends by the deadline, so a truck in it gates out in time."""
        if deadline is None:
            return None
        fits = [w for w in self.windows if window_at(w, self.start) + timedelta(hours=1) <= deadline]
        return fits[-1] if fits else None

    def is_rated(self, state: BoxState) -> bool:
        return self.rated_on and state.number in self.rated_boxes

    def circuit_peers(self, state: BoxState, now: datetime) -> tuple[dict, ...]:
        model = state.reefer_model
        if not model or not model.circuit:
            return ()
        peers = []
        for other in self.circuits.get(model.circuit, []):
            if other is state or other.released_at:
                continue
            reading = other.reefer_reading(now)
            peers.append({"number": other.number, "last_seen": reading["last_seen"], "comms_lost_at": reading["comms_lost_at"]})
        return tuple(peers)

    def box_view(self, state: BoxState, now: datetime | None = None, rated: bool | None = None) -> Box:
        now = now or self.now
        rated = self.is_rated(state) if rated is None else rated
        return Box(
            number=state.number,
            live=state.live,
            carrier=copy.deepcopy(state.carrier),
            terminal=copy.deepcopy(state.terminal),
            customs=copy.deepcopy(state.customs),
            weighbridge=weighbridge_reading(state.weighbridge),
            reefer=state.reefer_reading(now),
            appointment=copy.deepcopy(state.appointment),
            dark_sources=frozenset(self.dark_sources),
            lanes_closed=frozenset(self.lanes_closed),
            weight_asked=state.weight_asked,
            pending_release=state.pending_release,
            live_sources=frozenset(state.live_sources),
            call_outcome=(state.call or {}).get("outcome"),
            rated=iso(self.rated_deadline) if rated else None,
            circuit_peers=self.circuit_peers(state, now),
        )

    def advance(self) -> datetime:
        with self.lock:
            self._advance_to(max(self.now, self.clock.now()))
            return self.now

    def _advance_to(self, t: datetime) -> None:
        while self.next_event < len(self.events) and self.events[self.next_event][0] <= t:
            at, _, event = self.events[self.next_event]
            self.next_event += 1
            self.apply_event(event, at, scripted=True)
        self.now = t
        self.after_advance()

    def after_advance(self) -> None:
        for state in self.boxes.values():
            if state.released_at is None:
                self._evaluate(state)

    def _evaluate(self, state: BoxState) -> Decision:
        d = evaluate(self.box_view(state), self.now)
        sig = _signature(d)
        if sig != state.signature:
            previous = state.decision.step if state.decision else None
            self.audit.write(decision_line(d, iso(self.now), previous))
            if state.planner and state.planner["engine_step"] != d.step:
                state.planner = None
            state.signature = sig
        state.decision = d
        if d.step == "RELEASE":
            state.pending_release = self._truck_due(state)
        elif not ("R10" in d.fired and state.pending_release):
            state.pending_release = False
        return d

    def _truck_due(self, state: BoxState) -> bool:
        """Pending release means a RELEASE box whose truck is due, the same window urgency uses."""
        if not state.appointment:
            return False
        hours = hours_between(parse_dt(state.appointment["at"]), self.now)
        return -1 < hours <= 2

    def effective(self, state: BoxState) -> dict:
        d = state.decision
        step, hand, reason, owner = d.step, d.hand, d.reason, d.owner
        planner = state.planner
        if planner and planner["action"] == "override":
            step = planner["step"]
            hand = False
            reason = f"{reason} Planner override to {step}."
            if planner.get("note"):
                reason += f" Note: {planner['note']}"
            if step == "HOLD" and not owner:
                owner = "planner"
        if state.released_at:
            step = "RELEASE"
        return {
            "box": state.number,
            "step": step,
            "engine_step": d.step,
            "hand": hand,
            "urgency": d.urgency,
            "fired": d.fired,
            "conflicts": [c.code for c in d.conflicts],
            "trust": d.trust,
            "reason": reason,
            "owner": owner,
            "pinned": d.pinned,
            "planner": planner,
            "released_at": iso(state.released_at),
        }

    def planner_action(self, number: str, action: str, step: str | None, note: str) -> dict:
        with self.lock:
            self.advance()
            state = self.boxes.get(number)
            if state is None:
                raise KeyError(number)
            if state.released_at:
                raise ValueError("Box already released.")
            d = state.decision
            before = self.effective(state)["step"]
            if action == "approve":
                if d.step == "HAND":
                    raise ValueError("A HAND decision needs a step. Use override and pick one.")
                chosen = d.step
            else:
                if step not in STEPS:
                    raise ValueError("Override needs a step.")
                chosen = step
            overridden = chosen != d.step
            effect = self._act(state, chosen, d)
            self.audit.write(
                decision_line(
                    d,
                    iso(self.now),
                    before,
                    actor="planner",
                    step=chosen,
                    override=overridden,
                    note=note,
                    action=action,
                    effect=effect,
                )
            )
            if state.released_at is None:
                state.planner = {
                    "action": "override" if overridden else "approve",
                    "step": chosen,
                    "note": note,
                    "engine_step": d.step,
                    "at": iso(self.now),
                }
                self._evaluate(state)
            return self.effective(state)

    def _act(self, state: BoxState, step: str, d: Decision) -> str:
        if step == "RELEASE":
            state.released_at = self.now
            state.pending_release = False
            state.demurrage_avoided = self._demurrage_avoided(state)
            return "Released at the gate."
        if step == "ASK":
            if "C2" in [c.code for c in d.conflicts] or "R2" in d.fired:
                return self._repoll(state)
            if "C1" in [c.code for c in d.conflicts]:
                state.weight_asked = True
                return "Weight ask sent. Reweigh requested."
            if "R14" in d.fired and d.silence:
                return SILENT_ASK_EFFECT[d.silence["kind"]].format(circuit=d.silence["circuit"])
            return "Ask recorded."
        if step == "SLOW":
            return self._rebook(state)
        return f"{step} recorded."

    def _rebook(self, state: BoxState) -> str:
        """Approving SLOW books the box into the slot the optimizer planned for it."""
        appt = state.appointment
        if not appt:
            return "SLOW recorded. The box has no appointment."
        _, plan = self.gate_plan()
        slot = plan.placed.get(state.number)
        if slot is None:
            return "SLOW recorded. No open slot tonight, the box stays in overflow."
        if slot == (appt["lane"], appt["window"]):
            return "SLOW recorded. The box keeps its slot."
        old_lane, old_window = appt["lane"], appt["window"]
        appt["lane"], appt["window"] = slot
        appt["at"] = iso(window_at(slot[1], self.start))
        self.gate_cache = None
        return f"Moved from {old_window} lane {old_lane} to {slot[1]} lane {slot[0]}."

    def rated_info(self) -> dict:
        return {
            "available": bool(self.rated_boxes),
            "on": self.rated_on,
            "deadline": iso(self.rated_deadline),
            "latest_window": self.rated_latest_window,
            "boxes": list(self.rated_boxes),
        }

    def set_rated(self, on: bool) -> dict:
        with self.lock:
            if not self.rated_boxes:
                raise ValueError("scenario.json lists no rated orders.")
            self.advance()
            if self.rated_on != on:
                self.rated_on = on
                self.event_log.append(
                    {"at": iso(self.now), "offset": format_offset(self.now - self.start), "scripted": False, "type": "rated_orders", "on": on}
                )
                self.after_advance()
            return self.rated_info()

    def spoof(self, number: str, weight: int | None, hold: tuple[str, bool] | None) -> dict:
        """Judge input: a fake carrier weight or a hold toggle, then the engine re-evaluates the box."""
        with self.lock:
            self.advance()
            state = self.boxes.get(number)
            if state is None:
                raise KeyError(number)
            if state.released_at:
                raise ValueError("Box already released. Spoof a box that is still in the yard.")
            if weight is None and hold is None:
                raise ValueError("Send a carrier weight or a hold to spoof.")
            before = self.effective(state)
            stamp = iso(self.now)
            effects = []
            if weight is not None:
                if state.carrier is None:
                    state.carrier = {}
                old = state.carrier.get("weight_in_lbs")
                state.carrier["weight_in_lbs"] = weight
                state.carrier["observed_at"] = stamp
                state.spoofed["carrier"] = stamp
                was = f", was {say_lb(old)} lb" if old is not None else ""
                effects.append(f"Carrier weight set to {say_lb(weight)} lb{was}.")
            if hold is not None:
                name, on = hold
                source = "customs" if name in CUSTOMS_HOLD_NAMES else "terminal"
                stamp_field = "observed_at" if source == "customs" else "terminal_checked_at"
                if getattr(state, source) is None:
                    setattr(state, source, {"holds": [], stamp_field: stamp})
                label = HOLD_LABELS[name]
                if on:
                    hold_body = {"name": name, "status": "hold", "description": SPOOF_HOLD_TEXT[name]}
                    self.apply_event({"type": "hold_placed", "box": number, "hold": hold_body, "spoof": True}, self.now, scripted=False)
                    effects.append(f"{label} hold placed.")
                else:
                    present = any(h["name"] == name for h in getattr(state, source).get("holds", []))
                    self.apply_event({"type": "hold_cleared", "box": number, "name": name, "spoof": True}, self.now, scripted=False)
                    effects.append(f"{label} hold cleared." if present else f"No {label.lower()} hold to clear.")
                state.spoofed[source] = stamp
            d = self._evaluate(state)
            after = self.effective(state)
            effect = "Spoof input. " + " ".join(effects)
            self.audit.write(decision_line(d, stamp, before["step"], actor="spoof", step=after["step"], action="spoof", effect=effect))
            return {
                "effect": effect,
                "before": {"step": before["step"], "trust": before["trust"]},
                "after": {"step": after["step"], "trust": after["trust"]},
                "decision": after,
            }

    def call_variables(self, number: str) -> tuple[dict[str, str], str | None]:
        """Retell dynamic variables, all strings, and the trucker phone for a phone call."""
        with self.lock:
            state = self.boxes.get(number)
            if state is None:
                raise KeyError(number)
            if state.released_at:
                raise ValueError("Box already released. There is nobody to ask.")
            appt = state.appointment or {}
            weigh = weighbridge_reading(state.weighbridge) or {}
            manifest = (state.carrier or {}).get("weight_in_lbs")
            measured = weigh.get("measured_weight_lbs")
            variables = {
                "container_number": number,
                "manifest_weight_lbs": str(int(manifest)) if manifest is not None else "unknown",
                "measured_weight_lbs": str(int(measured)) if measured is not None else "unknown",
                "appointment_time": appt.get("window", "unknown"),
                "trucker_name": trucker_name(number),
                "dray_carrier": appt.get("dray_carrier", "unknown"),
            }
            return variables, appt.get("trucker_phone")

    def call_active(self, number: str) -> bool:
        call = (self.boxes[number].call or {}) if number in self.boxes else {}
        return bool(call) and (call.get("outcome") is None or call.get("status") not in CALL_FINAL)

    def call_started(self, number: str, info: dict, variables: dict[str, str]) -> dict:
        with self.lock:
            self.advance()
            state = self.boxes[number]
            before = self.effective(state)["step"]
            state.weight_asked = True
            state.call = {
                "call_id": info["call_id"],
                "mode": info["mode"],
                "mock": bool(info.get("mock")),
                "status": "registered",
                "started_at": iso(self.now),
                "started_wall": time.time(),
                "trucker_name": variables["trucker_name"],
                "dray_carrier": variables["dray_carrier"],
                "transcript": [],
                "outcome": None,
                "callback_needed": None,
                "notes": "",
                "source": None,
                "recorded_at": None,
            }
            d = self._evaluate(state)
            kind = "Phone" if info["mode"] == "phone" else "Web"
            mock = " Simulated, no Retell key." if info.get("mock") else ""
            self.audit.write(
                decision_line(
                    d,
                    iso(self.now),
                    before,
                    actor="voice",
                    step="ASK",
                    action="call",
                    call_id=info["call_id"],
                    outcome=None,
                    effect=f"{kind} call {info['call_id']} started to {variables['trucker_name']} of {variables['dray_carrier']}.{mock}",
                )
            )
            return dict(state.call)

    def call_update(self, number: str, call_id: str, status: str, transcript: list[dict]) -> None:
        with self.lock:
            state = self.boxes.get(number)
            if not state or not state.call or state.call["call_id"] != call_id:
                return
            state.call["status"] = status
            if transcript:
                state.call["transcript"] = transcript

    def record_call(self, number: str, call_id: str | None, analysis: dict, source: str) -> dict:
        """Apply the call outcome, re-evaluate the box, and write the audit line with the call id."""
        outcome = analysis.get("outcome") if analysis.get("outcome") in CALL_OUTCOMES else "unknown"
        with self.lock:
            self.advance()
            state = self.boxes.get(number)
            if state is None:
                raise KeyError(number)
            call = state.call
            if call is None or (call_id and call["call_id"] != call_id):
                call = state.call = {
                    "call_id": call_id or "unknown",
                    "mode": "phone",
                    "mock": False,
                    "status": "ended",
                    "started_at": iso(self.now),
                    "started_wall": time.time(),
                    "trucker_name": trucker_name(number),
                    "dray_carrier": (state.appointment or {}).get("dray_carrier", "unknown"),
                    "transcript": [],
                    "outcome": None,
                    "callback_needed": None,
                    "notes": "",
                    "source": None,
                    "recorded_at": None,
                }
            if call["outcome"] == outcome:
                return self.effective(state)
            before = self.effective(state)["step"]
            call.update(
                outcome=outcome,
                callback_needed=bool(analysis.get("callback_needed")),
                notes=str(analysis.get("notes") or ""),
                source=source,
                recorded_at=iso(self.now),
            )
            state.weight_asked = True
            d = self._evaluate(state)
            self.audit.write(
                decision_line(
                    d,
                    iso(self.now),
                    before,
                    actor="voice",
                    action="call_outcome",
                    call_id=call["call_id"],
                    outcome=outcome,
                    callback_needed=call["callback_needed"],
                    note=call["notes"],
                    effect=CALL_EFFECTS[outcome],
                )
            )
            return self.effective(state)

    def active_calls(self) -> list[tuple[str, dict]]:
        """Calls still owed a transcript or an outcome. A record function can land the outcome mid call."""
        with self.lock:
            return [
                (s.number, dict(s.call))
                for s in self.boxes.values()
                if s.call and (s.call["outcome"] is None or s.call["status"] not in CALL_FINAL)
            ]

    def _repoll(self, state: BoxState) -> str:
        if "terminal" in self.dark_sources:
            return "Terminal feed is dark. Poll returned nothing."
        if state.live:
            return "Live record polls again on the next Terminal49 cycle."
        holds = (state.customs or {}).get("holds", []) + (state.terminal or {}).get("holds", [])
        active = any(h.get("status") == "hold" for h in holds)
        state.terminal["available_for_pickup"] = not active
        state.terminal["terminal_checked_at"] = iso(self.now)
        return "Terminal record polled again."

    def _demurrage_avoided(self, state: BoxState) -> float:
        terminal = state.terminal or {}
        lfd = parse_date(terminal.get("pickup_lfd"))
        accruing = any(f.get("type") == "demurrage" and f.get("amount", 0) > 0 for f in terminal.get("fees_at_pod_terminal") or [])
        near = lfd is not None and hours_between(lfd_deadline(lfd, self.tz), self.now) <= 24
        return float(daily_demurrage(state.equipment_type)) if (accruing or near) else 0.0

    def open_windows(self) -> list[str]:
        """Windows whose hour has not ended. Ended windows take no more trucks."""
        return [w for w in self.windows if window_at(w, self.start) + timedelta(hours=1) > self.now]

    def lfd_today(self, state: BoxState) -> bool:
        lfd = parse_date((state.terminal or {}).get("pickup_lfd"))
        return lfd is not None and lfd <= self.now.date()

    def gate_rows(self) -> list[Appt]:
        windows = set(self.open_windows())
        rows = []
        for s in self.boxes.values():
            if s.released_at or not s.appointment or not s.decision or s.appointment["window"] not in windows:
                continue
            eff = self.effective(s)
            rated = self.is_rated(s)
            rows.append(
                Appt(
                    box=s.number,
                    lane=int(s.appointment["lane"]),
                    window=s.appointment["window"],
                    urgency=eff["urgency"],
                    step=eff["step"],
                    reefer=s.equipment_type == "reefer",
                    lfd_today=self.lfd_today(s),
                    rated=rated,
                    latest_window=self.rated_latest_window if rated else None,
                )
            )
        return rows

    def _unrated(self, row: Appt) -> Appt:
        """The same row as it would be with rated order mode off. Rated boxes lose the bonus and the deadline."""
        if not row.rated:
            return row
        state = self.boxes[row.box]
        base = evaluate(self.box_view(state, rated=False), self.now)
        step = row.step if state.planner and state.planner["action"] == "override" else base.step
        return Appt(row.box, row.lane, row.window, base.urgency, step, row.reefer, row.lfd_today)

    def missed(self) -> list[str]:
        windows = set(self.open_windows())
        return sorted(
            s.number for s in self.boxes.values() if s.appointment and not s.released_at and s.appointment["window"] not in windows
        )

    def gate_plan(self) -> tuple[list[Appt], Assignment]:
        rows = self.gate_rows()
        windows = self.open_windows()
        lanes = self.lanes_open()
        sig = (tuple(lanes), tuple(windows), tuple(sorted(rows, key=lambda a: a.box)))
        if self.gate_cache and self.gate_cache[0] == sig:
            return self.gate_cache[1], self.gate_cache[2]
        plan = solve(rows, lanes, windows, self.capacity)
        slid: dict[str, tuple[int, str]] = {}
        if any(a.rated for a in rows):
            baseline = solve([self._unrated(a) for a in rows], lanes, windows, self.capacity)
            slid = {box: baseline.placed[box] for box in plan.overflow if box in baseline.placed}
        self.gate_cache = (sig, rows, plan, slid)
        return rows, plan

    def gate_slid(self) -> dict[str, tuple[int, str]]:
        """Overflow boxes that held a slot in the plan without rated orders, and the slot they lost."""
        self.gate_plan()
        return self.gate_cache[3]

    def set_lane(self, lane: int, open_: bool) -> dict:
        if not 1 <= lane <= self.lane_count:
            raise ValueError(f"Lane {lane} does not exist. Pier 7 has lanes 1 to {self.lane_count}.")
        return self.post_event({"type": "lanes_up" if open_ else "lanes_down", "lanes": [lane]})

    def _past_limit(self, reading: dict) -> bool:
        return reading["product_temp_c"] >= loss_limit_c(reading["set_point_c"])

    def counters(self) -> dict:
        released = [s for s in self.boxes.values() if s.released_at]
        powered = lost = 0
        for s in self.boxes.values():
            if not s.reefer_model:
                continue
            if s.released_at:
                # A released reefer rides out on the truck genset, so it counts as powered from then on.
                powered += 1
                lost += self._past_limit(s.reefer_reading(s.released_at))
                continue
            reading = s.reefer_reading(self.now)
            powered += bool(reading["power_on"])
            lost += self._past_limit(reading)
        rows, plan = self.gate_plan()
        kept = [a for a in rows if a.box in plan.placed and a.step != "HOLD"]
        return {
            "released": len(released),
            "released_blunt": 0,
            "reefers_powered": powered,
            "reefers_lost": lost,
            "demurrage_avoided_usd": round(sum(s.demurrage_avoided for s in released)),
            "throughput_pct": round(100 * len(kept) / len(rows)) if rows else 0,
        }

    def counters_blunt(self) -> dict:
        """The blunt move: close the terminal. Nothing gates out, so every reefer stays in the yard."""
        powered = lost = 0
        for s in self.boxes.values():
            if s.reefer_model:
                reading = s.reefer_reading(self.now)
                powered += bool(reading["power_on"])
                lost += self._past_limit(reading)
        return {"released": 0, "reefers_powered": powered, "reefers_lost": lost, "demurrage_avoided_usd": 0, "throughput_pct": 0}

    def apply_live(self, payload: dict, live: bool) -> int:
        with self.lock:
            self.live_payload = (payload, live)
            count = self._overlay(payload, live)
            self.after_advance()
            return count

    def _overlay(self, payload: dict, live: bool) -> int:
        count = 0
        for resource in payload.get("data") or []:
            mapped = map_container(resource, iso(self.now))
            if not mapped:
                continue
            state = self.boxes.get(mapped["number"])
            if state is None:
                state = self._box_state({"number": mapped["number"], "live": live})
                self.boxes[state.number] = state
            for name in ("carrier", "terminal", "customs"):
                setattr(state, name, mapped[name])
            state.live = live
            state.live_sources = {"carrier", "terminal", "customs"} if live else set()
            count += 1
        return count

    def jump(self, t: str) -> None:
        with self.lock:
            target = self.start + parse_offset(t)
            if target < self.now:
                self.reset()
            self.clock.set_now(target)
            self._advance_to(target)

    def set_speed(self, minutes_per_second: float) -> None:
        with self.lock:
            self.advance()
            self.speed = minutes_per_second
            self.clock.set_speed(minutes_per_second)

    def post_event(self, event: dict) -> dict:
        with self.lock:
            self.advance()
            entry = self.apply_event(event, self.now, scripted=False)
            self.after_advance()
            return entry

    def apply_event(self, event: dict, at: datetime, scripted: bool) -> dict:
        kind = event.get("type")
        if kind not in EVENT_TYPES:
            raise ValueError(f"Unknown event type {kind}")
        entry = {"at": iso(at), "offset": format_offset(at - self.start), "scripted": scripted, **event}
        box = self.boxes.get(event.get("box", ""))
        if event.get("box") and box is None:
            entry["ignored"] = "unknown box"
        elif kind == "mode":
            self.mode = event["mode"]
        elif kind == "lanes_down":
            self.lanes_closed |= {int(x) for x in event["lanes"]}
        elif kind == "lanes_up":
            self.lanes_closed -= {int(x) for x in event["lanes"]}
        elif kind == "hold_placed":
            hold = dict(event["hold"])
            target = box.customs if hold["name"] in CUSTOMS_HOLD_NAMES else box.terminal
            stamp = "observed_at" if target is box.customs else "terminal_checked_at"
            target["holds"] = [h for h in target.get("holds", []) if h["name"] != hold["name"]] + [hold]
            target[stamp] = iso(at)
        elif kind == "hold_cleared":
            name = (event.get("hold") or {}).get("name") or event.get("name")
            for target, stamp in ((box.customs, "observed_at"), (box.terminal, "terminal_checked_at")):
                if target and any(h["name"] == name for h in target.get("holds", [])):
                    target["holds"] = [h for h in target["holds"] if h["name"] != name]
                    target[stamp] = iso(at)
        elif kind in ("reefer_power_off", "reefer_power_on", "reefer_silent"):
            model = box.reefer_model
            if model is None:
                entry["ignored"] = "not a reefer"
            elif kind == "reefer_power_off" and not model.set_power(at, False):
                entry["ignored"] = "power already in that state"
            elif kind == "reefer_power_on" and not model.restore(at):
                entry["ignored"] = "power already in that state"
            elif kind == "reefer_silent":
                alarm = event.get("alarm")
                if not (model.fail(at, str(alarm)) if alarm else model.go_silent(at)):
                    entry["ignored"] = "already silent"
        elif kind == "circuit_trip":
            circuit = str(event.get("circuit") or "")
            members = [s for s in self.circuits.get(circuit, []) if not s.released_at]
            tripped = [s.number for k, s in enumerate(members) if s.reefer_model.trip(at, at + k * TRIP_STAGGER)]
            entry["boxes"] = tripped
            if not members:
                entry["ignored"] = "no reefers on that circuit"
            elif not tripped:
                entry["ignored"] = "circuit already tripped"
        elif kind == "source_dark":
            self.dark_sources.setdefault(event["source"], at)
        elif kind == "source_back":
            self.dark_sources.pop(event["source"], None)
        elif kind == "fee_increase":
            fee = event.get("fee") or {"type": "demurrage", "amount": event.get("amount", 0), "currency_code": "USD"}
            fees = box.terminal.setdefault("fees_at_pod_terminal", [])
            match = next((f for f in fees if f["type"] == fee["type"]), None)
            if match:
                match["amount"] = match["amount"] + fee["amount"]
            else:
                fees.append(dict(fee))
        elif kind == "twist":
            self.twists.append(
                {
                    "tag": event.get("tag"),
                    "note": event.get("note", ""),
                    "received_at": iso(at),
                    "received_wall": iso(datetime.now().astimezone()),
                    "added": [],
                    "merged_at": None,
                }
            )
        self.event_log.append(entry)
        return entry

    def scripted_events(self) -> list[dict]:
        return [
            {**event, "at": iso(at), "fired": idx < self.next_event}
            for idx, (at, _, event) in enumerate(self.events)
        ]

    def carriers(self) -> list[str]:
        return sorted({b.appointment["dray_carrier"] for b in self.boxes.values() if b.appointment})

    def lanes_open(self) -> list[int]:
        return [lane for lane in range(1, self.lane_count + 1) if lane not in self.lanes_closed]
