"""Ask calls to the trucker through Retell, with a scripted mock when no Retell key is set.

Live: create_web_call by default, create_phone_call only when RETELL_FROM_NUMBER is set and
RETELL_PHONE_ENABLED is true. Mock: the same call shape, a scripted transcript that unfolds in
real seconds, and a call_analysis block, so the poller and the Box card run the same path.
"""
from __future__ import annotations

import itertools
import secrets
import threading
import time
import zlib
from dataclasses import dataclass
from typing import Any, Callable

from . import config
from .models import CALL_OUTCOMES

POLL_SECONDS = 3.0
MOCK_LINE_SECONDS = 1.5
# A live call that never yields an analysis is closed as unknown after this long.
LIVE_GIVE_UP_SECONDS = 15 * 60

TRUCKERS = ("Dana Ruiz", "Sam Okafor", "Lee Nguyen", "Alex Moreno", "Chris Patel", "Jordan Kim", "Robin Silva", "Ty Brooks")

OUTCOME_LABELS = {
    "confirmed_empty": "Trucker backs the manifest",
    "confirmed_loaded": "Trucker backs the scale",
    "reschedule_accepted": "Trucker takes a later slot",
    "unknown": "Trucker does not know",
}


@dataclass(frozen=True)
class VoiceSettings:
    api_key: str = ""
    public_key: str = ""
    agent_id: str = ""
    from_number: str = ""
    phone_enabled: bool = False
    public_base_url: str = ""

    @classmethod
    def from_env(cls) -> "VoiceSettings":
        return cls(
            api_key=config.env("RETELL_API_KEY"),
            public_key=config.env("RETELL_PUBLIC_KEY"),
            agent_id=config.env("RETELL_AGENT_ID"),
            from_number=config.env("RETELL_FROM_NUMBER"),
            phone_enabled=config.env("RETELL_PHONE_ENABLED", "false").lower() == "true",
            public_base_url=config.env("PUBLIC_BASE_URL"),
        )

    @property
    def mode(self) -> str:
        if not (self.api_key and self.agent_id):
            return "mock"
        if self.phone_enabled and self.from_number:
            return "phone"
        return "web"

    def missing(self) -> list[str]:
        """Keys still empty for the live web call path and the custom functions."""
        wanted = {
            "RETELL_API_KEY": self.api_key,
            "RETELL_AGENT_ID": self.agent_id,
            "RETELL_PUBLIC_KEY": self.public_key,
            "PUBLIC_BASE_URL": self.public_base_url,
        }
        return [k for k, v in wanted.items() if not v]


def trucker_name(number: str) -> str:
    return TRUCKERS[zlib.crc32(number.encode()) % len(TRUCKERS)]


def spell_box(number: str) -> str:
    """How the agent says a box number: owner code, then the digits in groups."""
    return f"{number[:4]} {number[4:7]} {number[7:10]} {number[10:]}".strip()


def default_outcome(weight_case: str | None) -> str:
    """The scripted trucker answer when the planner does not pick one."""
    return "confirmed_loaded" if weight_case in ("heavy", "declared_empty") else "unknown"


def script(outcome: str, v: dict[str, str]) -> tuple[list[dict], dict]:
    box = spell_box(v["container_number"])
    manifest = f"{int(v['manifest_weight_lbs']):,}" if v["manifest_weight_lbs"].isdigit() else "unknown"
    measured = f"{int(v['measured_weight_lbs']):,}" if v["measured_weight_lbs"].isdigit() else "unknown"
    lines = [
        ("agent", f"Hello, this is the Pier 7 gate desk calling about container {box} on your {v['appointment_time']} appointment."),
        ("user", f"Yes, this is {v['trucker_name']} with {v['dray_carrier']}."),
        ("agent", f"The manifest says {manifest} pounds but our scale read {measured} pounds. Is the box loaded as weighed?"),
    ]
    tail = {
        "confirmed_loaded": [
            ("user", "Yes, it is loaded. The shipper added pallets after the manifest went in."),
            ("agent", "Thank you. I will record that the load matches the scale. A planner will confirm your gate time."),
            ("user", "Okay, thanks."),
        ],
        "confirmed_empty": [
            ("user", "No, that box is empty. I picked it up empty this afternoon."),
            ("agent", "Thank you. I will record that the box matches the manifest. A planner will confirm your gate time."),
            ("user", "Sounds good."),
        ],
        "reschedule_accepted": [
            ("user", "I am not sure. Can I come later once you reweigh it?"),
            ("agent", "Yes. I will move you to a later slot while the weight is checked."),
            ("user", "That works for me."),
        ],
        "unknown": [
            ("user", "I do not know. My dispatcher has the paperwork."),
            ("agent", "Understood. I will note that the weight is still open. A planner may call you back."),
            ("user", "Okay."),
        ],
    }[outcome]
    notes = {
        "confirmed_loaded": "Shipper added pallets after the manifest. Load matches the scale.",
        "confirmed_empty": "Trucker says the box is empty as declared.",
        "reschedule_accepted": "Trucker accepted a later slot pending a reweigh.",
        "unknown": "Trucker could not confirm the weight. Dispatcher has the paperwork.",
    }[outcome]
    analysis = {"outcome": outcome, "callback_needed": outcome == "unknown", "notes": notes}
    return [{"role": r, "content": c} for r, c in lines + tail], analysis


class MockCalls:
    """Stands in for client.call when there is no key. Lines appear every MOCK_LINE_SECONDS of wall time."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self.clock = clock
        self.calls: dict[str, dict] = {}
        self.counter = itertools.count(1)
        self.lock = threading.Lock()

    def create(self, variables: dict[str, str], metadata: dict, outcome: str) -> dict:
        with self.lock:
            call_id = f"mock_call_{next(self.counter):04d}"
            lines, analysis = script(outcome, variables)
            self.calls[call_id] = {"started": self.clock(), "lines": lines, "analysis": analysis, "metadata": metadata}
            return {"call_id": call_id, "access_token": f"mock_{secrets.token_hex(8)}"}

    def retrieve(self, call_id: str) -> dict:
        call = self.calls[call_id]
        shown = int((self.clock() - call["started"]) // MOCK_LINE_SECONDS) + 1
        ended = shown > len(call["lines"])
        return {
            "call_id": call_id,
            "call_status": "ended" if ended else "ongoing",
            "transcript_object": call["lines"][: max(0, shown)],
            "call_analysis": {"custom_analysis_data": call["analysis"]} if ended else None,
            "metadata": call["metadata"],
        }


def _as_dict(obj: Any) -> dict:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    dump = getattr(obj, "model_dump", None)
    return dump() if dump else dict(obj)


def normalize(raw: dict) -> dict:
    """One shape for live and mock: status, transcript lines, and the analysis once it exists."""
    status = raw.get("call_status") or "registered"
    transcript = [
        {"role": "agent" if u.get("role") == "agent" else "trucker", "content": u.get("content", "")}
        for u in raw.get("transcript_object") or []
    ]
    data = _as_dict(_as_dict(raw.get("call_analysis")).get("custom_analysis_data"))
    analysis = None
    if data:
        outcome = data.get("outcome")
        analysis = {
            "outcome": outcome if outcome in CALL_OUTCOMES else "unknown",
            "callback_needed": bool(data.get("callback_needed")),
            "notes": str(data.get("notes") or ""),
        }
    elif status in ("error", "not_connected"):
        analysis = {"outcome": "unknown", "callback_needed": True, "notes": f"Call {status.replace('_', ' ')}."}
    return {"status": status, "transcript": transcript, "analysis": analysis}


class Voice:
    def __init__(self, settings: VoiceSettings | None = None, client: Any = None, mock: MockCalls | None = None):
        self.settings = settings or VoiceSettings.from_env()
        self.mock = mock or MockCalls()
        self._client = client

    @property
    def mode(self) -> str:
        return self.settings.mode

    @property
    def client(self):
        if self._client is None:
            from retell import Retell

            self._client = Retell(api_key=self.settings.api_key)
        return self._client

    def status(self) -> dict:
        return {"mode": self.mode, "missing": self.settings.missing(), "phone_enabled": self.settings.phone_enabled}

    def start(
        self, variables: dict[str, str], metadata: dict, to_number: str | None, mock_outcome: str, simulate: bool = False
    ) -> dict:
        """simulate plays the scripted call even with Retell keys loaded, so a recorded demo is the same every time."""
        mode = self.mode
        if mode == "mock" or simulate:
            made = self.mock.create(variables, metadata, mock_outcome)
            note = "Simulated, no Retell key." if mode == "mock" else "Simulated on request, Retell not called."
            return {**made, "mode": "web", "mock": True, "note": note}
        if mode == "phone":
            if not to_number:
                raise ValueError("The appointment has no trucker phone number.")
            resp = self.client.call.create_phone_call(
                from_number=self.settings.from_number,
                to_number=to_number,
                override_agent_id=self.settings.agent_id,
                retell_llm_dynamic_variables=variables,
                metadata=metadata,
            )
            return {"call_id": resp.call_id, "access_token": None, "mode": "phone", "mock": False}
        resp = self.client.call.create_web_call(
            agent_id=self.settings.agent_id,
            retell_llm_dynamic_variables=variables,
            metadata=metadata,
        )
        # The browser needs the transport and ICE servers to join a gateway call. They carry
        # short lived TURN credentials, so they go to the browser only and are never stored.
        return {
            "call_id": resp.call_id,
            "access_token": resp.access_token,
            "transport": getattr(resp, "transport", None),
            "ice_servers": [_as_dict(s) for s in getattr(resp, "ice_servers", None) or []],
            "mode": "web",
            "mock": False,
        }

    def retrieve(self, call_id: str, mock: bool) -> dict:
        if mock:
            return normalize(self.mock.retrieve(call_id))
        return normalize(_as_dict(self.client.call.retrieve(call_id)))

    def verify(self, body: str, signature: str | None) -> bool:
        """Retell signs custom function calls with the API key. With no key there is nothing to check."""
        if not self.settings.api_key:
            return True
        if not signature:
            return False
        try:
            return bool(self.client.verify(body, self.settings.api_key, signature))
        except Exception:
            return False
