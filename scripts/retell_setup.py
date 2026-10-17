"""Create or update the Retell LLM and the "Pier 7 gate desk" agent, then write their ids to .env.

Usage:
    .venv/bin/python scripts/retell_setup.py              create, or update the ids already in .env
    .venv/bin/python scripts/retell_setup.py --recreate   create a new LLM and agent even if ids are set

Needs only RETELL_API_KEY in .env. With PUBLIC_BASE_URL set (make tunnel writes it), the LLM gets
the custom functions lookup_box and record_outcome. Without it the agent still takes web calls and
the outcome comes from the post call analysis. With RETELL_FROM_NUMBER set, that number is bound to
the agent for inbound and outbound calls. RETELL_VOICE_ID picks the voice. Prints ids, never a key.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.models import CALL_OUTCOMES  # noqa: E402
from scripts import envfile  # noqa: E402

AGENT_NAME = "Pier 7 gate desk"
VARIABLES = (
    "container_number",
    "manifest_weight_lbs",
    "measured_weight_lbs",
    "appointment_time",
    "trucker_name",
    "dray_carrier",
)
# Inbound calls carry no variables, so the prompt sees "none" and runs the inbound script.
DEFAULT_VARIABLES = {name: "none" for name in VARIABLES}
PREFERRED_VOICES = ("retell-Cimo", "11labs-Adrian", "openai-Alloy")
MAX_CALL_MS = 10 * 60 * 1000

IDENTITY = """## Identity
You are the Pier 7 gate desk at a container terminal in San Pedro Bay. You talk with truck drivers.
Be brief, polite, and plain. Ask one question at a time. Never promise a release. A planner confirms
every gate time.

## Saying a container number
Say the four letter owner code one letter at a time, then the seven digits in groups of three, three,
and one. MSKU1234567 is "M S K U, one two three, four five six, seven".

## Which call this is
The container for this call is {{container_number}}. If it is none, the caller phoned in, so follow
the inbound call steps. Otherwise you are calling the trucker, so follow the weight check steps.

## Weight check call
Trucker: {{trucker_name}} with {{dray_carrier}}. Appointment window: {{appointment_time}}.
Manifest weight: {{manifest_weight_lbs}} pounds. Scale reading: {{measured_weight_lbs}} pounds.
1. Say you are the Pier 7 gate desk calling about container {{container_number}} on the
   {{appointment_time}} appointment, and check that you are speaking with {{trucker_name}}.
2. Say the manifest says {{manifest_weight_lbs}} pounds and the scale read {{measured_weight_lbs}}
   pounds. Ask whether the box is loaded as weighed.
3. Pick the outcome:
   - confirmed_loaded: the trucker says the scale is right and the box carries the measured load.
   - confirmed_empty: the trucker says the manifest is right and the box is as declared.
   - reschedule_accepted: the trucker agrees to come back later while the box is reweighed.
   - unknown: the trucker does not know, or the answer is still unclear after one follow up question.
"""

WEIGHT_WITH_RECORD = """4. Call record_outcome with container_number {{container_number}}, the outcome, callback_needed
   true when a planner should call the trucker back, and one sentence of notes.
5. Read back what was recorded, thank the trucker, and call end_call.
"""

WEIGHT_WITHOUT_RECORD = """4. Tell the trucker a planner will review the answer, thank them, and call end_call.
"""

INBOUND_WITH_LOOKUP = """
## Inbound call
1. Greet the caller as the Pier 7 gate desk and ask for the container number.
2. Read the number back. When the caller confirms, call lookup_box with the number in capitals and
   no spaces.
3. Read the result as given. Offer to check another box. When the caller is done, say goodbye and
   call end_call.
"""

INBOUND_WITHOUT_LOOKUP = """
## Inbound call
Greet the caller as the Pier 7 gate desk, say box lookups are not available on this line right now,
ask them to call back later, say goodbye, and call end_call.
"""

ANALYSIS = [
    {
        "type": "enum",
        "name": "outcome",
        "description": (
            "What the trucker said about the weight. confirmed_loaded: the scale is right. "
            "confirmed_empty: the manifest is right. reschedule_accepted: the trucker takes a later "
            "slot for a reweigh. unknown: no clear answer, or an inbound call with no weight question."
        ),
        "choices": list(CALL_OUTCOMES),
        "required": True,
    },
    {
        "type": "boolean",
        "name": "callback_needed",
        "description": "True when a planner should call the trucker back.",
        "required": True,
    },
    {
        "type": "string",
        "name": "notes",
        "description": "One or two sentences on what the trucker said about the box and its weight.",
        "examples": ["Shipper added pallets after the manifest. Load matches the scale."],
        "required": True,
    },
]


def prompt(with_functions: bool) -> str:
    weight = WEIGHT_WITH_RECORD if with_functions else WEIGHT_WITHOUT_RECORD
    inbound = INBOUND_WITH_LOOKUP if with_functions else INBOUND_WITHOUT_LOOKUP
    return IDENTITY + weight + inbound


def tools(base_url: str) -> list[dict]:
    end_call = {"type": "end_call", "name": "end_call", "description": "Hang up after saying goodbye."}
    if not base_url:
        return [end_call]
    base = base_url.rstrip("/")
    container = {
        "type": "string",
        "description": "Container number, four letters then seven digits with no spaces, for example MSKU1234567.",
    }
    return [
        {
            "type": "custom",
            "name": "lookup_box",
            "description": "Look up whether a container is ready to leave the gate tonight and what its appointment is.",
            "url": f"{base}/api/retell/lookup",
            "method": "POST",
            "parameters": {"type": "object", "properties": {"container_number": container}, "required": ["container_number"]},
            "speak_during_execution": True,
            "execution_message_description": "Tell the caller you are checking the box.",
            "speak_after_execution": True,
            "timeout_ms": 10000,
        },
        {
            "type": "custom",
            "name": "record_outcome",
            "description": "Record what the trucker said about the weight of the container on this call.",
            "url": f"{base}/api/retell/record",
            "method": "POST",
            "parameters": {
                "type": "object",
                "properties": {
                    "container_number": container,
                    "outcome": {"type": "string", "enum": list(CALL_OUTCOMES), "description": "The outcome picked in step 3."},
                    "callback_needed": {"type": "boolean", "description": "True when a planner should call the trucker back."},
                    "notes": {"type": "string", "description": "One sentence on what the trucker said."},
                },
                "required": ["container_number", "outcome", "callback_needed", "notes"],
            },
            "speak_during_execution": False,
            "speak_after_execution": True,
            "timeout_ms": 10000,
        },
        end_call,
    ]


def llm_args(base_url: str) -> dict:
    return {
        "general_prompt": prompt(bool(base_url)),
        "general_tools": tools(base_url),
        "default_dynamic_variables": DEFAULT_VARIABLES,
        "start_speaker": "agent",
        "model_temperature": 0.2,
    }


def agent_args(llm_id: str) -> dict:
    return {
        "agent_name": AGENT_NAME,
        "response_engine": {"type": "retell-llm", "llm_id": llm_id},
        "language": "en-US",
        "post_call_analysis_data": ANALYSIS,
        "max_call_duration_ms": MAX_CALL_MS,
    }


def pick_voice(client: Any, wanted: str) -> str:
    if wanted:
        return wanted
    voices = list(client.voice.list())
    ids = {v.voice_id for v in voices}
    for voice_id in PREFERRED_VOICES:
        if voice_id in ids:
            return voice_id
    american = [v for v in voices if (v.accent or "").lower() == "american"]
    if not (american or voices):
        raise RuntimeError("Retell listed no voices. Set RETELL_VOICE_ID in .env.")
    return (american or voices)[0].voice_id


def exists(retrieve: Any, resource_id: str) -> bool:
    from retell import NotFoundError

    if not resource_id:
        return False
    try:
        retrieve(resource_id)
    except NotFoundError:
        return False
    return True


def setup(
    client: Any,
    *,
    base_url: str = "",
    llm_id: str = "",
    agent_id: str = "",
    voice_id: str = "",
    from_number: str = "",
    recreate: bool = False,
) -> dict:
    """Create or update the LLM and the agent. Returns the ids and what happened to each."""
    result: dict[str, Any] = {"functions": bool(base_url)}
    if not recreate and exists(client.llm.retrieve, llm_id):
        client.llm.update(llm_id, **llm_args(base_url))
        result["llm"] = "updated"
    else:
        llm_id = client.llm.create(**llm_args(base_url)).llm_id
        result["llm"] = "created"
    args = agent_args(llm_id)
    if not recreate and exists(client.agent.retrieve, agent_id):
        if voice_id:
            args["voice_id"] = voice_id
        client.agent.update(agent_id, **args)
        result["agent"] = "updated"
        result["voice"] = voice_id or "kept"
    else:
        args["voice_id"] = pick_voice(client, voice_id)
        agent_id = client.agent.create(**args).agent_id
        result["agent"] = "created"
        result["voice"] = args["voice_id"]
    if from_number:
        binding = [{"agent_id": agent_id, "weight": 1, "agent_version": "latest"}]
        client.phone_number.update(from_number, inbound_agents=binding, outbound_agents=binding)
        result["number"] = from_number
    result["llm_id"], result["agent_id"] = llm_id, agent_id
    return result


def value(key: str) -> str:
    """A real environment variable wins over .env, the same order the app uses."""
    return os.environ.get(key, "").strip() or envfile.read_value(key)


def run(base_url: str | None = None, recreate: bool = False, client: Any = None) -> int:
    key = value("RETELL_API_KEY")
    if not key:
        print("Set RETELL_API_KEY in .env first. It is the secret key under API Keys in the Retell dashboard.")
        return 1
    base_url = value("PUBLIC_BASE_URL") if base_url is None else base_url
    if base_url and not base_url.startswith("https://"):
        print(f"PUBLIC_BASE_URL must be an https URL that Retell can reach, not {base_url}. Run make tunnel.")
        return 1
    from retell import APIConnectionError, APIStatusError, AuthenticationError, Retell

    client = client or Retell(api_key=key)
    try:
        result = setup(
            client,
            base_url=base_url,
            llm_id="" if recreate else value("RETELL_LLM_ID"),
            agent_id="" if recreate else value("RETELL_AGENT_ID"),
            voice_id=value("RETELL_VOICE_ID"),
            from_number=value("RETELL_FROM_NUMBER"),
            recreate=recreate,
        )
    except AuthenticationError:
        print("Retell rejected RETELL_API_KEY. Copy the secret key again from API Keys in the Retell dashboard.")
        return 1
    except APIStatusError as exc:
        print(f"Retell answered {exc.status_code}: {str(exc.message).replace(key, '[key]')}")
        return 1
    except APIConnectionError:
        print("Could not reach api.retellai.com.")
        return 1
    envfile.set_values({"RETELL_LLM_ID": result["llm_id"], "RETELL_AGENT_ID": result["agent_id"]})
    tools_line = f"custom functions at {base_url.rstrip('/')}/api/retell" if result["functions"] else "no custom functions, PUBLIC_BASE_URL is empty"
    print(f"Retell LLM {result['llm_id']} {result['llm']}, {tools_line}.")
    print(f'Agent "{AGENT_NAME}" {result["agent_id"]} {result["agent"]}, voice {result["voice"]}.')
    if result.get("number"):
        print(f"Phone number {result['number']} now uses this agent for inbound and outbound calls.")
    print("Wrote RETELL_LLM_ID and RETELL_AGENT_ID to .env. Restart the app so the Ask call goes live.")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--recreate", action="store_true", help="create a new LLM and agent even if ids are in .env")
    return run(recreate=parser.parse_args(argv[1:]).recreate)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
