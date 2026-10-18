import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.main import app, scenario
from backend.t49 import Poller


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    yield c


def positions(rows):
    return {r["number"]: i for i, r in enumerate(rows)}


def test_state_shape(client):
    s = client.get("/api/state").json()
    assert s["mode"] == "tuesday"
    assert s["offset"] == "+00:00"
    assert s["lanes_open"] == [1, 2, 3, 4, 5, 6]
    assert set(s["counters"]) == {
        "released",
        "released_blunt",
        "reefers_powered",
        "reefers_lost",
        "demurrage_avoided_usd",
        "throughput_pct",
        "idle_hours",
        "idle_co2_kg",
    }
    assert set(s["legend"]) == {"live", "simulated"}
    assert {"live_count", "last_ok", "status"} <= set(s["poller"])


def test_queue_rows_carry_badges_and_clocks(client):
    rows = client.get("/api/queue").json()
    assert len(rows) == 191
    row = next(r for r in rows if r["number"] == "MSKU1234567")
    assert row["step"] == "HOLD" and row["hand"] is True
    assert set(row["badges"]) == {"carrier", "terminal", "customs", "weighbridge", "reefer"}
    assert set(row["badges"].values()) == {"simulated"}
    assert set(row["clocks"]) == {"lfd", "reefer", "appointment"}
    assert row["clocks"]["appointment"]["label"] == "Lane 5 at 01:00"


def test_queue_order_follows_spec(client):
    rows = client.get("/api/queue").json()
    pinned = [r for r in rows if r["pinned"]]
    assert rows[: len(pinned)] == pinned
    rest = rows[len(pinned) :]
    assert [r["urgency"] for r in rest] == sorted((r["urgency"] for r in rest), reverse=True)


def test_queue_filters(client):
    rows = client.get("/api/queue", params={"step": "HOLD"}).json()
    assert rows and all(r["step"] == "HOLD" for r in rows)
    carrier = client.get("/api/state").json()["carriers"][0]
    rows = client.get("/api/queue", params={"carrier": carrier}).json()
    assert rows and all(r["dray_carrier"] == carrier for r in rows)


def test_queue_reorders_when_reefer_power_off_fires(client):
    before = client.get("/api/queue").json()
    candidates = [
        r
        for r in before
        if r["equipment_type"] == "reefer" and r["step"] == "RELEASE" and r["clocks"]["reefer"]["power_on"]
    ]
    target = candidates[-1]["number"]
    res = client.post("/api/scenario/event", json={"type": "reefer_power_off", "box": target})
    assert res.status_code == 200
    after = client.get("/api/queue").json()
    assert positions(after)[target] < positions(before)[target]
    row = next(r for r in after if r["number"] == target)
    assert "R5" in row["fired"] and row["pinned"]
    assert [r["number"] for r in after] != [r["number"] for r in before]


def test_reset_works_twice_in_a_row(client):
    fresh = [r["number"] for r in client.get("/api/queue").json()]
    client.post("/api/scenario/jump", json={"t": "+00:45"})
    assert client.get("/api/state").json()["dark_sources"] == ["terminal"]
    first = client.post("/api/scenario/reset")
    second = client.post("/api/scenario/reset")
    assert first.status_code == second.status_code == 200
    s = second.json()
    assert s["offset"] == "+00:00" and s["mode"] == "tuesday" and s["dark_sources"] == []
    assert [r["number"] for r in client.get("/api/queue").json()] == fresh
    assert len(client.get("/api/audit").json()["lines"]) == 191


def test_scripted_events_fire_on_jump(client):
    client.post("/api/scenario/jump", json={"t": "+00:20"})
    s = client.get("/api/state").json()
    assert s["mode"] == "harbor_night"
    assert s["lanes_open"] == [1, 2, 3]
    row = next(r for r in client.get("/api/queue").json() if r["number"] == "TCLU7654321")
    assert row["step"] == "HOLD" and row["owner"] == "customs broker"


def test_direct_jump_matches_minute_by_minute(client):
    def steps():
        rows = client.get("/api/queue").json()
        return {s: sum(r["step"] == s for r in rows) for s in ("HAND", "SLOW", "WATCH", "HOLD", "ASK")}

    client.post("/api/scenario/jump", json={"t": "+00:44"})
    direct = steps()
    client.post("/api/scenario/reset")
    for minute in range(1, 45):
        client.post("/api/scenario/jump", json={"t": f"+00:{minute:02d}"})
    assert direct == steps() == {"HAND": 21, "SLOW": 58, "WATCH": 106, "HOLD": 5, "ASK": 1}


def test_approve_release_removes_box_and_counts(client):
    row = next(r for r in client.get("/api/queue").json() if r["step"] == "RELEASE" and not r["hand"])
    res = client.post("/api/decision", json={"box": row["number"], "action": "approve"})
    assert res.status_code == 200
    assert res.json()["released_at"]
    assert row["number"] not in positions(client.get("/api/queue").json())
    assert client.get("/api/state").json()["counters"]["released"] == 1
    line = client.get("/api/audit").json()["lines"][0]
    assert line["actor"] == "planner" and line["override"] is False and line["box"] == row["number"]


def test_override_writes_audit_with_override_true(client):
    res = client.post(
        "/api/decision", json={"box": "MSKU1234567", "action": "override", "step": "HAND", "note": "Call the broker"}
    )
    assert res.status_code == 200
    assert res.json()["step"] == "HAND"
    line = client.get("/api/audit", params={"box": "MSKU1234567"}).json()["lines"][0]
    assert line["actor"] == "planner" and line["override"] is True
    assert line["previous_step"] == "HOLD" and line["step"] == "HAND" and line["note"] == "Call the broker"


def test_approve_on_hand_needs_a_step(client):
    client.post("/api/scenario/jump", json={"t": "+00:45"})
    row = next(r for r in client.get("/api/queue").json() if r["step"] == "HAND")
    assert client.post("/api/decision", json={"box": row["number"], "action": "approve"}).status_code == 409


def test_box_detail(client):
    b = client.get("/api/box/MSKU1234567").json()
    assert set(b["sources"]) == {"carrier", "terminal", "customs", "weighbridge", "reefer"}
    assert {"R6", "R7"} <= {f["id"] for f in b["fired"]}
    assert "C3" in [c["code"] for c in b["conflicts"]]
    assert b["history"] and b["call"] is None
    assert client.get("/api/box/NOPE0000000").status_code == 404


def test_unknown_event_is_rejected(client):
    assert client.post("/api/scenario/event", json={"type": "meteor"}).status_code == 400


def run(coro):
    return asyncio.run(coro)


def test_poller_without_key_runs_on_fixture(tmp_path):
    fixture = tmp_path / "t49.json"
    fixture.write_text('{"data": []}')
    seen = []
    p = Poller(lambda payload, live: seen.append(live) or 0, key="", fixture=fixture)
    run(p.poll_once())
    assert p.status == "no_key" and seen == [False]


def test_poller_401_falls_back_to_fixture(tmp_path):
    fixture = tmp_path / "t49.json"
    fixture.write_text('{"data": []}')
    seen = []
    p = Poller(lambda payload, live: seen.append(live) or 0, key="k", fixture=fixture)
    transport = httpx.MockTransport(lambda request: httpx.Response(401, json={"errors": []}))

    async def go():
        async with httpx.AsyncClient(transport=transport) as c:
            await p.poll_once(c)

    run(go())
    assert p.status == "unauthorized" and seen == [False]
    assert p.snapshot()["live_count"] == 0


def test_poller_success_marks_boxes_live_and_writes_fixture(tmp_path, client):
    fixture = tmp_path / "t49.json"
    fixture.write_text('{"data": []}')
    payload = {
        "data": [
            {
                "id": "1",
                "type": "container",
                "attributes": {
                    "number": "MSKU1234567",
                    "weight_in_lbs": 44000,
                    "equipment_type": "reefer",
                    "equipment_length": 40,
                    "current_status": "available",
                    "available_for_pickup": False,
                    "availability_known": True,
                    "pickup_lfd": "2026-10-19",
                    "fees_at_pod_terminal": [],
                    "holds_at_pod_terminal": [
                        {"name": "customs", "status": "hold", "description": "CBP HOLD"},
                        {"name": "line", "status": "hold", "description": "LINE HOLD"},
                    ],
                    "terminal_checked_at": "2026-10-17T07:00:00Z",
                },
            }
        ]
    }

    def handler(request):
        assert request.headers["Authorization"] == "Token k"
        assert request.url.path == "/v2/containers"
        return httpx.Response(200, json=payload)

    p = Poller(scenario.apply_live, key="k", fixture=fixture)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            await p.poll_once(c)

    try:
        run(go())
        assert p.status == "ok" and p.live_count == 1
        assert json.loads(fixture.read_text()) == payload
        row = next(r for r in client.get("/api/queue").json() if r["number"] == "MSKU1234567")
        assert row["badges"]["carrier"] == "live" and row["badges"]["reefer"] == "simulated"
        box = client.get("/api/box/MSKU1234567").json()
        assert [h["name"] for h in box["sources"]["customs"]["fields"]["holds"]] == ["customs"]
        assert [h["name"] for h in box["sources"]["terminal"]["fields"]["holds"]] == ["line"]
    finally:
        scenario.live_payload = None
        scenario.reset()


# Phase 2: box card, audit panel, twist panel.


def test_box_card_shows_five_panels_c3_and_reason_for_harbor_night_box(client):
    client.post("/api/scenario/jump", json={"t": "+00:25"})
    b = client.get("/api/box/MSKU1234567").json()
    assert [name for name, s in b["sources"].items() if s] == ["carrier", "terminal", "customs", "weighbridge", "reefer"]
    for s in b["sources"].values():
        assert {"fields", "age", "trust", "trust_reason", "badge", "dark"} <= set(s)
        assert 0 <= s["trust"] <= 1 and s["badge"] == "simulated" and s["trust_reason"].endswith(f"trust {s['trust']:.2f}")
    c3 = next(c for c in b["conflicts"] if c["code"] == "C3")
    assert c3["sources"] == ["reefer"] and set(c3["values"]) == {"power_on", "product_temp_c", "set_point_c"}
    assert c3["sentence"].startswith("Reefer power off")
    fired = {f["id"]: f for f in b["fired"]}
    assert fired["R6"]["step"] == "HOLD" and fired["R6"]["name"] == "reefer under hold" and fired["R6"]["why"]
    assert fired["R7"]["file"] == "backend/rules/r07_hold_owner.py"
    assert b["decision"]["step"] == "HOLD" and "Escalated to planner with reefer evidence." in b["decision"]["reason"]
    assert b["mode"] == "harbor_night" and b["warmup"]["off_since"] == "2026-10-18T21:00:00-07:00"
    assert b["warmup"]["note"].startswith("Assumption.")
    assert b["history"] and b["history"][0]["box"] == "MSKU1234567"


def test_override_from_card_lands_in_history_with_override_true(client):
    client.post("/api/scenario/jump", json={"t": "+00:25"})
    res = client.post("/api/decision", json={"box": "MSKU1234567", "action": "override", "step": "WATCH", "note": "Broker is on it"})
    assert res.status_code == 200
    card = client.get("/api/box/MSKU1234567").json()
    top = card["history"][0]
    assert top["actor"] == "planner" and top["override"] is True and top["step"] == "WATCH" and top["note"] == "Broker is on it"
    assert top["previous_step"] == "HOLD"
    assert card["decision"]["step"] == "WATCH" and card["decision"]["engine_step"] == "HOLD"
    audit = client.get("/api/audit", params={"limit": 1}).json()
    assert audit["lines"][0]["seq"] == top["seq"] and audit["lines"][0]["override"] is True


def test_audit_newest_first_with_limit_and_box_filter(client):
    data = client.get("/api/audit", params={"limit": 5}).json()
    assert len(data["lines"]) == 5 and data["total"] == 191
    seqs = [x["seq"] for x in data["lines"]]
    assert seqs == sorted(seqs, reverse=True)
    lines = client.get("/api/audit", params={"box": "msku1234"}).json()["lines"]
    assert lines and all("MSKU1234" in x["box"] for x in lines)


def test_twist_panel_lists_the_scripted_twist(client):
    assert "twist-1" not in [t["tag"] for t in client.get("/api/audit").json()["twists"]]
    client.post("/api/scenario/jump", json={"t": "+01:00"})
    t = next(t for t in client.get("/api/audit").json()["twists"] if t["tag"] == "twist-1")
    assert t["received_at"] == "2026-10-18T23:00:00-07:00" and t["status"] == "received" and t["added"] == []


def test_twist_log_joins_twist_file_and_tagged_rule_files(tmp_path):
    from backend.audit import twist_log
    from backend.models import Rule

    log = tmp_path / "twists.json"
    log.write_text(json.dumps([{"tag": "twist-2", "text": "Chassis shortage", "received_at": "2026-10-17T15:00:00+00:00", "merged_at": "2026-10-17T15:20:00+00:00", "added": ["backend/rules/r12_chassis.py"]}]))
    rule = Rule(id="R12", step="SLOW", test=lambda c: False, why=lambda c: "", twist_tag="twist-2", created_at="2026-10-17T15:18:00+00:00", name="chassis", file="backend/rules/r12_chassis.py")
    scripted = [{"tag": "twist-1", "note": "paste the twist text here", "received_at": "2026-10-18T23:00:00-07:00"}]
    rows = {r["tag"]: r for r in twist_log(scripted, [rule], log)}
    assert rows["twist-1"]["status"] == "received"
    merged = rows["twist-2"]
    assert merged["status"] == "merged" and merged["merged_at"] == "2026-10-17T15:20:00+00:00"
    assert merged["added"] == [{"kind": "rule", "id": "R12", "name": "chassis", "file": "backend/rules/r12_chassis.py", "created_at": "2026-10-17T15:18:00+00:00"}]


def test_prompts_show_the_retell_prompt_the_setup_script_sends(client):
    from scripts import retell_setup

    retell = client.get("/api/prompts").json()["retell"]
    assert retell["prompt"] == retell_setup.prompt(True)
    assert retell["agent_name"] == "Pier 7 gate desk" and retell["source"] == "scripts/retell_setup.py"
    assert [t["name"] for t in retell["tools"]] == ["lookup_box", "record_outcome", "end_call"]
    assert [a["name"] for a in retell["analysis"]] == ["outcome", "callback_needed", "notes"]
    assert "rung.example" not in json.dumps(retell) and retell["functions_live"] is False
