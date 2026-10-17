import copy
import json
import re
from datetime import timedelta

import pytest

from backend import config
from backend.engine import RULES, evaluate
from backend.models import Box
from backend.scenario import Scenario
from backend.timefmt import iso, parse_dt, window_at

SCENARIO = json.loads(config.SCENARIO_PATH.read_text())
START = parse_dt(SCENARIO["clock_start"])


def ago(minutes: float) -> str:
    return iso(START - timedelta(minutes=minutes))


def harbor_night_box(**context) -> Box:
    c = copy.deepcopy(SCENARIO["containers"][0])
    c["terminal"].setdefault("holds", [])
    c["appointment"]["at"] = iso(window_at(c["appointment"]["window"], START))
    return Box(
        number=c["number"],
        carrier=c["carrier"],
        terminal=c["terminal"],
        customs=c["customs"],
        weighbridge=c["weighbridge"],
        reefer=c["reefer"],
        appointment=c["appointment"],
        **context,
    )


def clear_box(**overrides) -> Box:
    """A dry box with nothing wrong: available, no holds, LFD five days out, weight matches."""
    fields = dict(
        number="CMAU1000005",
        carrier={
            "weight_in_lbs": 30000,
            "equipment_type": "dry",
            "equipment_length": 40,
            "current_status": "available",
            "observed_at": ago(60),
        },
        terminal={
            "available_for_pickup": True,
            "availability_known": True,
            "pickup_lfd": (START.date() + timedelta(days=5)).isoformat(),
            "fees_at_pod_terminal": [],
            "location_at_pod_terminal": "A-01-01",
            "pickup_appointment_at": None,
            "terminal_checked_at": ago(11),
            "holds": [],
        },
        customs={"holds": [], "observed_at": ago(20)},
        weighbridge={"measured_weight_lbs": 30600, "measured_at": ago(30), "method": "gate_weighbridge"},
        reefer=None,
        appointment={
            "lane": 2,
            "window": "04:00",
            "at": iso(window_at("04:00", START)),
            "dray_carrier": "Bayline Drayage",
            "trucker_phone": "+13105550101",
        },
    )
    fields.update(overrides)
    return Box(**fields)


def with_source(box: Box, name: str, **changes) -> Box:
    box = copy.deepcopy(box)
    setattr(box, name, {**getattr(box, name), **changes})
    return box


# Acceptance: the Harbor Night box from the schema.


def test_harbor_night_box_holds_for_customs_with_reefer_evidence():
    now = START + timedelta(minutes=25)
    d = evaluate(harbor_night_box(lanes_closed=frozenset({4, 5, 6})), now)
    assert d.step == "HOLD"
    assert d.hand is True
    assert {"R6", "R7"} <= set(d.fired)
    assert d.owner == "customs broker"
    assert d.urgency >= 80
    assert "C3" in [c.code for c in d.conflicts]
    assert "Customs hold active (CBP HOLD)." in d.reason
    assert "Escalated to planner with reefer evidence." in d.reason


def test_harbor_night_box_in_running_scenario():
    sc = Scenario(minutes_per_second=0)
    sc.jump("+00:25")
    assert sc.mode == "harbor_night"
    d = sc.boxes["MSKU1234567"].decision
    assert (d.step, d.hand, d.owner) == ("HOLD", True, "customs broker")
    assert {"R6", "R7"} <= set(d.fired)
    assert d.urgency >= 80


# Acceptance: clear box, C2 with low urgency, dark terminal with a pending release.


def test_clear_box_releases():
    d = evaluate(clear_box(), START)
    assert d.step == "RELEASE"
    assert d.fired == ["R0"]
    assert d.hand is False
    assert d.conflicts == []
    assert d.urgency < 30


def test_c2_box_with_low_urgency_watches():
    box = with_source(clear_box(), "terminal", available_for_pickup=False)
    d = evaluate(box, START)
    assert [c.code for c in d.conflicts] == ["C2"]
    assert d.urgency < 50
    assert d.step == "WATCH"
    assert "R1" in d.fired
    assert d.hand is False


def test_dark_terminal_with_pending_release_hands():
    box = clear_box(pending_release=True, dark_sources=frozenset({"terminal"}))
    d = evaluate(box, START)
    assert "C4" in [c.code for c in d.conflicts]
    assert "R10" in d.fired
    assert d.step == "HAND"
    assert d.hand is True
    assert d.trust["terminal"] == 0.0


def test_dark_terminal_without_pending_release_watches():
    d = evaluate(clear_box(dark_sources=frozenset({"terminal"})), START)
    assert d.step == "WATCH"
    assert "R10" in d.fired


def test_terminal_past_dark_threshold_counts_as_dark():
    box = with_source(clear_box(pending_release=True), "terminal", terminal_checked_at=ago(13 * 60))
    d = evaluate(box, START)
    assert d.step == "HAND"


# Engine properties.


def test_evaluate_is_pure():
    box = harbor_night_box(lanes_closed=frozenset({5}))
    before = copy.deepcopy(box)
    now = START + timedelta(minutes=40)
    first, second = evaluate(box, now), evaluate(box, now)
    assert first == second
    assert box == before


def test_trust_formula_and_reason():
    box = with_source(clear_box(), "terminal", available_for_pickup=False)
    d = evaluate(box, START)
    # 0.85 * 0.5 ** (11 / 60 / 4) * 0.7 ** 1
    assert d.trust["terminal"] == pytest.approx(0.58, abs=0.005)
    assert d.trust_detail["terminal"].reason == "terminal: base 0.85, age 11 min, freshness 0.97, 1 conflict, trust 0.58"
    assert d.trust["reefer"] == 0.0


def test_weight_conflicts():
    heavy = clear_box(
        carrier={**clear_box().carrier, "weight_in_lbs": 36000},
        weighbridge={**clear_box().weighbridge, "measured_weight_lbs": 40500},
    )
    empty = clear_box(
        carrier={**clear_box().carrier, "weight_in_lbs": 4400, "current_status": "empty"},
        weighbridge={**clear_box().weighbridge, "measured_weight_lbs": 41000},
    )
    for box in (heavy, empty):
        d = evaluate(box, START)
        assert "C1" in [c.code for c in d.conflicts]
        assert d.step == "ASK" and "R3" in d.fired
    assert "Manifest 36,000 lb, weighbridge 40,500 lb, gap 12.5 percent." in evaluate(heavy, START).reason
    assert "C1" not in [c.code for c in evaluate(clear_box(), START).conflicts]


def test_weight_unresolved_after_ask_holds_when_urgent():
    urgent = {
        "pickup_lfd": (START.date() - timedelta(days=1)).isoformat(),
        "fees_at_pod_terminal": [{"type": "demurrage", "amount": 275, "currency_code": "USD"}],
        "available_for_pickup": False,
        "holds": [{"name": "line", "status": "pending", "description": "LINE HOLD"}],
    }
    base = clear_box(
        carrier={**clear_box().carrier, "weight_in_lbs": 4400, "current_status": "empty"},
        weighbridge={**clear_box().weighbridge, "measured_weight_lbs": 41000},
        appointment={**clear_box().appointment, "window": "23:00", "at": iso(window_at("23:00", START))},
    )
    base = with_source(base, "terminal", **urgent)
    before_ask = evaluate(base, START)
    assert before_ask.urgency >= 50 and "R4" not in before_ask.fired
    after_ask = copy.deepcopy(base)
    after_ask.weight_asked = True
    d = evaluate(after_ask, START)
    assert "R4" in d.fired
    assert d.step == "HOLD" and d.hand is True
    assert d.owner == "shipping line"


def test_reefer_in_trouble_without_hold_releases_first():
    box = harbor_night_box()
    box.customs = {**box.customs, "holds": []}
    d = evaluate(box, START)
    assert "R5" in d.fired
    assert d.step in ("RELEASE", "ASK")


def test_reefer_power_off_without_other_issues_pins_release():
    reefer = {
        "set_point_c": -1.4,
        "air_temp_c": 3.0,
        "product_temp_c": -1.0,
        "power_on": False,
        "last_seen": ago(5),
        "cargo": "chilled lamb",
    }
    box = clear_box(reefer=reefer, carrier={**clear_box().carrier, "equipment_type": "reefer"})
    d = evaluate(box, START)
    assert d.step == "RELEASE" and d.pinned and d.hand
    assert d.fired == ["R5"]
    assert d.urgency >= 40


def test_pending_hold_watches_with_owner():
    box = with_source(clear_box(), "customs", holds=[{"name": "USDA", "status": "pending", "description": "USDA EXAM"}])
    d = evaluate(box, START)
    assert "R8" in d.fired
    assert d.step == "WATCH"
    assert d.owner == "customs broker"


def test_terminal_hold_names_shipping_line():
    box = with_source(
        clear_box(), "terminal", available_for_pickup=False, holds=[{"name": "freight", "status": "hold", "description": "FREIGHT HOLD"}]
    )
    d = evaluate(box, START)
    assert d.step == "HOLD" and d.owner == "shipping line" and d.hand


def test_closed_lane_slows():
    d = evaluate(clear_box(lanes_closed=frozenset({2})), START)
    assert d.step == "SLOW" and "R9" in d.fired


def test_demurrage_releases_up_the_queue():
    box = with_source(
        clear_box(),
        "terminal",
        pickup_lfd=(START.date() - timedelta(days=1)).isoformat(),
        fees_at_pod_terminal=[{"type": "demurrage", "amount": 275, "currency_code": "USD"}],
    )
    d = evaluate(box, START)
    assert d.fired == ["R11"]
    assert d.step == "RELEASE" and d.pinned and d.hand


def test_clean_urgent_box_still_releases():
    box = with_source(clear_box(), "terminal", pickup_lfd=START.date().isoformat())
    d = evaluate(box, START)
    assert d.urgency >= 30
    assert d.fired == ["R0"] and d.step == "RELEASE" and d.hand is False


def test_no_rule_falls_back_to_watch():
    box = with_source(clear_box(), "terminal", availability_known=False)
    d = evaluate(box, START)
    assert d.fired == [] and d.step == "WATCH"
    assert d.reason.startswith("No rule matched this box.")


def test_urgency_is_capped():
    d = evaluate(harbor_night_box(), START + timedelta(minutes=30))
    assert d.urgency == 100


def test_rules_load_in_id_order_with_created_at():
    assert [r.id for r in RULES] == [f"R{i}" for i in range(13)]
    assert all(r.created_at for r in RULES)


def test_reason_copy_has_no_contractions_dashes_or_semicolons():
    sc = Scenario(minutes_per_second=0)
    bad = re.compile(r"[;\u2013\u2014'\-]")
    for t in ("+00:00", "+00:25", "+00:45", "+05:00"):
        sc.jump(t)
        for state in sc.boxes.values():
            assert not bad.search(state.decision.reason), state.decision.reason


# Phase 2 decisions.


def test_dark_terminal_hands_only_boxes_whose_truck_is_due():
    sc = Scenario(minutes_per_second=0)
    sc.jump("+00:39")
    due = {n for n, s in sc.boxes.items() if s.pending_release}
    sc.jump("+00:40")
    hand = {n for n, s in sc.boxes.items() if s.decision.step == "HAND"}
    assert hand == due and 0 < len(hand) < 40
    for n in hand:
        hours = (parse_dt(sc.boxes[n].appointment["at"]) - sc.now).total_seconds() / 3600
        assert -1 < hours <= 2.7
    assert all(s.decision.votes["R10"] == "WATCH" for n, s in sc.boxes.items() if "R10" in s.decision.fired and n not in hand)


def test_warmup_clock_matches_csiro_for_frozen_cargo():
    from backend.feeds import ReeferModel, warmup

    model = ReeferModel("CMAU0000000", 7, -18.0, "frozen fish", START, -18.5, -18.0, True)
    model.set_power(START, False)
    w = warmup(model, START + timedelta(hours=1))
    assert w["limit_c"] == -10.0 and w["note"].startswith("CSIRO 2007.")
    assert w["hours_left"] == pytest.approx(18.0, abs=0.05)
    assert warmup(ReeferModel("CMAU0000000", 7, -1.4, "chilled beef", START, -1.0, -1.4, True), START)["power_on"] is True
