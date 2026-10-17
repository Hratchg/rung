"""Phase 5: dark feed banner, spoof input, rated order mode, silent reefer classifier, twist diff."""
import asyncio
import subprocess
from datetime import timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.audit import twist_log
from backend.engine import classify_silence, evaluate
from backend.gitdiff import TwistDiffs
from backend.main import app, scenario
from backend.models import Box
from backend.t49 import Poller
from backend.timefmt import iso, parse_dt

TRIP_CIRCUIT = "R4"
TELEMETRY_BOX = "MSCU4045313"
FAILED_BOX = "HLBU4421825"
RATED = ["MSCU3638612", "ONEU3340886", "MSKU8397245", "TCLU4140020", "TCLU1782617", "MSKU5027648"]


@pytest.fixture()
def client():
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    yield c
    c.post("/api/scenario/reset")


def rows_by_number(client):
    return {r["number"]: r for r in client.get("/api/queue").json()}


# Dark feed banner.


def test_banner_shows_terminal_feed_dark_with_minutes_and_queue_keeps_running(client):
    assert client.get("/api/state").json()["dark_feed"] == []
    client.post("/api/scenario/jump", json={"t": "+00:52"})
    banner = client.get("/api/state").json()["dark_feed"]
    assert len(banner) == 1
    line = banner[0]
    assert line["source"] == "terminal" and line["cause"] == "scenario" and line["minutes"] == 12
    assert line["text"] == "Terminal feed dark, 12 min"
    assert "snapshot taken at 22:40" in line["detail"]
    rows = client.get("/api/queue").json()
    assert len(rows) == 191 and all(r["reason"] for r in rows)
    waiting = [r for r in rows if "R10" in r["fired"]]
    assert waiting and {r["step"] for r in waiting} <= {"WATCH", "HAND", "HOLD", "SLOW", "ASK"}


def test_banner_shows_when_the_poller_fails_and_not_without_a_key(client, monkeypatch, tmp_path):
    fixture = tmp_path / "t49.json"
    fixture.write_text('{"data": []}')
    failing = Poller(lambda payload, live: 0, key="k", fixture=fixture)

    def boom(request):
        raise httpx.ConnectError("no route to api.terminal49.com")

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(boom)) as c:
            await failing.poll_once(c)

    asyncio.run(go())
    assert failing.status == "error" and failing.failing_since
    first = failing.failing_since
    asyncio.run(go())
    assert failing.failing_since == first
    monkeypatch.setattr(main, "poller", failing)
    banner = client.get("/api/state").json()["dark_feed"]
    assert [(b["cause"], b["text"]) for b in banner] == [("poller", "Terminal feed dark, 0 min")]
    assert "fixtures/t49_snapshot.json" in banner[0]["detail"]
    assert len(client.get("/api/queue").json()) == 191

    no_key = Poller(lambda payload, live: 0, key="", fixture=fixture)
    asyncio.run(no_key.poll_once())
    monkeypatch.setattr(main, "poller", no_key)
    assert no_key.failing_since is None and client.get("/api/state").json()["dark_feed"] == []


# Spoof input.


def test_spoof_weight_reevaluates_and_moves_the_trust_bars(client):
    number = "MSKU5027648"
    before = client.get(f"/api/box/{number}").json()
    assert before["decision"]["step"] == "RELEASE" and not before["conflicts"]
    res = client.post(f"/api/box/{number}/spoof", json={"weight_in_lbs": 41000})
    assert res.status_code == 200
    body = res.json()
    assert body["before"]["step"] == "RELEASE" and body["after"]["step"] == "ASK"
    assert body["after"]["trust"]["carrier"] < body["before"]["trust"]["carrier"]
    assert body["after"]["trust"]["weighbridge"] < body["before"]["trust"]["weighbridge"]
    assert body["effect"].startswith("Spoof input. Carrier weight set to 41,000 lb")
    card = client.get(f"/api/box/{number}").json()
    assert card["sources"]["carrier"]["fields"]["weight_in_lbs"] == 41000
    assert card["sources"]["carrier"]["trust"] == body["after"]["trust"]["carrier"]
    assert "C1" in [c["code"] for c in card["conflicts"]] and "R3" in [f["id"] for f in card["fired"]]
    assert card["spoof"]["spoofed"]["carrier"] == card["sources"]["carrier"]["observed_at"]
    top = card["history"][0]
    assert top["actor"] == "spoof" and top["action"] == "spoof" and top["previous_step"] == "RELEASE" and top["step"] == "ASK"


def test_spoof_hold_toggle_places_and_clears_a_hold(client):
    number = "MSKU5027648"
    on = client.post(f"/api/box/{number}/spoof", json={"hold": {"name": "customs", "on": True}}).json()
    assert on["after"]["step"] == "HOLD" and on["decision"]["owner"] == "customs broker" and on["decision"]["hand"] is True
    card = client.get(f"/api/box/{number}").json()
    assert next(h for h in card["spoof"]["holds"] if h["name"] == "customs")["active"] is True
    assert {"C2"} <= {c["code"] for c in card["conflicts"]}
    off = client.post(f"/api/box/{number}/spoof", json={"hold": {"name": "customs", "on": False}}).json()
    assert off["after"]["step"] == "RELEASE" and off["effect"] == "Spoof input. Customs hold cleared."
    again = client.post(f"/api/box/{number}/spoof", json={"hold": {"name": "line", "on": False}}).json()
    assert again["effect"] == "Spoof input. No line hold to clear."
    line = client.post(f"/api/box/{number}/spoof", json={"hold": {"name": "line", "on": True}}).json()
    assert line["after"]["step"] == "HOLD" and line["decision"]["owner"] == "shipping line"


def test_spoof_rejects_bad_input(client):
    assert client.post("/api/box/NOPE0000000/spoof", json={"weight_in_lbs": 1}).status_code == 404
    assert client.post("/api/box/MSKU5027648/spoof", json={}).status_code == 409
    assert client.post("/api/box/MSKU5027648/spoof", json={"weight_in_lbs": -5}).status_code == 422
    client.post("/api/decision", json={"box": "MSKU5027648", "action": "approve"})
    assert client.post("/api/box/MSKU5027648/spoof", json={"weight_in_lbs": 9000}).status_code == 409


# Rated order mode.


def test_rated_mode_adds_50_urgency_and_release_priority_through_the_ladder(client):
    client.post("/api/scenario/jump", json={"t": "+00:15"})
    off = rows_by_number(client)
    state = client.post("/api/scenario/rated", json={"on": True}).json()
    assert state["rated"] == {
        "available": True,
        "on": True,
        "deadline": "2026-10-19T03:00:00-07:00",
        "latest_window": "02:00",
        "boxes": RATED,
    }
    on = rows_by_number(client)
    for number in RATED:
        assert on[number]["urgency"] == min(100, off[number]["urgency"] + 50)
        assert "R13" in on[number]["fired"] and on[number]["rated"]["label"].startswith("Rated. Gate out by 03:00")
    released = [n for n in RATED if on[n]["step"] == "RELEASE"]
    assert released and all(on[n]["pinned"] for n in released)
    release_group = [r["number"] for r in client.get("/api/queue").json() if r["step"] == "RELEASE"]
    assert set(release_group[: len(released)]) == set(released)
    # Lane 4 is closed, so the rated box there still goes SLOW. The ladder picks the strongest step.
    assert on["ONEU3340886"]["step"] == "SLOW" and "R9" in on["ONEU3340886"]["fired"]

    client.post("/api/scenario/rated", json={"on": False})
    back = rows_by_number(client)
    assert all(back[n]["urgency"] == off[n]["urgency"] and back[n]["rated"] is None for n in RATED)


def test_rated_orders_keep_a_slot_before_the_deadline_and_overflow_shows_who_slid(client):
    client.post("/api/scenario/jump", json={"t": "+00:15"})
    before = client.get("/api/gate").json()
    assert set(RATED[:5]) <= {o["box"] for o in before["overflow"]}
    assert all(o["slid"] is False for o in before["overflow"])
    client.post("/api/scenario/rated", json={"on": True})
    gate = client.get("/api/gate").json()
    assert gate["solve_ms"] < 100
    for number in RATED:
        chip = gate["placed"][number]
        assert chip["rated"] is True and chip["window"] in ("22:00", "23:00", "00:00", "01:00", "02:00")
    assert [r["status"] for r in gate["rated"]["rows"]] == ["on_time"] * len(RATED)
    slid = [o for o in gate["overflow"] if o["slid"]]
    assert slid and gate["rated"]["slid"] == len(slid)
    for o in slid:
        assert o["box"] not in RATED and o["slid_from"] and "Slid when rated orders took the slots" in o["reason"]
        assert o["box"] in before["placed"]
    assert not any(o["box"] in RATED for o in gate["overflow"])


def test_rated_toggle_without_a_list_is_refused(client, monkeypatch):
    monkeypatch.setattr(scenario, "rated_boxes", [])
    assert client.post("/api/scenario/rated", json={"on": True}).status_code == 409


# Silent reefer classifier.


def test_circuit_trip_classifies_every_unit_as_tripped(client):
    client.post("/api/scenario/jump", json={"t": "+00:15"})
    applied = client.post("/api/scenario/event", json={"type": "circuit_trip", "circuit": TRIP_CIRCUIT}).json()["applied"]
    members = applied["boxes"]
    assert len(members) == 5
    client.post("/api/scenario/jump", json={"t": "+00:20"})
    for number in members:
        b = client.get(f"/api/box/{number}").json()
        assert b["silence"]["kind"] == "tripped" and b["silence"]["circuit"] == TRIP_CIRCUIT
        assert len(b["silence"]["peers"]) == 4
        assert b["decision"]["step"] == "ASK" and "R14" in [f["id"] for f in b["fired"]]
        assert "Likely a tripped breaker. Ask the reefer crew to check circuit R4" in b["decision"]["reason"]
        assert b["clocks"]["reefer"]["label"].endswith("Tripped circuit")
    state = client.get("/api/state").json()
    assert all(r["silent"] and not r["power_on"] for r in state["reefers"] if r["number"] in members)


def test_single_silences_classify_as_telemetry_or_failed_with_different_ask_texts(client):
    client.post("/api/scenario/jump", json={"t": "+00:15"})
    client.post("/api/scenario/event", json={"type": "reefer_silent", "box": TELEMETRY_BOX})
    client.post("/api/scenario/event", json={"type": "reefer_silent", "box": FAILED_BOX, "alarm": "compressor fault"})
    client.post("/api/scenario/jump", json={"t": "+00:20"})
    tele = client.get(f"/api/box/{TELEMETRY_BOX}").json()
    failed = client.get(f"/api/box/{FAILED_BOX}").json()
    assert tele["silence"]["kind"] == "telemetry" and tele["silence"]["peers"] == []
    assert 2.0 <= tele["silence"]["draw_kw"] <= 8.0 and tele["silence"]["alarm"] is None
    assert failed["silence"]["kind"] == "failed" and failed["silence"]["alarm"] == "compressor fault"
    assert tele["decision"]["step"] == failed["decision"]["step"] == "ASK"
    assert tele["decision"]["owner"] == failed["decision"]["owner"] == "reefer crew"
    why = {b["number"]: next(f["why"] for f in b["fired"] if f["id"] == "R14") for b in (tele, failed)}
    assert "Likely a telemetry fault" in why[TELEMETRY_BOX] and "manual temperature read" in why[TELEMETRY_BOX]
    assert "sent the alarm compressor fault" in why[FAILED_BOX] and "reefer technician" in why[FAILED_BOX]
    # A telemetry fault keeps cooling, so its clock stays stopped. A failed unit warms from the fault.
    assert tele["warmup"]["power_on"] is True and tele["warmup"]["silent_since"]
    assert failed["warmup"]["cause"] == "fault" and failed["warmup"]["off_since"] == "2026-10-18T22:15:00-07:00"
    res = client.post("/api/decision", json={"box": TELEMETRY_BOX, "action": "approve"}).json()
    assert res["step"] == "ASK"
    assert client.get(f"/api/box/{TELEMETRY_BOX}").json()["history"][0]["effect"] == "Reefer crew asked for a manual temperature read."


def test_power_on_restores_a_silent_unit(client):
    client.post("/api/scenario/jump", json={"t": "+00:15"})
    client.post("/api/scenario/event", json={"type": "reefer_silent", "box": TELEMETRY_BOX})
    client.post("/api/scenario/jump", json={"t": "+00:18"})
    assert client.get(f"/api/box/{TELEMETRY_BOX}").json()["silence"]["kind"] == "telemetry"
    again = client.post("/api/scenario/event", json={"type": "reefer_silent", "box": TELEMETRY_BOX}).json()["applied"]
    assert again["ignored"] == "already silent"
    client.post("/api/scenario/event", json={"type": "reefer_power_on", "box": TELEMETRY_BOX})
    client.post("/api/scenario/jump", json={"t": "+00:20"})
    b = client.get(f"/api/box/{TELEMETRY_BOX}").json()
    assert b["silence"] is None and b["decision"]["step"] != "ASK"
    assert b["sources"]["reefer"]["fields"]["last_seen"] == "2026-10-18T22:18:00-07:00"


def test_unknown_circuit_and_non_reefer_silences_are_ignored(client):
    assert client.post("/api/scenario/event", json={"type": "circuit_trip", "circuit": "R99"}).json()["applied"]["ignored"] == "no reefers on that circuit"
    assert client.post("/api/scenario/event", json={"type": "reefer_silent", "box": "MSKU5027648"}).json()["applied"]["ignored"] == "not a reefer"


def silent_reefer(number, since, circuit="R4", draw=4.5, alarm=None, peers=()):
    return Box(
        number=number,
        reefer={
            "set_point_c": -1.4,
            "air_temp_c": -1.0,
            "product_temp_c": -1.3,
            "power_on": True,
            "last_seen": iso(since - timedelta(minutes=20)),
            "cargo": "chilled beef",
            "circuit": circuit,
            "draw_kw": draw,
            "alarm": alarm,
            "comms_lost_at": iso(since),
        },
        circuit_peers=tuple(peers),
    )


def test_classifier_needs_three_units_within_ten_minutes():
    now = parse_dt("2026-10-18T23:30:00-07:00")
    lost = parse_dt("2026-10-18T23:00:00-07:00")

    def peer(number, minutes):
        return {"number": number, "last_seen": iso(lost - timedelta(minutes=30)), "comms_lost_at": iso(lost + timedelta(minutes=minutes))}

    assert classify_silence(silent_reefer("A", lost, peers=[peer("B", 4), peer("C", 9)]), now)["kind"] == "tripped"
    assert classify_silence(silent_reefer("A", lost, peers=[peer("B", 4)]), now)["kind"] == "telemetry"
    assert classify_silence(silent_reefer("A", lost, peers=[peer("B", 4), peer("C", 25)]), now)["peers"] == ["B"]
    assert classify_silence(silent_reefer("A", lost, draw=0.4), now)["kind"] == "failed"
    assert classify_silence(silent_reefer("A", lost, alarm="high temperature"), now)["kind"] == "failed"
    assert classify_silence(silent_reefer("A", lost, draw=None), now)["kind"] == "telemetry"
    talking = silent_reefer("A", lost)
    talking.reefer["comms_lost_at"] = None
    talking.reefer["last_seen"] = iso(now - timedelta(minutes=50))
    assert classify_silence(talking, now) is None
    talking.reefer["last_seen"] = iso(now - timedelta(hours=2, minutes=10))
    assert classify_silence(talking, now)["kind"] == "telemetry"
    box = silent_reefer("A", lost, peers=[peer("B", 4), peer("C", 9)])
    assert evaluate(box, now) == evaluate(box, now)


# Twist diff.


def git(root, *args):
    subprocess.run(["git", "-c", "user.name=Rung test", "-c", "user.email=rung@example.com", "-C", str(root), *args], check=True, capture_output=True)


def test_twist_diff_reads_twist_commits_and_git_tags(tmp_path):
    git(tmp_path, "init", "-q")
    (tmp_path / "README.md").write_text("Rung\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "phase0: repo")
    rules = tmp_path / "backend" / "rules"
    rules.mkdir(parents=True)
    (rules / "r15_chassis.py").write_text('created_at = "2026-10-17T19:00:00+00:00"\nTWIST = "twist-9"\n')
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "twist: twist-9")
    (tmp_path / "notes.txt").write_text("tagged\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-q", "-m", "phase5: tagged change")
    git(tmp_path, "tag", "twist-8")

    commits = TwistDiffs(tmp_path).commits()
    assert set(commits) == {"twist-9", "twist-8"}
    c = commits["twist-9"][0]
    assert c["subject"] == "twist: twist-9" and c["via"] == "message" and len(c["short"]) >= 7
    assert c["files"] == [{"path": "backend/rules/r15_chassis.py", "added": 2, "deleted": 0}]
    assert '+TWIST = "twist-9"' in c["patch"] and c["truncated"] is False
    assert commits["twist-8"][0]["via"] == "git tag" and commits["twist-8"][0]["files"][0]["path"] == "notes.txt"

    scripted = [{"tag": "twist-1", "note": "paste the twist text here", "received_at": "2026-10-18T23:00:00-07:00"}]
    rows = {r["tag"]: r for r in twist_log(scripted, [], None, commits)}
    assert rows["twist-9"]["status"] == "merged" and rows["twist-9"]["git"]["commits"][0]["sha"] == c["sha"]
    assert rows["twist-9"]["merged_at"] == c["date"]
    assert rows["twist-1"]["status"] == "received" and rows["twist-1"]["git"] == {"available": True, "commits": []}
    lean = {r["tag"]: r for r in twist_log(scripted, [], None, commits, patches=False)}
    assert "patch" not in lean["twist-9"]["git"]["commits"][0]


def test_twist_diff_without_git(tmp_path):
    assert TwistDiffs(tmp_path).commits() is None
    rows = twist_log([{"tag": "twist-1", "note": "", "received_at": "2026-10-18T23:00:00-07:00"}], [], None, None)
    assert rows[0]["git"] == {"available": False, "commits": []}


def test_audit_twists_carry_git_for_the_real_repo(client):
    client.post("/api/scenario/jump", json={"t": "+01:00"})
    twists = client.get("/api/audit", params={"diff": True}).json()["twists"]
    row = next(t for t in twists if t["tag"] == "twist-1")
    assert row["git"]["available"] is True and row["status"] == "received"
