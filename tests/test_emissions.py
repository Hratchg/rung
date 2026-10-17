from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.emissions import (
    IDLE_LIMIT_H,
    KG_CO2_PER_IDLE_HOUR,
    Idle,
    blunt_idle,
    co2_kg,
    truck_idle,
)
from backend.main import app
from backend.scenario import Scenario

T22 = datetime.fromisoformat("2026-10-18T22:00:00-07:00")
H = timedelta(hours=1)
MIN = timedelta(minutes=1)


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    yield c


def test_factor_is_doe_idle_burn_times_epa_diesel_co2():
    assert KG_CO2_PER_IDLE_HOUR == pytest.approx(0.8 * 10.180)
    assert KG_CO2_PER_IDLE_HOUR == pytest.approx(8.144)
    assert co2_kg(0) == 0
    assert co2_kg(2.5) == pytest.approx(2.5 * 8.144)
    assert IDLE_LIMIT_H == 1.0


def test_truck_idle_kept_moved_capped_overflow_and_hold():
    assert truck_idle(T22, T22, False, None, T22) == (0.0, "kept")
    assert truck_idle(T22, T22 + H, False, None, T22) == (1.0, "moved")
    assert truck_idle(T22, T22 + 30 * MIN, False, None, T22) == (0.5, "moved")
    assert truck_idle(T22, T22 + 2 * H, False, None, T22) == (IDLE_LIMIT_H, "moved")
    assert truck_idle(T22, None, False, None, T22) == (IDLE_LIMIT_H, "overflow")
    assert truck_idle(T22, T22, True, None, T22) == (IDLE_LIMIT_H, "hold")


def test_truck_idle_on_a_dark_feed_counts_only_minutes_already_waited():
    dark = T22 + 40 * MIN
    # The slot started before the feed went dark: the wait runs from the moment it went dark.
    assert truck_idle(T22, T22, False, dark, dark) == (0.0, "kept")
    hours, cause = truck_idle(T22, T22, False, dark, dark + 15 * MIN)
    assert (round(hours, 4), cause) == (0.25, "dark")
    # A slot still to come adds nothing yet, even with the feed dark.
    assert truck_idle(T22 + H, T22 + H, False, dark, T22 + 50 * MIN) == (0.0, "kept")
    hours, cause = truck_idle(T22 + H, T22 + H, False, dark, T22 + H + 15 * MIN)
    assert (round(hours, 4), cause) == (0.25, "dark")
    # Dark waiting adds to a move and is capped like any wait.
    assert truck_idle(T22, T22 + H, False, dark, T22 + 2 * H) == (IDLE_LIMIT_H, "dark")


def test_idle_so_far_runs_from_arrival_and_stops_at_the_whole_wait():
    idle = Idle(T22 + H, 0.5, "moved")
    assert idle.so_far(T22) == 0
    assert idle.so_far(T22 + H + 12 * MIN) == pytest.approx(0.2)
    assert idle.so_far(T22 + 5 * H) == 0.5
    frozen = idle.settle(0.1)
    assert frozen.settled and frozen.hours == 0.1 and frozen.cause == "moved"


def test_blunt_idle_waits_out_the_limit_for_every_arrival():
    arrivals = [T22, T22, T22 + H, T22 + 3 * H]
    assert blunt_idle(arrivals, T22) == 0
    assert blunt_idle(arrivals, T22 + 30 * MIN) == pytest.approx(1.0)
    assert blunt_idle(arrivals, T22 + 90 * MIN) == pytest.approx(2.5)
    assert blunt_idle(arrivals, T22 + 10 * H) == pytest.approx(4.0)


def test_tuesday_only_hold_trucks_idle_in_the_plan(client):
    s = client.get("/api/state").json()
    assert s["counters"]["idle_hours"] == 0 and s["counters"]["idle_co2_kg"] == 0
    assert s["counters_blunt"]["idle_hours"] == 0 and s["counters_blunt"]["idle_co2_kg"] == 0
    g = client.get("/api/gate").json()
    cmp = g["compare"]
    assert g["moved"] == [] and g["overflow"] == [] and len(g["held"]) == 13
    assert all(h["idle_minutes"] == 60 and h["co2_kg"] == 8.1 for h in g["held"])
    assert cmp["rung"]["idle_hours_plan"] == 13.0 and cmp["rung"]["idle_co2_kg_plan"] == 106
    assert cmp["blunt"]["idle_hours_plan"] == cmp["appointments"] == 129
    assert cmp["blunt"]["idle_co2_kg_plan"] == 1051
    assert cmp["idle_hours_avoided"] == 116.0 and cmp["idle_co2_kg_avoided"] == 945
    rows = client.get("/api/queue").json()
    for r in rows:
        assert (r["idle"] is None) == (r["clocks"]["appointment"] is None)
    hold = next(r for r in rows if r["number"] == "MSKU1234567")
    assert hold["idle"] == {
        "minutes": 60,
        "co2_kg": 8.1,
        "so_far_minutes": 0,
        "cause": "hold",
        "settled": False,
        "label": "On HOLD, so it takes no slot. Idles 60 min at the gate, 8.1 kg CO2.",
    }
    clear = next(r for r in rows if r["number"] == "CMAU9939083")
    assert clear["idle"]["minutes"] == 0 and clear["idle"]["cause"] == "kept"


def test_harbor_night_lanes_4_to_6_closed_plan_against_closing_the_terminal(client):
    client.post("/api/scenario/jump", json={"t": "+00:10"})
    g = client.get("/api/gate").json()
    cmp = g["compare"]
    assert [lane["open"] for lane in g["lanes"]] == [True, True, True, False, False, False]
    for m in g["moved"]:
        assert m["idle_minutes"] == round(min(m["delay_hours"], IDLE_LIMIT_H) * 60)
        assert m["co2_kg"] == round(co2_kg(m["idle_minutes"] / 60), 1)
    assert all(o["idle_minutes"] == 60 for o in g["overflow"])
    late = sum(1 for m in g["moved"] if m["delay_hours"] > 0)
    assert cmp["rung"]["idle_hours_plan"] == late + len(g["overflow"]) + len(g["held"]) == 40
    assert cmp["rung"]["idle_co2_kg_plan"] == 326 and cmp["blunt"]["idle_co2_kg_plan"] == 1051
    assert cmp["idle_hours_avoided"] == 89.0 and cmp["idle_co2_kg_avoided"] == 725
    assert cmp["idle_label"] == (
        "Under the Rung plan these 129 trucks idle 40.0 h at the gate, 326 kg CO2. "
        "Closing the terminal idles them 129.0 h, 1,051 kg CO2. Rung avoids 89.0 idle hours and 725 kg CO2."
    )


def test_box_idle_matches_the_gate_move_and_survives_approving_slow(client):
    client.post("/api/scenario/jump", json={"t": "+00:10"})
    g = client.get("/api/gate").json()
    rows = {r["number"]: r for r in client.get("/api/queue").json()}
    move = next(m for m in g["moved"] if m["delay_hours"] > 0 and rows[m["box"]]["step"] == "SLOW" and not rows[m["box"]]["hand"])
    idle = rows[move["box"]]["idle"]
    assert idle["cause"] == "moved" and idle["minutes"] == move["idle_minutes"] == 60
    assert idle["label"] == f"New slot {move['new_window']} lane {move['new_lane']}. Idles 60 min at the gate, 8.1 kg CO2."
    assert client.get(f"/api/box/{move['box']}").json()["idle"] == idle
    client.post("/api/decision", json={"box": move["box"], "action": "approve"})
    box = client.get(f"/api/box/{move['box']}").json()
    assert box["appointment"]["window"] == move["new_window"]
    assert box["idle"]["cause"] == "moved" and box["idle"]["minutes"] == 60


def test_header_so_far_is_the_sum_of_the_boxes_and_never_above_blunt(client):
    client.post("/api/scenario/jump", json={"t": "+00:10"})
    s = client.get("/api/state").json()
    rows = client.get("/api/queue").json()
    so_far = sum(r["idle"]["so_far_minutes"] for r in rows if r["idle"]) / 60
    assert s["counters"]["idle_hours"] == pytest.approx(so_far, abs=0.05) and so_far > 0
    assert s["counters"]["idle_co2_kg"] == round(co2_kg(s["counters"]["idle_hours"]))
    booked_22 = sum(1 for r in rows if r["clocks"]["appointment"] and r["clocks"]["appointment"]["window"] == "22:00")
    assert s["counters_blunt"]["idle_hours"] == round(booked_22 * 10 / 60, 1)
    assert s["counters"]["idle_hours"] < s["counters_blunt"]["idle_hours"]


def test_idle_so_far_never_drops_as_the_night_runs():
    sc = Scenario(minutes_per_second=0)
    last = last_blunt = 0.0
    for minutes in range(0, 151, 5):
        sc.jump(f"+{minutes // 60:02d}:{minutes % 60:02d}")
        rung, blunt = sc.counters()["idle_hours"], sc.counters_blunt()["idle_hours"]
        assert rung >= last and blunt >= last_blunt and rung <= blunt
        last, last_blunt = rung, blunt
    assert last > 0


def test_window_end_settles_each_truck_and_keeps_it_in_the_count(client):
    client.post("/api/scenario/jump", json={"t": "+00:50"})
    before = client.get("/api/state").json()["counters"]["idle_hours"]
    client.post("/api/scenario/jump", json={"t": "+01:05"})
    rows = client.get("/api/queue").json()
    ended = [r for r in rows if r["clocks"]["appointment"] and r["clocks"]["appointment"]["window"] == "22:00"]
    assert ended and all(r["idle"]["settled"] for r in ended)
    assert all(r["idle"]["so_far_minutes"] == r["idle"]["minutes"] for r in ended)
    assert any(r["idle"]["label"].startswith("Had no open slot.") for r in ended)
    assert client.get("/api/state").json()["counters"]["idle_hours"] >= before
    gate = client.get("/api/gate").json()
    assert not {r["number"] for r in ended} & ({m["box"] for m in gate["moved"]} | set(gate["placed"]))


def test_dark_feed_trucks_count_the_minutes_they_wait(client):
    client.post("/api/scenario/jump", json={"t": "+00:40"})
    rows = client.get("/api/queue").json()
    assert not any(r["idle"] and r["idle"]["cause"] == "dark" for r in rows)
    client.post("/api/scenario/jump", json={"t": "+00:55"})
    dark = [r for r in client.get("/api/queue").json() if r["idle"] and r["idle"]["cause"] == "dark"]
    assert dark
    for r in dark:
        assert r["step"] in ("WATCH", "ASK", "HAND") and "R10" in r["fired"]
        assert r["idle"]["minutes"] == r["idle"]["so_far_minutes"] == 15
        assert r["idle"]["label"] == "Waiting on a dark feed. Idled 15 min so far, 2.0 kg CO2."


def test_release_freezes_the_idle_already_spent(client):
    client.post("/api/scenario/jump", json={"t": "+00:30"})
    rows = client.get("/api/queue").json()
    row = next(
        r
        for r in rows
        if r["idle"] and r["idle"]["cause"] in ("overflow", "hold") and r["clocks"]["appointment"]["window"] == "22:00"
    )
    client.post("/api/decision", json={"box": row["number"], "action": "override", "step": "RELEASE", "note": "Let it go"})
    box = client.get(f"/api/box/{row['number']}").json()
    assert box["idle"]["settled"] and box["idle"]["minutes"] == box["idle"]["so_far_minutes"] == 30
    assert box["idle"]["label"] == "Gated out. Idled 30 min at the gate, 4.1 kg CO2."
    client.post("/api/scenario/jump", json={"t": "+00:50"})
    assert client.get(f"/api/box/{row['number']}").json()["idle"]["minutes"] == 30


def test_state_carries_the_factor_and_its_sources(client):
    e = client.get("/api/state").json()["emissions"]
    assert e["kg_co2_per_idle_hour"] == 8.144
    assert e["idle_gallons_per_hour"] == 0.8 and e["kg_co2_per_gallon_diesel"] == 10.18
    assert e["idle_limit_hours"] == 1.0
    urls = [src["url"] for src in e["sources"]]
    assert any("afdc.energy.gov" in u for u in urls) and any("epa.gov" in u for u in urls)
    assert e["label"].startswith("8.14 kg CO2 per truck idle hour.")


def test_settling_idle_leaves_decisions_and_audit_untouched(monkeypatch):
    with_idle = Scenario(minutes_per_second=0)
    with_idle.jump("+01:30")
    monkeypatch.setattr(Scenario, "_settle_idle", lambda self, upto: None)
    without = Scenario(minutes_per_second=0)
    without.jump("+01:30")

    def ladder(sc):
        return {n: (s.decision.step, tuple(s.decision.fired), s.pending_release) for n, s in sc.boxes.items()}

    assert ladder(with_idle) == ladder(without)
    assert len(with_idle.audit.buffer) == len(without.audit.buffer)
    assert any(s.idle_final for s in with_idle.boxes.values())
    assert not any(s.idle_final for s in without.boxes.values())


def test_idle_is_deterministic():
    a, b = Scenario(minutes_per_second=0), Scenario(minutes_per_second=0)
    for sc in (a, b):
        sc.jump("+01:30")
    assert a.counters() == b.counters()
    assert {n: a.idle(s) for n, s in a.boxes.items()} == {n: b.idle(s) for n, s in b.boxes.items()}
