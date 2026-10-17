import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.engine import evaluate
from backend.main import app, scenario
from backend.voice import MOCK_LINE_SECONDS, MockCalls, Voice, VoiceSettings, normalize, script

VARIABLE_KEYS = {"container_number", "manifest_weight_lbs", "measured_weight_lbs", "appointment_time", "trucker_name", "dray_carrier"}


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeCalls:
    def __init__(self):
        self.web = []
        self.phone = []
        self.analysis = None

    def create_web_call(self, **kw):
        self.web.append(kw)
        return SimpleNamespace(call_id="call_live_1", access_token="tok_live_1")

    def create_phone_call(self, **kw):
        self.phone.append(kw)
        return SimpleNamespace(call_id="call_phone_1", access_token=None)

    def retrieve(self, call_id):
        return {
            "call_id": call_id,
            "call_status": "ended" if self.analysis else "ongoing",
            "transcript_object": [{"role": "agent", "content": "Hello"}, {"role": "user", "content": "Hi"}],
            "call_analysis": {"custom_analysis_data": self.analysis} if self.analysis else None,
        }


class FakeRetell:
    def __init__(self, signature_ok=True):
        self.call = FakeCalls()
        self.signature_ok = signature_ok
        self.verified = []

    def verify(self, body, api_key, signature):
        self.verified.append((body, api_key, signature))
        return self.signature_ok


@pytest.fixture()
def client(monkeypatch):
    clock = FakeClock()
    monkeypatch.setattr(main, "voice", Voice(VoiceSettings(), mock=MockCalls(clock)))
    c = TestClient(app)
    c.post("/api/scenario/speed", json={"minutes_per_second": 0})
    c.post("/api/scenario/reset")
    c.clock = clock
    yield c


def box_with(case):
    return next(s.number for s in scenario.boxes.values() if s.weight_case == case)


def finish_mock_call(c):
    c.clock.t += MOCK_LINE_SECONDS * 20


def test_ask_on_the_heavy_box_opens_a_web_call_and_lands_transcript_and_audit(client):
    heavy = box_with("heavy")
    before = client.get(f"/api/box/{heavy}").json()
    assert "C1" in [c["code"] for c in before["conflicts"]]
    assert before["decision"]["step"] == "ASK"
    assert before["call"] is None
    assert before["ask"]["mode"] == "mock" and before["ask"]["default_outcome"] == "confirmed_loaded"

    r = client.post(f"/api/call/{heavy}", json={})
    assert r.status_code == 200
    started = r.json()
    assert started["mode"] == "web" and started["mock"] is True
    assert started["call_id"].startswith("mock_call_") and started["access_token"]

    mid = client.get(f"/api/box/{heavy}").json()
    assert mid["call"]["status"] == "ongoing"
    assert len(mid["call"]["transcript"]) == 1
    assert client.post(f"/api/call/{heavy}").status_code == 409

    finish_mock_call(client)
    done = client.get(f"/api/box/{heavy}").json()
    call = done["call"]
    assert call["call_id"] == started["call_id"]
    assert call["status"] == "ended"
    assert len(call["transcript"]) == 6
    assert call["transcript"][0]["role"] == "agent" and call["transcript"][1]["role"] == "trucker"
    assert "36,000 pounds" in call["transcript"][2]["content"] and "40,500 pounds" in call["transcript"][2]["content"]
    assert call["outcome"] == "confirmed_loaded"

    assert done["decision"]["step"] == "HAND" and done["decision"]["hand"] is True
    assert "C1" in [c["code"] for c in done["conflicts"]]
    assert done["sources"]["weighbridge"]["trust"] > before["sources"]["weighbridge"]["trust"]
    assert "trucker call backed it" in done["sources"]["weighbridge"]["trust_reason"]
    assert "R12" in [f["id"] for f in done["fired"]]

    voice_lines = [h for h in done["history"] if h["actor"] == "voice"]
    assert [h["action"] for h in voice_lines] == ["call_outcome", "call"]
    assert all(h["call_id"] == started["call_id"] for h in voice_lines)
    assert voice_lines[0]["outcome"] == "confirmed_loaded"
    audit = client.get("/api/audit", params={"box": heavy}).json()["lines"]
    assert any(line.get("call_id") == started["call_id"] and line.get("outcome") == "confirmed_loaded" for line in audit)


@pytest.mark.parametrize(
    "outcome, step, c1_open",
    [("confirmed_empty", None, False), ("unknown", "HOLD", True), ("reschedule_accepted", "SLOW", True)],
)
def test_each_outcome_reevaluates_the_box(client, outcome, step, c1_open):
    heavy = box_with("heavy")
    before = client.get(f"/api/box/{heavy}").json()
    client.post(f"/api/call/{heavy}", json={"mock_outcome": outcome})
    finish_mock_call(client)
    after = client.get(f"/api/box/{heavy}").json()
    assert after["call"]["outcome"] == outcome
    codes = [c["code"] for c in after["conflicts"]]
    assert ("C1" in codes) is c1_open
    if step:
        assert after["decision"]["step"] == step
    if outcome == "confirmed_empty":
        assert after["sources"]["carrier"]["trust"] > before["sources"]["carrier"]["trust"]
        assert after["decision"]["step"] != "ASK"
    if outcome == "unknown":
        assert after["decision"]["hand"] is True and after["decision"]["owner"] == "shipping line"
        assert after["call"]["callback_needed"] is True


def test_call_on_unknown_or_released_box(client):
    assert client.post("/api/call/NOPE0000000").status_code == 404
    clean = next(r for r in client.get("/api/queue").json() if r["step"] == "RELEASE" and not r["hand"])
    client.post("/api/decision", json={"box": clean["number"], "action": "approve"})
    r = client.post(f"/api/call/{clean['number']}")
    assert r.status_code == 409 and "released" in r.json()["detail"]


def test_poller_sync_records_the_outcome(client):
    empty = box_with("declared_empty")
    client.post(f"/api/call/{empty}", json={})
    finish_mock_call(client)
    for number, call in scenario.active_calls():
        main.sync_call(number, call)
    assert scenario.boxes[empty].call["outcome"] == "confirmed_loaded"
    assert scenario.boxes[empty].call["source"] == "call_analysis"
    assert scenario.active_calls() == []


def test_live_web_call_uses_create_web_call_with_string_variables(client, monkeypatch):
    fake = FakeRetell()
    settings = VoiceSettings(api_key="key_test", agent_id="agent_test", public_key="pub_test")
    monkeypatch.setattr(main, "voice", Voice(settings, client=fake))
    heavy = box_with("heavy")
    r = client.post(f"/api/call/{heavy}").json()
    assert r == {"call_id": "call_live_1", "access_token": "tok_live_1", "mode": "web", "mock": False}
    kw = fake.call.web[0]
    assert kw["agent_id"] == "agent_test"
    assert kw["metadata"] == {"box": heavy}
    assert set(kw["retell_llm_dynamic_variables"]) == VARIABLE_KEYS
    assert all(isinstance(v, str) for v in kw["retell_llm_dynamic_variables"].values())
    assert kw["retell_llm_dynamic_variables"]["manifest_weight_lbs"] == "36000"
    assert kw["retell_llm_dynamic_variables"]["measured_weight_lbs"] == "40500"
    assert fake.call.phone == []

    for number, call in scenario.active_calls():
        main.sync_call(number, call)
    assert scenario.boxes[heavy].call["transcript"] == [{"role": "agent", "content": "Hello"}, {"role": "trucker", "content": "Hi"}]
    assert scenario.boxes[heavy].call["outcome"] is None

    fake.call.analysis = {"outcome": "confirmed_empty", "callback_needed": False, "notes": "Empty"}
    for number, call in scenario.active_calls():
        main.sync_call(number, call)
    box = client.get(f"/api/box/{heavy}").json()
    assert box["call"]["outcome"] == "confirmed_empty"
    assert "C1" not in [c["code"] for c in box["conflicts"]]


def test_phone_call_only_when_number_and_flag_are_set(client, monkeypatch):
    heavy = box_with("heavy")
    fake = FakeRetell()
    no_flag = VoiceSettings(api_key="k", agent_id="a", from_number="+13105550000", phone_enabled=False)
    assert no_flag.mode == "web"
    settings = VoiceSettings(api_key="k", agent_id="a", from_number="+13105550000", phone_enabled=True)
    monkeypatch.setattr(main, "voice", Voice(settings, client=fake))
    r = client.post(f"/api/call/{heavy}").json()
    assert r["mode"] == "phone" and r["access_token"] is None
    kw = fake.call.phone[0]
    assert kw["from_number"] == "+13105550000"
    assert kw["to_number"] == scenario.boxes[heavy].appointment["trucker_phone"]
    assert kw["override_agent_id"] == "a"
    assert fake.call.web == []


def test_custom_functions_without_key(client):
    r = client.post("/api/retell/lookup", json={"args": {"container_number": "MSKU 123 456 7"}})
    assert r.status_code == 200
    assert r.json()["result"].startswith("Container MSKU 123 456 7 is on hold. The customs broker has to clear it.")
    assert "Please check the number" in client.post("/api/retell/lookup", json={"args": {"container_number": "ABCD1"}}).json()["result"]

    heavy = box_with("heavy")
    body = {"name": "record", "call": {"call_id": "call_in_9", "metadata": {"box": heavy}}, "args": {"outcome": "unknown", "notes": "Not sure"}}
    r = client.post("/api/retell/record", json=body)
    assert r.status_code == 200 and r.json()["result"].startswith("Recorded.")
    box = client.get(f"/api/box/{heavy}").json()
    assert box["call"]["call_id"] == "call_in_9" and box["call"]["outcome"] == "unknown"
    assert box["decision"]["step"] == "HOLD"
    line = next(h for h in box["history"] if h["actor"] == "voice")
    assert line["call_id"] == "call_in_9" and line["outcome"] == "unknown" and line["note"] == "Not sure"


def test_custom_functions_verify_the_signature_with_a_key(client, monkeypatch):
    fake = FakeRetell(signature_ok=False)
    monkeypatch.setattr(main, "voice", Voice(VoiceSettings(api_key="key_x", agent_id="a"), client=fake))
    body = json.dumps({"args": {"container_number": "MSKU1234567"}})
    r = client.post("/api/retell/lookup", content=body, headers={"x-retell-signature": "v=1,d=bad", "Content-Type": "application/json"})
    assert r.status_code == 401
    assert fake.verified == [(body, "key_x", "v=1,d=bad")]
    assert client.post("/api/retell/record", json={"args": {}}).status_code == 401

    fake.signature_ok = True
    r = client.post("/api/retell/lookup", content=body, headers={"x-retell-signature": "v=1,d=ok", "Content-Type": "application/json"})
    assert r.status_code == 200 and "MSKU 123 456 7" in r.json()["result"]


def test_state_reports_voice_mode_and_missing_keys(client):
    voice = client.get("/api/state").json()["voice"]
    assert voice["mode"] == "mock"
    assert voice["missing"] == ["RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_PUBLIC_KEY", "PUBLIC_BASE_URL"]


def test_mock_transcript_unfolds_and_normalize_guards_outcomes():
    clock = FakeClock()
    mock = MockCalls(clock)
    variables = {k: "x" for k in VARIABLE_KEYS} | {"container_number": "CMAU9939083", "manifest_weight_lbs": "36000", "measured_weight_lbs": "40500"}
    made = mock.create(variables, {"box": "CMAU9939083"}, "unknown")
    first = normalize(mock.retrieve(made["call_id"]))
    assert first["status"] == "ongoing" and len(first["transcript"]) == 1 and first["analysis"] is None
    clock.t += MOCK_LINE_SECONDS * 2
    assert len(normalize(mock.retrieve(made["call_id"]))["transcript"]) == 3
    clock.t += MOCK_LINE_SECONDS * 10
    done = normalize(mock.retrieve(made["call_id"]))
    assert done["status"] == "ended"
    assert done["analysis"] == {"outcome": "unknown", "callback_needed": True, "notes": script("unknown", variables)[1]["notes"]}

    odd = normalize({"call_status": "ended", "call_analysis": {"custom_analysis_data": {"outcome": "maybe"}}})
    assert odd["analysis"]["outcome"] == "unknown"
    failed = normalize({"call_status": "error"})
    assert failed["analysis"]["outcome"] == "unknown"


def test_engine_stays_pure_with_a_call_outcome():
    state = scenario.boxes[box_with("heavy")]
    view = scenario.box_view(state)
    view.call_outcome = "confirmed_loaded"
    a = evaluate(view, scenario.now)
    b = evaluate(view, scenario.now)
    assert a.step == b.step == "HAND"
    assert a.reason == b.reason
