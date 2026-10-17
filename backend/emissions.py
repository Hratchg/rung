"""Truck idle time at the gate and the CO2 it costs.

Each booked truck reaches the gate at the start of the window it was first booked for, and idles in the
queue until it gets through or gives up. It gets through at the start of the slot the gate plan gives it.
A truck with no slot tonight (overflow) or on HOLD idles until it is turned away. A truck waiting on a
dark feed counts only the minutes it has already waited, because nobody knows when the feed returns.
Every wait is capped at IDLE_LIMIT_H. Everything here is pure: no clock reads and no shared state.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .timefmt import hours_between

# DOE Vehicle Technologies Office and Argonne National Laboratory, "Long-Haul Truck Idling Burns Up Profits"
# (2015): "Idling a heavy-duty truck consumes about 0.8 gallon of fuel per hour."
# https://afdc.energy.gov/files/u/publication/hdv_idling_2015.pdf
IDLE_GALLONS_PER_HOUR = 0.8
# EPA, "Greenhouse Gas Emissions from a Typical Passenger Vehicle" (EPA-420-F-18-008): 10,180 grams of CO2 per
# gallon of diesel, the factor from 40 CFR 600.113.
# https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
KG_CO2_PER_GALLON_DIESEL = 10.180
# The one factor every idle number in Rung uses, 8.144 kg CO2 per truck idle hour. EPA and ORNL measured
# 8.224 kg CO2 an hour on nine idling Class 8 trucks (SAE 2003-01-0288), a close cross check.
KG_CO2_PER_IDLE_HOUR = IDLE_GALLONS_PER_HOUR * KG_CO2_PER_GALLON_DIESEL
# A truck idles at most one appointment window at the gate, then it is turned away. That is the same hour
# after which the scenario stops counting a truck as due at the gate.
IDLE_LIMIT_H = 1.0

SOURCES = (
    {
        "label": "DOE and Argonne National Laboratory, Long-Haul Truck Idling Burns Up Profits, 2015. About 0.8 gallon of diesel per idle hour",
        "url": "https://afdc.energy.gov/files/u/publication/hdv_idling_2015.pdf",
    },
    {
        "label": "EPA, Greenhouse Gas Emissions from a Typical Passenger Vehicle. 10,180 grams of CO2 per gallon of diesel",
        "url": "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
    },
)

CAUSES = ("kept", "moved", "overflow", "hold", "dark")


def co2_kg(hours: float) -> float:
    return hours * KG_CO2_PER_IDLE_HOUR


@dataclass(frozen=True)
class Idle:
    """One truck's idle tonight. arrive is the start of its booked window. hours is the whole wait, capped."""

    arrive: datetime
    hours: float
    cause: str
    slot: tuple[int, str] | None = None
    settled: bool = False

    def so_far(self, now: datetime) -> float:
        """The part of the wait already spent by now. The wait runs from arrive."""
        return min(self.hours, max(0.0, hours_between(now, self.arrive)))

    def settle(self, hours: float | None = None) -> Idle:
        """Freeze the wait once the truck has gone or its window has ended."""
        return Idle(self.arrive, self.hours if hours is None else hours, self.cause, self.slot, True)


def truck_idle(
    arrive: datetime,
    slot_at: datetime | None,
    held: bool,
    dark_since: datetime | None,
    now: datetime,
) -> tuple[float, str]:
    """Hours one truck idles at the gate tonight, and why.

    arrive: start of the window it was booked for. slot_at: start of the slot the gate plan gives it, None for
    no slot. held: the box is on HOLD. dark_since: when a feed it waits on went dark, None when it waits on none.
    """
    if held:
        return IDLE_LIMIT_H, "hold"
    if slot_at is None:
        return IDLE_LIMIT_H, "overflow"
    wait = max(0.0, hours_between(slot_at, arrive))
    cause = "moved" if wait > 0 else "kept"
    if dark_since is not None:
        stuck = max(0.0, hours_between(now, max(slot_at, dark_since)))
        if stuck > 0:
            wait, cause = wait + stuck, "dark"
    return min(wait, IDLE_LIMIT_H), cause


def blunt_idle(arrivals: list[datetime], now: datetime) -> float:
    """Idle so far if the terminal closes without a new plan: every booked truck waits out the limit."""
    return sum(Idle(a, IDLE_LIMIT_H, "overflow").so_far(now) for a in arrivals)
