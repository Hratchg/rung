from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R11",
    step="RELEASE",
    pin=True,
    test=lambda c: c.has("C5") and c.codes() == {"C5"} and not c.active_holds and c.available is True,
    why=lambda c: "Free time is running out and the box is otherwise clear. Move it up the queue.",
    uses=("C5",),
)
