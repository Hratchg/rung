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

    def lines(self, since: str | None = None, box: str | None = None, limit: int = 0) -> list[dict]:
        with self.lock:
            items = list(self.buffer)
        if since:
            if since.isdigit():
                items = [x for x in items if x["seq"] > int(since)]
            else:
                items = [x for x in items if x["ts"] > since]
        if box:
            items = [x for x in items if box in x["box"]]
        items.reverse()
        return items[:limit] if limit > 0 else items


def load_twist_file(path: Path | None) -> list[dict]:
    """twists.json holds one entry per merged TWIST: tag, text, received_at, merged_at, added (file paths)."""
    if not path:
        return []
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return []
    return data if isinstance(data, list) else []


def twist_log(scenario_twists: list[dict], rules: list, path: Path | None) -> list[dict]:
    """One row per twist tag, newest first, joining scenario twist events, twists.json, and tagged rule files."""
    rows: dict[str, dict] = {}

    def row(tag: str) -> dict:
        return rows.setdefault(
            tag,
            {"tag": tag, "text": "", "received_at": None, "received_wall": None, "merged_at": None, "added": []},
        )

    for t in scenario_twists:
        r = row(t.get("tag") or "untagged")
        r["text"] = r["text"] or t.get("note", "")
        r["received_at"] = r["received_at"] or t.get("received_at")
        r["received_wall"] = r["received_wall"] or t.get("received_wall")
    for entry in load_twist_file(path):
        r = row(entry.get("tag") or "untagged")
        r["text"] = entry.get("text") or r["text"]
        r["received_wall"] = entry.get("received_at") or r["received_wall"]
        r["merged_at"] = entry.get("merged_at") or r["merged_at"]
        for item in entry.get("added") or []:
            r["added"].append({"kind": "file", "id": None, "name": "", "file": item, "created_at": entry.get("merged_at")})
    for rule in rules:
        if not rule.twist_tag:
            continue
        r = row(rule.twist_tag)
        r["added"] = [a for a in r["added"] if a["file"] != rule.file]
        r["added"].append(
            {"kind": "rule", "id": rule.id, "name": rule.name, "file": rule.file, "created_at": rule.created_at}
        )
        r["merged_at"] = r["merged_at"] or rule.created_at
    for r in rows.values():
        r["status"] = "merged" if r["added"] else "received"
    return sorted(rows.values(), key=lambda r: r["received_at"] or r["received_wall"] or r["merged_at"] or "", reverse=True)


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
