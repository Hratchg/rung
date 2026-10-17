from ..models import WEIGHT_OWNER, Rule

created_at = "2026-10-17T16:46:52+00:00"

# confirmed_empty clears C1 in the engine, so it never reaches this rule.
STEPS = {"confirmed_loaded": "HAND", "unknown": "HOLD", "reschedule_accepted": "SLOW"}

WHY = {
    "confirmed_loaded": "Trucker confirmed the box is loaded as the scale weighed it. The manifest weight is wrong.",
    "unknown": "The trucker call did not settle the weight.",
    "reschedule_accepted": "Trucker accepted a later slot while the weight is checked.",
}

RULE = Rule(
    id="R12",
    step=lambda c: STEPS[c.box.call_outcome],
    test=lambda c: c.has("C1") and c.box.call_outcome in STEPS,
    why=lambda c: WHY[c.box.call_outcome],
    uses=("C1",),
    owner=lambda c: WEIGHT_OWNER,
)
