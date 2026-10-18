"""Twist 2, make it global: the region switch changes what the planner reads, never what Rung decides."""
import inspect
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import engine, regions, rules
from backend.main import app

LB_IN_TEXT = re.compile(r"\d lb\b")


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    yield c
    c.post("/api/region", json={"region": "los_angeles"})


def decisions(c):
    return {r["number"]: (r["step"], r["engine_step"], r["urgency"], tuple(r["fired"]), r["hand"]) for r in c.get("/api/queue").json()}


def test_los_angeles_is_the_default(client):
    s = client.get("/api/state").json()
    assert s["region"]["id"] == "los_angeles"
    assert s["region"]["weight_unit"] == "lb" and s["region"]["currency"] == "USD"
    assert s["region"]["adapter"] == "Terminal49" and s["region"]["tz_label"] == "PDT"
    assert [r["id"] for r in s["regions"]] == ["los_angeles", "rotterdam", "shanghai"]


def test_unknown_region_is_refused(client):
    r = client.post("/api/region", json={"region": "atlantis"})
    assert r.status_code == 400 and "rotterdam" in r.json()["detail"]
    assert client.get("/api/state").json()["region"]["id"] == "los_angeles"


def test_engine_and_rules_never_see_a_region():
    assert "regions" not in inspect.getsource(engine)
    for path in Path(rules.__file__).parent.glob("*.py"):
        assert "regions" not in path.read_text(), path.name


@pytest.mark.parametrize("region", ["rotterdam", "shanghai"])
def test_switching_region_never_changes_a_decision_or_the_gate_plan(client, region):
    client.post("/api/scenario/jump", json={"t": "+00:44"})
    before, gate_before = decisions(client), client.get("/api/gate").json()["compare"]
    state = client.post("/api/region", json={"region": region}).json()
    assert state["region"]["id"] == region
    assert decisions(client) == before
    gate_after = client.get("/api/gate").json()["compare"]
    for key in ("rung", "blunt", "idle_hours_avoided", "idle_co2_kg_avoided"):
        assert gate_after[key] == gate_before[key]


def test_rotterdam_reads_in_kilograms_euros_and_dutch_names(client):
    s = client.post("/api/region", json={"region": "rotterdam"}).json()
    assert s["region"]["weight_unit"] == "kg" and s["region"]["currency"] == "EUR"
    assert s["region"]["adapter"] == "Portbase" and s["region"]["tz_label"] == "CEST"
    assert "litres" in s["emissions"]["label"] and "EU ETS" in s["emissions"]["rules"]
    assert s["emissions"]["kg_co2_per_idle_hour"] == 8.144

    box = client.get("/api/box/CMAU9939083").text
    assert not LB_IN_TEXT.search(box)
    assert "16,329 kg" in box

    rows = {r["number"]: r for r in client.get("/api/queue").json()}
    held = rows["HLBU8691177"]
    assert held["owner"] == "customs agent"
    assert "DOUANE HOLD" in held["reason"] and "236 EUR" not in held["reason"] and "237 EUR" in held["reason"]
    assert "customs broker" not in json.dumps(rows)

    spoof = client.get("/api/box/HLBU8691177").json()["spoof"]["holds"]
    assert {h["name"]: h["label"] for h in spoof}["USDA"] == "NVWA"


def test_shanghai_reads_in_yuan_and_china_customs_names(client):
    s = client.post("/api/region", json={"region": "shanghai"}).json()
    assert s["region"]["currency"] == "CNY" and s["region"]["customs_short"] == "China Customs"
    held = {r["number"]: r for r in client.get("/api/queue").json()}["HLBU8691177"]
    assert held["owner"] == "customs declaration agent"
    assert "CUSTOMS HOLD" in held["reason"] and "1,953 CNY" in held["reason"]


def test_the_api_still_takes_pounds_in_every_region(client):
    client.post("/api/region", json={"region": "rotterdam"})
    r = client.post("/api/box/CMAU9939083/spoof", json={"weight_in_lbs": 44100}).json()
    assert "20,003 kg" in r["effect"]
    assert client.get("/api/box/CMAU9939083").json()["spoof"]["weight_in_lbs"] == 44100


def test_localize_text_converts_units_money_and_names():
    rtm, sha = regions.REGIONS["rotterdam"], regions.REGIONS["shanghai"]
    text = "Manifest 2,400 lb, weighbridge 44,100 lb, gap 1738 percent. Demurrage 275 USD accruing. Owner: customs broker."
    assert regions.localize_text(text, rtm) == (
        "Manifest 1,089 kg, weighbridge 20,003 kg, gap 1738 percent. Demurrage 237 EUR accruing. Owner: customs agent."
    )
    assert "1,953 CNY" in regions.localize_text(text, sha)
    assert regions.localize_text("The manifest says 36,000 pounds.", rtm) == "The manifest says 16,329 kilograms."
    assert regions.localize_text(text, regions.REGIONS["los_angeles"]) == text


def test_localize_leaves_identifiers_alone():
    rtm = regions.REGIONS["rotterdam"]
    payload = {"name": "TMF", "step": "HOLD", "label": "TMF", "detail": "TMF hold active (TMF HOLD).", "values": {"carrier": 2400}}
    assert regions.localize(payload, rtm) == {
        "name": "TMF",
        "step": "HOLD",
        "label": "Terminal fee",
        "detail": "Terminal fee hold active (TERMINAL FEE).",
        "values": {"carrier": 2400},
    }


def test_twist_log_has_the_global_twist_pending_merge():
    entries = json.loads((Path(__file__).parent.parent / "twists.json").read_text())
    entry = next(e for e in entries if e["tag"] == "twist-2-global")
    assert entry["received_at"] == "2026-10-17T17:00:00-07:00"
    assert entry["merged_at"] is None
    assert "make it global" in entry["text"]
