from ..models import Rule
from ._text import hold_phrase

created_at = "2026-10-17T07:50:00+00:00"

RULE = Rule(
    id="R7",
    step="HOLD",
    test=lambda c: bool(c.active_holds),
    why=lambda c: " ".join(hold_phrase(h, "active") for h in c.active_holds),
    owner=lambda c: c.active_holds[0]["owner"],
)
