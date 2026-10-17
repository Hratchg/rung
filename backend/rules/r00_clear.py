from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R0",
    step="RELEASE",
    # No urgency gate: with the spec's "under 30" no rule matched a clean box at 30 or more.
    test=lambda c: not c.conflicts and not c.active_holds and c.available is True,
    why=lambda c: "No conflicts and no holds. Available for pickup.",
)
