"""Simulated weighbridge and reefer readings.

Reefer units report hourly with a 10 percent dropout, plus an immediate alarm
reading whenever power changes. Temperatures follow first order curves toward
20 C after power loss and back toward the set point when power returns.
"""
from __future__ import annotations

import math
import random
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
    changes: list[tuple[datetime, bool]] = field(default_factory=list)

    @property
    def kind(self) -> str:
        return cargo_kind(self.set_point_c)

    def power_at(self, t: datetime) -> bool:
        power = self.power0
        for at, on in self.changes:
            if at <= t:
                power = on
        return power

    def set_power(self, at: datetime, on: bool) -> bool:
        if self.power_at(at) == on:
            return False
        self.changes.append((at, on))
        self.changes.sort(key=lambda c: c[0])
        return True

    def state_at(self, t: datetime) -> tuple[float, float, bool]:
        air, product, power = self.air0, self.product0, self.power0
        cursor = self.t0
        for at, on in self.changes:
            if at > t:
                break
            if at > cursor:
                air, product = _evolve(air, product, power, (at - cursor).total_seconds() / 3600, self)
                cursor = at
            power = on
        if t > cursor:
            air, product = _evolve(air, product, power, (t - cursor).total_seconds() / 3600, self)
        return air, product, power

    def dropped(self, k: int) -> bool:
        return random.Random(f"{self.seed}:{self.number}:{k}").random() < DROPOUT

    def last_report(self, now: datetime) -> datetime:
        latest = self.t0
        k = int((now - self.t0) / REPORT_EVERY)
        for i in range(k, max(0, k - 72), -1):
            if i >= 1 and not self.dropped(i):
                latest = self.t0 + i * REPORT_EVERY
                break
        for at, _ in self.changes:
            if latest < at <= now:
                latest = at
        return latest

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
        }

    def power_off_since(self, now: datetime) -> datetime | None:
        if self.power_at(now):
            return None
        since = self.t0
        for at, on in self.changes:
            if at <= now and not on:
                since = at
        return since


WARMUP_NOTES = {
    "frozen": "CSIRO 2007. Frozen cargo takes about 19 hours to warm from minus 18 C to minus 10 C with the power off.",
    "chilled": "Assumption. Chilled cargo warms with a 6 hour time constant. This is not a CSIRO figure.",
    "produce": "Assumption. Produce warms with a 6 hour time constant. This is not a CSIRO figure.",
}


def loss_limit_c(set_point_c: float) -> float:
    """Product temperature at which the load counts as lost: 8 C over for frozen, 4 C over otherwise."""
    return set_point_c + (8.0 if cargo_kind(set_point_c) == "frozen" else 4.0)


def warmup(model: ReeferModel, now: datetime) -> dict:
    """Warm up clock in scenario hours, projected from the power loss on the model curve."""
    kind = model.kind
    limit = loss_limit_c(model.set_point_c)
    since = model.power_off_since(now)
    out = {"kind": kind, "limit_c": limit, "note": WARMUP_NOTES[kind], "power_on": since is None}
    if since is None:
        return {**out, "off_since": None, "hours_off": 0.0, "limit_at": None, "hours_left": None}
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


def reefer_model(number: str, seed: int, reading: dict, parse) -> ReeferModel:
    return ReeferModel(
        number=number,
        seed=seed,
        set_point_c=float(reading["set_point_c"]),
        cargo=reading.get("cargo", ""),
        t0=parse(reading["last_seen"]),
        air0=float(reading["air_temp_c"]),
        product0=float(reading["product_temp_c"]),
        power0=bool(reading["power_on"]),
    )


def weighbridge_reading(stored: dict | None) -> dict | None:
    """Weighbridge readings are single measurements. A reweigh replaces the stored dict."""
    return dict(stored) if stored else None
