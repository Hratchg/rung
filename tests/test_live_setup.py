import os
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from retell import NotFoundError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import scenario  # noqa: E402
from backend.models import CALL_OUTCOMES  # noqa: E402
from scripts import envfile, retell_setup  # noqa: E402

SECRET = "key_test_secret_value"


def not_found() -> NotFoundError:
    req = httpx.Request("GET", "https://api.retellai.com/x")
    return NotFoundError("not found", response=httpx.Response(404, request=req), body=None)


class FakeResource:
    def __init__(self, kind: str, known: set[str]):
        self.kind = kind
        self.known = known
        self.created: list[dict] = []
        self.updated: list[tuple[str, dict]] = []

    def retrieve(self, resource_id):
        if resource_id not in self.known:
            raise not_found()
        return SimpleNamespace()

    def create(self, **kw):
        self.created.append(kw)
        new_id = f"{self.kind}_new{len(self.created)}"
        self.known.add(new_id)
        return SimpleNamespace(**{f"{self.kind}_id": new_id})

    def update(self, resource_id, **kw):
        self.updated.append((resource_id, kw))


class FakeRetell:
    def __init__(self, llms=(), agents=(), voices=("11labs-Adrian", "retell-Cimo")):
        self.llm = FakeResource("llm", set(llms))
        self.agent = FakeResource("agent", set(agents))
        self.voice = SimpleNamespace(list=lambda: [SimpleNamespace(voice_id=v, accent="American") for v in voices])
        self.bound: list[tuple[str, dict]] = []
        self.phone_number = SimpleNamespace(update=lambda number, **kw: self.bound.append((number, kw)))


@pytest.fixture
def env_file(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text(
        "T49_API_KEY=            # Terminal49 key\n"
        f"RETELL_API_KEY={SECRET}   # Retell secret key\n"
        "RETELL_AGENT_ID=        # Agent id\n"
        "PUBLIC_BASE_URL=https://abc-def.trycloudflare.com\n"
    )
    monkeypatch.setattr(envfile, "ENV_PATH", path)
    for key in ("RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_LLM_ID", "PUBLIC_BASE_URL", "RETELL_VOICE_ID", "RETELL_FROM_NUMBER"):
        monkeypatch.delenv(key, raising=False)
    return path


def test_set_values_keeps_comments_and_appends_new_keys(tmp_path):
    path = tmp_path / ".env"
    path.write_text("# header\nRETELL_AGENT_ID=        # Agent id\nOTHER=1\n")
    envfile.set_values({"RETELL_AGENT_ID": "agent_1", "RETELL_LLM_ID": "llm_1"}, path)
    assert path.read_text() == "# header\nRETELL_AGENT_ID=agent_1  # Agent id\nOTHER=1\nRETELL_LLM_ID=llm_1\n"
    assert envfile.read_value("RETELL_AGENT_ID", path) == "agent_1"
    assert oct(path.stat().st_mode & 0o777) == "0o600"


def test_create_builds_functions_variables_and_analysis():
    client = FakeRetell()
    out = retell_setup.setup(client, base_url="https://abc.trycloudflare.com/")
    assert (out["llm"], out["agent"], out["voice"]) == ("created", "created", "retell-Cimo")
    llm = client.llm.created[0]
    tools = {t["name"]: t for t in llm["general_tools"]}
    assert tools["lookup_box"]["url"] == "https://abc.trycloudflare.com/api/retell/lookup"
    assert tools["record_outcome"]["url"] == "https://abc.trycloudflare.com/api/retell/record"
    assert tools["record_outcome"]["parameters"]["properties"]["outcome"]["enum"] == list(CALL_OUTCOMES)
    assert "end_call" in tools and llm["start_speaker"] == "agent"

    variables, _ = scenario.call_variables("CMAU9939083")
    assert set(llm["default_dynamic_variables"]) == set(variables)
    assert set(re.findall(r"\{\{(\w+)\}\}", llm["general_prompt"])) == set(variables)

    agent = client.agent.created[0]
    assert agent["response_engine"] == {"type": "retell-llm", "llm_id": out["llm_id"]}
    assert agent["agent_name"] == "Pier 7 gate desk"
    fields = {f["name"]: f for f in agent["post_call_analysis_data"]}
    assert fields["outcome"]["choices"] == list(CALL_OUTCOMES)
    assert (fields["callback_needed"]["type"], fields["notes"]["type"]) == ("boolean", "string")


def test_without_a_base_url_the_llm_has_no_custom_functions():
    client = FakeRetell()
    retell_setup.setup(client)
    llm = client.llm.created[0]
    assert [t["type"] for t in llm["general_tools"]] == ["end_call"]
    assert "record_outcome" not in llm["general_prompt"] and "lookup_box" not in llm["general_prompt"]


def test_known_ids_are_updated_and_the_voice_is_kept():
    client = FakeRetell(llms={"llm_a"}, agents={"agent_a"})
    out = retell_setup.setup(client, base_url="https://new.trycloudflare.com", llm_id="llm_a", agent_id="agent_a")
    assert (out["llm"], out["agent"], out["voice"]) == ("updated", "updated", "kept")
    assert not client.llm.created and not client.agent.created
    assert client.llm.updated[0][1]["general_tools"][0]["url"].startswith("https://new.trycloudflare.com/")
    assert "voice_id" not in client.agent.updated[0][1]


def test_unknown_ids_are_recreated_and_a_number_is_bound():
    client = FakeRetell()
    out = retell_setup.setup(client, llm_id="llm_gone", agent_id="agent_gone", from_number="+13105550100")
    assert (out["llm"], out["agent"]) == ("created", "created")
    number, binding = client.bound[0]
    assert number == "+13105550100"
    assert binding["inbound_agents"] == binding["outbound_agents"] == [{"agent_id": out["agent_id"], "weight": 1, "agent_version": "latest"}]


def test_run_writes_ids_to_env_and_never_prints_the_key(env_file, capsys):
    client = FakeRetell()
    assert retell_setup.run(client=client) == 0
    text = env_file.read_text()
    assert "RETELL_AGENT_ID=agent_new1  # Agent id" in text
    assert "RETELL_LLM_ID=llm_new1" in text
    assert f"RETELL_API_KEY={SECRET}" in text
    printed = capsys.readouterr().out
    assert SECRET not in printed and "agent_new1" in printed

    again = FakeRetell(llms={"llm_new1"}, agents={"agent_new1"})
    assert retell_setup.run(client=again) == 0
    assert again.llm.updated and again.agent.updated and not again.agent.created


def test_run_needs_a_key_and_an_https_url(env_file, capsys, monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://localhost:8000")
    assert retell_setup.run(client=FakeRetell()) == 1
    monkeypatch.setenv("RETELL_API_KEY", "")
    envfile.set_values({"RETELL_API_KEY": ""})
    assert retell_setup.run(client=FakeRetell()) == 1
    assert "RETELL_API_KEY" in capsys.readouterr().out
    assert os.environ.get("RETELL_API_KEY", "") == ""
