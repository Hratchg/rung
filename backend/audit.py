"""JSON lines audit writer with an in memory ring buffer."""
from __future__ import annotations

import json
import threading
from collections import deque
from pathlib import Path

from .models import Decision

RING_SIZE = 5000


class Audit:
    def __init__(self, path: Path | None, size: int = RING_SIZE):
        self.path = Path(path) if path else None
        self.buffer: deque[dict] = deque(maxlen=size)
        self.seq = 0
        self.lock = threading.Lock()

    def write(self, line: dict) -> dict:
        with self.lock:
            self.seq += 1
            line = {"seq": self.seq, **line}
            self.buffer.append(line)
            if self.path:
                with self.path.open("a") as fh:
                    fh.write(json.dumps(line) + "\n")
            return line

    def clear(self) -> None:
        with self.lock:
            self.buffer.clear()

    def lines(self, since: str | None = None, box: str | None = None) -> list[dict]:
        with self.lock:
            items = list(self.buffer)
        if since:
            if since.isdigit():
                items = [x for x in items if x["seq"] > int(since)]
            else:
                items = [x for x in items if x["ts"] > since]
        if box:
            items = [x for x in items if x["box"] == box]
        return items[::-1]


def decision_line(
    decision: Decision,
    ts: str,
    previous_step: str | None,
    actor: str = "engine",
    step: str | None = None,
    override: bool = False,
    note: str = "",
    **extra,
) -> dict:
    return {
        "ts": ts,
        "box": decision.box,
        "step": step or decision.step,
        "hand": decision.hand,
        "previous_step": previous_step,
        "fired": list(decision.fired),
        "conflicts": [c.code for c in decision.conflicts],
        "urgency": decision.urgency,
        "trust": {k: round(v, 2) for k, v in decision.trust.items()},
        "reason": decision.reason,
        "owner": decision.owner,
        "actor": actor,
        "override": override,
        "note": note,
        "twist_tag": decision.twist_tag,
        **extra,
    }
