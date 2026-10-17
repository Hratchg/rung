from ..models import WEIGHT_OWNER, Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R4",
    step="HOLD",
    hand=True,
    test=lambda c: c.has("C1") and c.box.weight_asked and c.urgency >= 50,
    why=lambda c: f"Weight still unresolved after the ask. Urgency {c.urgency}.",
    uses=("C1",),
    owner=lambda c: WEIGHT_OWNER,
)
