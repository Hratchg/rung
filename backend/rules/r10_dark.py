from ..models import Rule

created_at = "2026-10-17T07:50:00+00:00"


def _why(c) -> str:
    names = " and ".join(c.dark_dependencies)
    if c.box.pending_release:
        return f"The {names} feed went dark while this box was pending release."
    return f"The {names} feed is dark and this box depends on it."


RULE = Rule(
    id="R10",
    step=lambda c: "HAND" if c.box.pending_release else "WATCH",
    test=lambda c: bool(c.dark_dependencies),
    why=_why,
    uses=("C4",),
)
