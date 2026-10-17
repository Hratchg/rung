"""Gate re-slotting optimizer.

solve() places appointments into slot units (lane, window, k) over open lanes with
scipy's linear_sum_assignment, falling back to a greedy urgency sort if the solver fails.
Protected boxes (reefers, last free day boxes, and rated orders, none on HOLD) are solved first,
then the rest take the units left. Pairs that carry the penalty are never kept, so HOLD boxes go to
held and boxes with no feasible unit go to overflow. A rated order may not take a window later than
its latest window, the last one that gates out before its deadline. It is pure: no clock reads and no shared state.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment

PENALTY = 1e6
# Tie break so a box keeps its own lane when another lane in the same window costs the same.
# Small enough that it can never outweigh one hour of delay summed over every appointment.
LANE_CHANGE_COST = 1e-4


@dataclass(frozen=True)
class Appt:
    box: str
    lane: int
    window: str
    urgency: int
    step: str = "RELEASE"
    reefer: bool = False
    lfd_today: bool = False
    rated: bool = False
    latest_window: str | None = None


@dataclass
class Move:
    box: str
    old_lane: int
    old_window: str
    new_lane: int
    new_window: str
    delay_hours: float
    reason: str


@dataclass
class Assignment:
    placed: dict[str, tuple[int, str]]
    overflow: list[str]
    moved: list[Move]
    solve_ms: float
    solver: str = "linear_sum_assignment"
    error: str | None = None
    units: int = 0
    lanes_open: list[int] = field(default_factory=list)
    held: list[str] = field(default_factory=list)


def window_hours(windows: list[str]) -> dict[str, float]:
    """Hours from the first window, rolling past midnight, so 22:00 then 00:00 is 2 hours."""
    out: dict[str, float] = {}
    day = 0
    last = None
    for w in windows:
        hh, mm = (int(x) for x in w.split(":"))
        minutes = hh * 60 + mm + day * 1440
        if last is not None and minutes < last:
            day += 1
            minutes += 1440
        out[w] = minutes / 60
        last = minutes
    first = out[windows[0]] if windows else 0.0
    return {w: h - first for w, h in out.items()}


def _units(lanes_open: list[int], windows: list[str], capacity: int) -> list[tuple[int, str, int]]:
    return [(lane, w, k) for lane in sorted(lanes_open) for w in windows for k in range(capacity)]


def _latest_hours(a: Appt, hours: dict[str, float]) -> float:
    """A latest window that has already ended drops the bound, so a late rated order still gets a slot."""
    return hours.get(a.latest_window, np.inf) if a.latest_window else np.inf


def _cost_matrix(appts: list[Appt], units, hours: dict[str, float], lanes_open: set[int]) -> np.ndarray:
    a_hours = np.array([hours.get(a.window, 0.0) for a in appts])[:, None]
    a_latest = np.array([_latest_hours(a, hours) for a in appts])[:, None]
    a_weight = np.array([101 - a.urgency for a in appts], dtype=float)[:, None]
    a_lane = np.array([a.lane for a in appts])[:, None]
    a_hold = np.array([a.step == "HOLD" for a in appts])[:, None]
    u_hours = np.array([hours[w] for _, w, _ in units])[None, :]
    u_lane = np.array([lane for lane, _, _ in units])[None, :]
    u_closed = np.array([lane not in lanes_open for lane, _, _ in units])[None, :]
    delay = u_hours - a_hours
    cost = np.maximum(delay, 0.0) * a_weight
    # One flat penalty per infeasible pair, so the solver minimises how many it is forced to make.
    infeasible = (delay < 0) | a_hold | u_closed | (u_hours > a_latest)
    return cost + PENALTY * infeasible + LANE_CHANGE_COST * (u_lane != a_lane)


def protected(a: Appt) -> bool:
    """Reefers, last free day boxes, and rated orders must keep a slot. HOLD boxes cannot leave, so they are not protected."""
    return (a.reefer or a.lfd_today or a.rated) and a.step != "HOLD"


def _tiers(appts: list[Appt]) -> list[list[int]]:
    first = [i for i, a in enumerate(appts) if protected(a)]
    rest = [i for i, a in enumerate(appts) if not protected(a)]
    return [t for t in (first, rest) if t]


def _hungarian(appts: list[Appt], cost: np.ndarray, solver) -> dict[int, int]:
    """Solve tier by tier on the rectangular matrix, each tier on the units the tiers before it left free."""
    free = np.arange(cost.shape[1])
    out: dict[int, int] = {}
    for tier in _tiers(appts):
        if free.size == 0:
            break
        sub = cost[np.ix_(tier, free)]
        rows, cols = solver(sub)
        taken = set()
        for r, c in zip(rows, cols):
            # A rectangular solve fills every unit when rows outnumber units, even at the penalty.
            if sub[r, c] >= PENALTY:
                continue
            out[tier[int(r)]] = int(free[int(c)])
            taken.add(int(c))
        free = np.array([u for k, u in enumerate(free) if k not in taken], dtype=int)
    return out


def _greedy(appts: list[Appt], units, cost: np.ndarray) -> dict[int, int]:
    order = sorted(
        range(len(appts)),
        key=lambda i: (appts[i].step == "HOLD", not protected(appts[i]), -appts[i].urgency, appts[i].box),
    )
    free = set(range(len(units)))
    out: dict[int, int] = {}
    for i in order:
        if not free:
            break
        j = min(free, key=lambda j: (cost[i, j], j))
        if cost[i, j] >= PENALTY:
            continue
        out[i] = j
        free.remove(j)
    return out


def _reason(old_lane: int, old_window: str, lane: int, window: str, open_set: set[int]) -> str:
    move = f"Moved from {old_window} lane {old_lane} to {window} lane {lane}."
    if old_lane not in open_set:
        return f"Lane {old_lane} closed. {move}"
    return f"Lane {old_lane} at {old_window} is full. {move}"


def solve(
    appointments: list[Appt],
    lanes_open: list[int],
    windows: list[str],
    capacity: int,
    previous: dict[str, tuple[int, str]] | None = None,
    solver=None,
) -> Assignment:
    """Place appointments into open slot units. previous defaults to each booked slot."""
    t0 = time.perf_counter()
    appts = sorted(appointments, key=lambda a: a.box)
    units = _units(lanes_open, windows, capacity)
    open_set = set(lanes_open)
    hours = window_hours(windows)
    used = "linear_sum_assignment"
    error = None
    pairs: dict[int, int] = {}
    if appts and units:
        cost = _cost_matrix(appts, units, hours, open_set)
        try:
            pairs = _hungarian(appts, cost, solver or linear_sum_assignment)
        except Exception as exc:  # the greedy sort keeps the gate running whatever the solver does
            used, error = "greedy", f"{type(exc).__name__}: {exc}"
            pairs = _greedy(appts, units, cost)

    placed: dict[str, tuple[int, str]] = {}
    for i, j in pairs.items():
        lane, window, _ = units[j]
        placed[appts[i].box] = (lane, window)
    unplaced = sorted((a for a in appts if a.box not in placed), key=lambda a: (-a.urgency, a.box))
    overflow = [a for a in unplaced if a.step != "HOLD"]
    held = [a.box for a in unplaced if a.step == "HOLD"]

    before = previous or {}
    moved: list[Move] = []
    for a in appts:
        if a.box not in placed:
            continue
        old_lane, old_window = before.get(a.box, (a.lane, a.window))
        lane, window = placed[a.box]
        if (lane, window) == (old_lane, old_window):
            continue
        moved.append(
            Move(
                box=a.box,
                old_lane=old_lane,
                old_window=old_window,
                new_lane=lane,
                new_window=window,
                delay_hours=round(hours.get(window, 0.0) - hours.get(old_window, 0.0), 2),
                reason=_reason(old_lane, old_window, lane, window, open_set),
            )
        )
    moved.sort(key=lambda m: (-m.delay_hours, m.box))
    return Assignment(
        placed=placed,
        overflow=[a.box for a in overflow],
        moved=moved,
        solve_ms=round((time.perf_counter() - t0) * 1000, 2),
        solver=used,
        error=error,
        units=len(units),
        lanes_open=sorted(open_set),
        held=held,
    )
