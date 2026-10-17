from ..models import CUSTOMS_HOLD_NAMES, HOLD_LABELS, Rule

created_at = "2026-10-17T07:50:00+00:00"

NAMES = CUSTOMS_HOLD_NAMES + ("line",)


def _why(c) -> str:
    label = HOLD_LABELS[c.holds_named(NAMES)[0]["name"]].lower()
    return f"Reefer in trouble under a {label} hold. Release is not ours to give."


RULE = Rule(
    id="R6",
    step="HOLD",
    hand=True,
    test=lambda c: c.has("C3") and bool(c.holds_named(NAMES)),
    why=_why,
    uses=("C3",),
    owner=lambda c: c.holds_named(NAMES)[0]["owner"],
)
