"""Simulated weighbridge and reefer readings.

Reefer units report hourly with a 10 percent dropout, plus an immediate alarm
reading whenever power changes. Temperatures follow first order curves toward
20 C whenever the unit is not cooling and back toward the set point when it is.

A unit can also go silent: the monitoring system loses contact and hears no
readings until power is restored. A tripped circuit cuts power and contact to
every unit on it, a telemetry fault cuts contact only, and a failed unit sends
one alarm reading, stops cooling, and then goes silent.
"""
from __future__ import annotations

import math
import random
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .timefmt import iso

AMBIENT_C = 20.0
AIR_TAU_H = 2.0
AIR_RECOVERY_TAU_H = 0.5
AIR_OFFSET_POWERED_C = 0.3
# CSIRO 2007: frozen cargo takes about 19 h to go from -18 C to -10 C toward 20 C ambient.
FROZEN_TAU_H = 19 / math.log((AMBIENT_C + 18) / (AMBIENT_C + 10))
# Assumption: chilled and produce cargo use a 6 h product time constant.
CHILLED_TAU_H = 6.0
REPORT_EVERY = timedelta(hours=1)
DROPOUT = 0.10
# Typical running draw per cargo kind. A healthy unit stays inside the band.
NORMAL_DRAW_KW = {"frozen": 6.0, "chilled": 4.5, "produce": 3.5}
DRAW_BAND_KW = (2.0, 8.0)
# A failed compressor leaves only the fans and controller running.
FAULT_DRAW_KW = 0.4
ROWS_PER_CIRCUIT = 5


def circuit_for(location: str | None) -> str | None:
    """Reefer racks sit in yard rows R-{row}-{slot}. Five rows share one circuit, so rows 1 to 5 are circuit R1."""
    match = re.match(r"^R-(\d+)-\d+$", location or "")
    if not match:
        return None
    return f"R{(int(match.group(1)) - 1) // ROWS_PER_CIRCUIT + 1}"


def cargo_kind(set_point_c: float) -> str:
    if set_point_c <= -10:
        return "frozen"
    if set_point_c < 5:
        return "chilled"
    return "produce"


def product_tau_h(kind: str) -> float:
    return FROZEN_TAU_H if kind == "frozen" else CHILLED_TAU_H


@dataclass
class ReeferModel:
    number: str
    seed: int
    set_point_c: float
    cargo: str
    t0: datetime
    air0: float
    product0: float
    power0: bool
    circuit: str | None = None
    changes: list[tuple[datetime, bool]] = field(default_factory=list)
    # Immediate readings outside the hourly cadence, such as the alarm sent when power changes.
    reports: list[datetime] = field(default_factory=list)
    # Periods with no contact, [start, end) with end None while still silent.
    silences: list[list] = field(default_factory=list)
    # Unit faults, [start, end, alarm text]. A faulted unit has power but does not cool.
    faults: list[list] = field(default_factory=list)

    @property
    def kind(self) -> str:
        return cargo_kind(self.set_point_c)

    def power_at(self, t: datetime) -> bool:
        power = self.power0
        for at, on in self.changes:
            if at <= t:
                power = on
        return power

    def fault_at(self, t: datetime) -> str | None:
        for start, end, alarm in self.faults:
            if start <= t and (end is None or t < end):
                return alarm
        return None

    def cooling_at(self, t: datetime) -> bool:
        return self.power_at(t) and self.fault_at(t) is None

    def silent_since(self, t: datetime) -> datetime | None:
        """Start of the silence covering t. The reading that opens a silence is still heard."""
        for start, end in self.silences:
            if start < t and (end is None or t < end):
                return start
        return None

    def set_power(self, at: datetime, on: bool, report: bool = True) -> bool:
        if self.power_at(at) == on:
            return False
        self.changes.append((at, on))
        self.changes.sort(key=lambda c: c[0])
        if report:
            self.reports.append(at)
        return True

    def go_silent(self, at: datetime) -> bool:
        """Telemetry fault: contact is lost and the unit keeps cooling."""
        if self.silent_since(at + timedelta(seconds=1)):
            return False
        self.silences.append([at, None])
        return True

    def fail(self, at: datetime, alarm: str) -> bool:
        """Unit failure: one alarm reading at the moment it fails, then silence. Cooling stops."""
        if self.silent_since(at + timedelta(seconds=1)):
            return False
        self.faults.append([at, None, alarm])
        self.reports.append(at)
        self.silences.append([at, None])
        return True

    def trip(self, at: datetime, silent_at: datetime) -> bool:
        """Tripped circuit: power goes with no alarm reading, and contact drops as the rack loses power."""
        if self.silent_since(silent_at + timedelta(seconds=1)):
            return False
        self.set_power(at, False, report=False)
        self.silences.append([silent_at, None])
        return True

    def restore(self, at: datetime) -> bool:
        """Power back on. Contact returns, a faulted unit is reset, and the unit reports at once."""
        changed = False
        for period in self.silences:
            if period[1] is None and period[0] <= at:
                period[1] = at
                changed = True
        for fault in self.faults:
            if fault[1] is None and fault[0] <= at:
                fault[1] = at
                changed = True
        if self.set_power(at, True):
            return True
        if changed:
            self.reports.append(at)
        return changed

    def _cooling_points(self) -> list[datetime]:
        points = {at for at, _ in self.changes}
        for start, end, _ in self.faults:
            points.add(start)
            if end is not None:
                points.add(end)
        return sorted(points)

    def state_at(self, t: datetime) -> tuple[float, float, bool]:
        air, product, cooling = self.air0, self.product0, self.power0
        cursor = self.t0
        for at in self._cooling_points():
            if at > t:
                break
            if at > cursor:
                air, product = _evolve(air, product, cooling, (at - cursor).total_seconds() / 3600, self)
                cursor = at
            cooling = self.cooling_at(at)
        if t > cursor:
            air, product = _evolve(air, product, cooling, (t - cursor).total_seconds() / 3600, self)
        return air, product, self.power_at(t)

    def dropped(self, k: int) -> bool:
        return random.Random(f"{self.seed}:{self.number}:{k}").random() < DROPOUT

    def last_report(self, now: datetime) -> datetime:
        latest = self.t0
        k = int((now - self.t0) / REPORT_EVERY)
        for i in range(k, max(0, k - 72), -1):
            at = self.t0 + i * REPORT_EVERY
            if i >= 1 and not self.dropped(i) and not self.silent_since(at):
                latest = at
                break
        for at in self.reports:
            if latest < at <= now and not self.silent_since(at):
                latest = at
        return latest

    def normal_draw_kw(self) -> float:
        jitter = random.Random(f"{self.seed}:{self.number}:draw").uniform(-0.3, 0.3)
        return round(NORMAL_DRAW_KW[self.kind] + jitter, 1)

    def draw_at(self, t: datetime) -> float:
        if not self.power_at(t):
            return 0.0
        if self.fault_at(t):
            return FAULT_DRAW_KW
        return self.normal_draw_kw()

    def alarm_at(self, t: datetime) -> str | None:
        fault = self.fault_at(t)
        if fault:
            return fault
        return None if self.power_at(t) else "power off"

    def reading(self, now: datetime) -> dict:
        seen = self.last_report(now)
        air, product, power = self.state_at(seen)
        return {
            "set_point_c": self.set_point_c,
            "air_temp_c": round(air, 1),
            "product_temp_c": round(product, 1),
            "power_on": power,
            "last_seen": iso(seen),
            "cargo": self.cargo,
            "circuit": self.circuit,
            "draw_kw": self.draw_at(seen),
            "alarm": self.alarm_at(seen),
            "comms_lost_at": iso(self.silent_since(now)),
        }

    def not_cooling_since(self, t: datetime) -> tuple[datetime, str] | None:
        """When the unit stopped cooling as of time t, and why: power or fault."""
        if self.cooling_at(t):
            return None
        since = self.t0
        for at in self._cooling_points():
            if at > t:
                break
            if not self.cooling_at(at) and (at == self.t0 or self.cooling_at(at - timedelta(seconds=1))):
                since = at
        return since, ("fault" if self.fault_at(t) else "power")

    def power_off_since(self, now: datetime) -> datetime | None:
        found = self.not_cooling_since(now)
        return found[0] if found else None


WARMUP_NOTES = {
    "frozen": "CSIRO 2007. Frozen cargo takes about 19 hours to warm from minus 18 C to minus 10 C with the power off.",
    "chilled": "Assumption. Chilled cargo warms with a 6 hour time constant. This is not a CSIRO figure.",
    "produce": "Assumption. Produce warms with a 6 hour time constant. This is not a CSIRO figure.",
}


def loss_limit_c(set_point_c: float) -> float:
    """Product temperature at which the load counts as lost: 8 C over for frozen, 4 C over otherwise."""
    return set_point_c + (8.0 if cargo_kind(set_point_c) == "frozen" else 4.0)


def warmup(model: ReeferModel, now: datetime) -> dict:
    """Warm up clock in scenario hours, projected on the model curve from the moment cooling stopped.

    It starts from what the last heard reading showed, so a silent unit never leaks a power loss nobody saw.
    """
    kind = model.kind
    limit = loss_limit_c(model.set_point_c)
    found = model.not_cooling_since(model.last_report(now))
    out = {
        "kind": kind,
        "limit_c": limit,
        "note": WARMUP_NOTES[kind],
        "power_on": found is None,
        "cause": found[1] if found else None,
        "silent_since": iso(model.silent_since(now)),
    }
    if found is None:
        return {**out, "off_since": None, "hours_off": 0.0, "limit_at": None, "hours_left": None}
    since = found[0]
    _, product0, _ = model.state_at(since)
    tau = product_tau_h(kind)
    if product0 >= limit:
        reach_h = 0.0
    else:
        reach_h = tau * math.log((AMBIENT_C - product0) / (AMBIENT_C - limit))
    limit_at = since + timedelta(hours=reach_h)
    return {
        **out,
        "off_since": iso(since),
        "hours_off": round((now - since).total_seconds() / 3600, 2),
        "limit_at": iso(limit_at.replace(microsecond=0)),
        "hours_left": round(max(0.0, (limit_at - now).total_seconds() / 3600), 2),
    }


def _evolve(air: float, product: float, power: bool, dt_h: float, model: ReeferModel) -> tuple[float, float]:
    tau_p = product_tau_h(model.kind)
    if power:
        air_target = model.set_point_c + AIR_OFFSET_POWERED_C
        air = air_target + (air - air_target) * math.exp(-dt_h / AIR_RECOVERY_TAU_H)
        product = model.set_point_c + (product - model.set_point_c) * math.exp(-dt_h / tau_p)
    else:
        air = AMBIENT_C + (air - AMBIENT_C) * math.exp(-dt_h / AIR_TAU_H)
        product = AMBIENT_C + (product - AMBIENT_C) * math.exp(-dt_h / tau_p)
    return air, product


def reefer_model(number: str, seed: int, reading: dict, parse, circuit: str | None = None) -> ReeferModel:
    return ReeferModel(
        number=number,
        seed=seed,
        set_point_c=float(reading["set_point_c"]),
        cargo=reading.get("cargo", ""),
        t0=parse(reading["last_seen"]),
        air0=float(reading["air_temp_c"]),
        product0=float(reading["product_temp_c"]),
        power0=bool(reading["power_on"]),
        circuit=reading.get("circuit") or circuit,
    )


def weighbridge_reading(stored: dict | None) -> dict | None:
    """Weighbridge readings are single measurements. A reweigh replaces the stored dict."""
    return dict(stored) if stored else None
