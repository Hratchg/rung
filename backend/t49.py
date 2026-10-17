"""Terminal49 poller with fixture fallback.

Polls GET /v2/containers every 60 seconds. Any error, a missing key, or a 401 falls back to
fixtures/t49_snapshot.json and every box is badged simulated. Never calls the paid refresh endpoint.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Callable

import httpx

from . import config
from .models import CUSTOMS_HOLD_NAMES

BASE_URL = "https://api.terminal49.com/v2"
POLL_SECONDS = 60
log = logging.getLogger("rung.t49")

CARRIER_FIELDS = (
    "weight_in_lbs",
    "equipment_type",
    "equipment_length",
    "current_status",
    "seal_number",
    "pod_arrived_at",
    "pod_discharged_at",
)
TERMINAL_FIELDS = (
    "available_for_pickup",
    "availability_known",
    "pickup_lfd",
    "fees_at_pod_terminal",
    "location_at_pod_terminal",
    "pickup_appointment_at",
    "terminal_checked_at",
)
STATUS_TEXT = {
    "starting": "Terminal49 poller starting.",
    "no_key": "No Terminal49 key. Running on fixture.",
    "unauthorized": "Terminal49 key has no read access. Running on the fixture.",
    "error": "Terminal49 unreachable. Running on the fixture.",
    "ok": "Terminal49 live.",
}


def headers(key: str) -> dict:
    return {"Authorization": f"Token {key}", "Content-Type": "application/vnd.api+json"}


def map_container(resource: dict, observed_at: str) -> dict | None:
    """Map one JSON:API container resource onto the carrier, terminal, and customs sources.

    Terminal49 timestamps are real world time while the scenario runs on its own clock, so the
    observation time of each source is the scenario time of the poll. The raw value is kept.
    """
    attrs = resource.get("attributes") or {}
    number = attrs.get("number")
    if not number:
        return None
    holds = attrs.get("holds_at_pod_terminal") or []
    carrier = {k: attrs.get(k) for k in CARRIER_FIELDS}
    carrier["observed_at"] = observed_at
    terminal = {k: attrs.get(k) for k in TERMINAL_FIELDS}
    terminal["terminal_checked_at_raw"] = attrs.get("terminal_checked_at")
    terminal["terminal_checked_at"] = observed_at
    terminal["holds"] = [h for h in holds if h.get("name") not in CUSTOMS_HOLD_NAMES]
    customs = {"holds": [h for h in holds if h.get("name") in CUSTOMS_HOLD_NAMES], "observed_at": observed_at}
    return {"number": number, "live": True, "carrier": carrier, "terminal": terminal, "customs": customs}


def load_fixture(path: Path = config.FIXTURE_PATH) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {"data": []}


class Poller:
    def __init__(self, apply: Callable[[dict, bool], int], key: str | None = None, fixture: Path = config.FIXTURE_PATH):
        self.apply = apply
        self.key = config.T49_API_KEY if key is None else key
        self.fixture = fixture
        self.status = "starting"
        self.last_ok: str | None = None
        self.live_count = 0
        self.last_payload: dict | None = None
        self.last_live = False
        self._warned_401 = False

    def snapshot(self) -> dict:
        return {
            "live_count": self.live_count if self.status == "ok" else 0,
            "last_ok": self.last_ok,
            "status": self.status,
            "message": STATUS_TEXT.get(self.status, self.status),
        }

    def _fallback(self, status: str) -> None:
        self.status = status
        payload = load_fixture(self.fixture)
        self.last_payload, self.last_live = payload, False
        self.apply(payload, False)
        self.live_count = 0

    async def poll_once(self, client: httpx.AsyncClient | None = None) -> None:
        if not self.key:
            self._fallback("no_key")
            return
        own = client is None
        client = client or httpx.AsyncClient(timeout=10)
        try:
            res = await client.get(f"{BASE_URL}/containers", headers=headers(self.key))
            if res.status_code == 401:
                if not self._warned_401:
                    log.warning("Terminal49 returned 401. The key has no read entitlement. Running on the fixture.")
                    self._warned_401 = True
                self._fallback("unauthorized")
                return
            res.raise_for_status()
            payload = res.json()
            self.fixture.write_text(json.dumps(payload, indent=2))
            self.last_payload, self.last_live = payload, True
            self.live_count = self.apply(payload, True)
            self.status = "ok"
            self.last_ok = datetime.now().astimezone().isoformat(timespec="seconds")
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("Terminal49 poll failed: %s", exc)
            self._fallback("error")
        finally:
            if own:
                await client.aclose()

    async def run(self) -> None:
        while True:
            await self.poll_once()
            await asyncio.sleep(POLL_SECONDS)
