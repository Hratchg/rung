import random
import time
from collections import Counter

import pytest
from fastapi.testclient import TestClient

from backend.gate import PENALTY, Appt, protected, solve, window_hours
from backend.main import app

LANES = [1, 2, 3, 4, 5, 6]
WINDOWS = ["22:00", "23:00", "00:00", "01:00", "02:00", "03:00", "04:00", "05:00"]
CAPACITY = 4


def appointments(n=100, seed=7) -> list[Appt]:
    """100 bookings spread over 6 lanes and 8 windows, about one in five a reefer or LFD today box."""
    rng = random.Random(seed)
    out = []
    for i in range(n):
        reefer = i % 6 == 0
        lfd_today = i % 7 == 3
        hold = not (reefer or lfd_today) and i % 11 == 5
        out.append(
            Appt(
                box=f"TEST{i:07d}",
                lane=rng.choice(LANES),
                window=WINDOWS[i % len(WINDOWS)],
                urgency=rng.randint(5, 95),
                step="HOLD" if hold else rng.choice(["RELEASE", "WATCH", "SLOW", "ASK"]),
                reefer=reefer,
                lfd_today=lfd_today,
            )
        )
    return out


def check_plan(appts, plan, lanes_open):
    by_box = {a.box: a for a in appts}
    hours = window_hours(WINDOWS)
    assert len(plan.placed) + len(plan.overflow) + len(plan.held) == len(appts)
    for box, (lane, window) in plan.placed.items():
        assert lane in lanes_open, f"{box} placed on closed lane {lane}"
        assert hours[window] >= hours[by_box[box].window], f"{box} placed before its booked window"
        assert by_box[box].step != "HOLD"
    per_unit = Counter(plan.placed.values())
    assert max(per_unit.values()) <= CAPACITY
    assert all(by_box[b].step == "HOLD" for b in plan.held)


def test_closing_lanes_4_to_6_keeps_every_reefer_and_lfd_today_box():
    appts = appointments()
    open_lanes = [1, 2, 3]
    plan = solve(appts, open_lanes, WINDOWS, CAPACITY)
    assert plan.solver == "linear_sum_assignment" and plan.error is None
    check_plan(appts, plan, open_lanes)
    reefers = [a for a in appts if a.reefer]
    lfd = [a for a in appts if a.lfd_today]
    assert reefers and lfd
    for a in reefers + lfd:
        assert a.box in plan.placed, f"{a.box} lost its slot"
    assert plan.moved


def test_rows_left_when_units_run_short_become_overflow():
    appts = appointments(130)
    plan = solve(appts, [1, 2, 3], WINDOWS, CAPACITY)
    check_plan(appts, plan, [1, 2, 3])
    assert plan.overflow
    assert len(plan.placed) <= 96
    for a in appts:
        if protected(a):
            assert a.box in plan.placed, f"{a.box} lost its slot"


def test_solve_under_100_ms():
    appts = appointments()
    t0 = time.perf_counter()
    plan = solve(appts, [1, 2, 3], WINDOWS, CAPACITY)
    wall_ms = (time.perf_counter() - t0) * 1000
    assert plan.solve_ms < 100
    assert wall_ms < 100


def test_overflow_is_ordered_by_urgency_descending():
    appts = appointments(130)
    plan = solve(appts, [1, 2, 3], WINDOWS, CAPACITY)
    by_box = {a.box: a for a in appts}
    urgencies = [by_box[b].urgency for b in plan.overflow]
    assert len(urgencies) > 1
    assert urgencies == sorted(urgencies, reverse=True)
    assert not any(protected(by_box[b]) for b in plan.overflow)


def test_moved_lists_closed_lane_reason_and_delay():
    appts = appointments()
    plan = solve(appts, [1, 2, 3], WINDOWS, CAPACITY)
    by_box = {a.box: a for a in appts}
    hours = window_hours(WINDOWS)
    for m in plan.moved:
        a = by_box[m.box]
        assert (m.old_lane, m.old_window) == (a.lane, a.window)
        assert (m.new_lane, m.new_window) == plan.placed[m.box]
        assert m.delay_hours == hours[m.new_window] - hours[m.old_window] >= 0
        if a.lane in (4, 5, 6):
            assert m.reason == f"Lane {a.lane} closed. Moved from {a.window} lane {a.lane} to {m.new_window} lane {m.new_lane}."
    assert {m.box for m in plan.moved} >= {b for b, a in by_box.items() if a.lane in (4, 5, 6) and b in plan.placed}
    assert [(-m.delay_hours, m.box) for m in plan.moved] == sorted((-m.delay_hours, m.box) for m in plan.moved)


def test_all_lanes_open_moves_nobody():
    appts = [
        Appt(box=f"EVEN{i:07d}", lane=(i // len(WINDOWS)) % len(LANES) + 1, window=WINDOWS[i % len(WINDOWS)], urgency=50)
        for i in range(100)
    ]
    counts = Counter((a.lane, a.window) for a in appts)
    assert max(counts.values()) <= CAPACITY
    plan = solve(appts, LANES, WINDOWS, CAPACITY)
    assert plan.moved == [] and plan.overflow == []
    assert plan.placed == {a.box: (a.lane, a.window) for a in appts}


def test_hold_boxes_take_no_slot_even_with_spare_units():
    appts = appointments(20)
    plan = solve(appts, LANES, WINDOWS, CAPACITY)
    holds = [a.box for a in appts if a.step == "HOLD"]
    assert holds and sorted(plan.held) == sorted(holds)
    assert not set(holds) & set(plan.placed)


def test_previous_assignment_drives_the_moved_diff():
    appts = appointments()
    first = solve(appts, [1, 2, 3], WINDOWS, CAPACITY)
    again = solve(appts, [1, 2, 3], WINDOWS, CAPACITY, previous=first.placed)
    assert again.placed == first.placed
    assert again.moved == []


def test_greedy_fallback_when_solver_raises():
    def broken(_cost):
        raise RuntimeError("solver down")

    appts = appointments()
    plan = solve(appts, [1, 2, 3], WINDOWS, CAPACITY, solver=broken)
    assert plan.solver == "greedy"
    assert plan.error == "RuntimeError: solver down"
    check_plan(appts, plan, [1, 2, 3])
    for a in appts:
        if protected(a):
            assert a.box in plan.placed


def test_penalty_is_finite():
    assert PENALTY == 1e6


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    yield c


def test_api_lane_toggle_resolves_and_lists_moved_and_overflow(client):
    g = client.get("/api/gate").json()
    assert {"lanes", "windows", "placed", "moved", "overflow", "solve_ms", "solver"} <= set(g)
    assert [lane["open"] for lane in g["lanes"]] == [True] * 6
    assert g["moved"] == [] and g["overflow"] == []

    for lane in (4, 5, 6):
        g = client.post("/api/gate/lanes", json={"lane": lane, "open": False}).json()
        assert g["solve_ms"] < 100
        assert g["solver"] == "linear_sum_assignment"
    assert [lane["open"] for lane in g["lanes"]] == [True, True, True, False, False, False]
    assert client.get("/api/state").json()["lanes_open"] == [1, 2, 3]
    assert g["moved"] and g["overflow"]
    assert all(p["lane"] in (1, 2, 3) for p in g["placed"].values())
    assert all(o["reason"].startswith("No open slot from ") for o in g["overflow"])
    assert any(m["reason"].startswith("Lane 4 closed.") for m in g["moved"])
    urgencies = [o["urgency"] for o in g["overflow"]]
    assert urgencies == sorted(urgencies, reverse=True)
    for o in g["overflow"]:
        assert not o["reefer"] and not o["lfd_today"]
    compare = g["compare"]
    assert compare["rung"]["reefers_kept"] == compare["reefers_total"]
    assert compare["rung"]["lfd_kept"] == compare["lfd_total"]
    assert compare["blunt"]["kept"] == 0 and compare["blunt"]["throughput_pct"] == 0

    g = client.post("/api/gate/lanes", json={"lane": 5, "open": True}).json()
    assert [lane["open"] for lane in g["lanes"]] == [True, True, True, False, True, False]


def test_api_rejects_unknown_lane(client):
    r = client.post("/api/gate/lanes", json={"lane": 9, "open": False})
    assert r.status_code == 400
    assert "lanes 1 to 6" in r.json()["detail"]


def test_state_carries_blunt_counters(client):
    s = client.get("/api/state").json()
    assert s["counters_blunt"]["released"] == 0
    assert s["counters_blunt"]["throughput_pct"] == 0
    assert s["counters"]["released_blunt"] == 0


def test_moved_box_shows_its_planned_slot_and_slow_approve_rebooks_it(client):
    client.post("/api/scenario/jump", json={"t": "+00:10"})
    g = client.get("/api/gate").json()
    rows = {r["number"]: r for r in client.get("/api/queue").json()}
    move = next(m for m in g["moved"] if rows[m["box"]]["step"] == "SLOW" and not rows[m["box"]]["hand"])
    planned = rows[move["box"]]["clocks"]["appointment"]["planned"]
    assert planned == {
        "lane": move["new_lane"],
        "window": move["new_window"],
        "label": f"Planned {move['new_window']} lane {move['new_lane']}",
    }
    out = client.post("/api/decision", json={"box": move["box"], "action": "approve"}).json()
    assert out
    box = client.get(f"/api/box/{move['box']}").json()
    assert (box["appointment"]["lane"], box["appointment"]["window"]) == (move["new_lane"], move["new_window"])
    line = next(h for h in box["history"] if h["actor"] == "planner")
    assert line["effect"] == f"Moved from {move['old_window']} lane {move['old_lane']} to {move['new_window']} lane {move['new_lane']}."
