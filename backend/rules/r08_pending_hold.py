from ..models import Rule
from ._text import hold_phrase

created_at = "2026-10-17T07:50:00+00:00"


def _why(c) -> str:
    hold = c.pending_holds[0]
    return f"{hold_phrase(hold, 'pending')} Send a heads up note to the {hold['owner']} now."


RULE = Rule(
    id="R8",
    step="WATCH",
    test=lambda c: bool(c.pending_holds),
    why=_why,
    owner=lambda c: c.pending_holds[0]["owner"],
)
