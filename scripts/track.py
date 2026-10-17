"""Create Terminal49 tracking requests.

Usage:
    .venv/bin/python scripts/track.py container MSKU1234567 MAEU
    .venv/bin/python scripts/track.py bill_of_lading MAEU123456789 MAEU
"""
from __future__ import annotations

import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config  # noqa: E402
from backend.t49 import BASE_URL, headers  # noqa: E402


def track(request_type: str, number: str, scac: str) -> dict:
    body = {
        "data": {
            "type": "tracking_request",
            "attributes": {"request_type": request_type, "request_number": number, "scac": scac},
        }
    }
    res = httpx.post(f"{BASE_URL}/tracking_requests", json=body, headers=headers(config.T49_API_KEY), timeout=15)
    res.raise_for_status()
    return res.json()


def main(argv: list[str]) -> int:
    if len(argv) != 4 or argv[1] not in ("container", "bill_of_lading"):
        print(__doc__)
        return 2
    if not config.T49_API_KEY:
        print("Set T49_API_KEY in .env first.")
        return 1
    try:
        print(track(argv[1], argv[2], argv[3]))
    except httpx.HTTPStatusError as exc:
        print(f"Terminal49 answered {exc.response.status_code}: {exc.response.text}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
