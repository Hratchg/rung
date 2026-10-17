from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R5",
    step="RELEASE",
    pin=True,
    test=lambda c: c.has("C3") and not c.active_holds,
    why=lambda c: "Reefer in trouble with no hold. Move it to the top of the queue.",
    uses=("C3",),
)
