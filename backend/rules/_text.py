from ..models import HOLD_LABELS


def hold_phrase(hold: dict, state: str) -> str:
    label = HOLD_LABELS.get(hold["name"], hold["name"])
    desc = hold.get("description")
    return f"{label} hold {state} ({desc})." if desc else f"{label} hold {state}."
