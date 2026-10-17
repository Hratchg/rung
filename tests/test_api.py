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
