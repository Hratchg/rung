from ..models import Rule
from ..timefmt import parse_dt, say_time

created_at = "2026-10-17T18:05:00+00:00"


def _why(c) -> str:
    deadline = parse_dt(c.box.rated)
    if c.now >= deadline:
        return f"Rated order. Its gate out deadline at {say_time(deadline)} has passed."
    return f"Rated order with a gate out deadline at {say_time(deadline)}."


# Same "otherwise clear" test as R11, so a rated box still goes through the ladder.
RULE = Rule(
    id="R13",
    step="RELEASE",
    pin=True,
    test=lambda c: c.box.rated is not None and c.codes() <= {"C5"} and not c.active_holds and c.available is True,
    why=_why,
)
