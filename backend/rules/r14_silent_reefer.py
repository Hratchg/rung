from ..models import REEFER_CREW, Rule
from ..timefmt import say_num, say_time

created_at = "2026-10-17T18:05:00+00:00"


def _why(c) -> str:
    s = c.silence
    at = say_time(s["since"])
    if s["kind"] == "tripped":
        return (
            f"Reefer silent since {at} with {len(s['peers'])} other units on circuit {s['circuit']} within 10 minutes. "
            f"Likely a tripped breaker. Ask the reefer crew to check circuit {s['circuit']} and read every unit on it."
        )
    if s["kind"] == "failed":
        if s["alarm"]:
            first = f"Reefer sent the alarm {s['alarm']} and went silent at {at}."
        else:
            first = f"Reefer drew {say_num(s['draw_kw'])} kW, outside the normal band, and went silent at {at}."
        return f"{first} Likely a failed unit. Ask a reefer technician to inspect it now."
    draw = f"a normal {say_num(s['draw_kw'])} kW" if s["draw_kw"] is not None else "normal power"
    return (
        f"Reefer silent since {at}. It drew {draw} before it went quiet. "
        "Likely a telemetry fault. The unit is probably still cooling. Ask the reefer crew for a manual temperature read."
    )


RULE = Rule(
    id="R14",
    step="ASK",
    test=lambda c: c.silence is not None,
    why=_why,
    owner=lambda c: REEFER_CREW,
)
