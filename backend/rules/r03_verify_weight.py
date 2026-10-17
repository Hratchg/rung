from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R3",
    step="ASK",
    test=lambda c: c.has("C1"),
    why=lambda c: "Weight does not match the manifest. Call the trucker and request a reweigh.",
    uses=("C1",),
)
