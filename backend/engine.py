from __future__ import annotations

from datetime import datetime

from .models import SOURCES, Box, Decision


def evaluate(box: Box, now: datetime) -> Decision:
    """Phase 0 stub. Every box watches until the engine lands in Phase 1."""
    return Decision(
        box=box.number,
        step="WATCH",
        hand=False,
        urgency=0,
        fired=[],
        conflicts=[],
        trust={s: 0.0 for s in SOURCES},
        reason="Engine not built yet. Watch and recheck at the next poll.",
        owner=None,
    )
