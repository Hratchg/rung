from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R2",
    step="ASK",
    test=lambda c: c.has("C2") and c.urgency >= 50,
    why=lambda c: f"Urgency {c.urgency} is high, so poll the terminal record again.",
    uses=("C2",),
)
