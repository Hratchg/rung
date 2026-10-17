from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R9",
    step="SLOW",
    test=lambda c: c.lane_closed,
    why=lambda c: f"Lane {c.box.appointment['lane']} is closed. The optimizer assigns a new slot.",
)
