"""Decision engine. evaluate(box, now) is pure: no clock reads, no randomness, no I/O."""
from __future__ import annotations

from datetime import datetime, timedelta

from .feeds import DRAW_BAND_KW, cargo_kind
from .models import (
    CALL_CONFIRMS,
    CALL_TRUST_BONUS,
    CUSTOMS_HOLD_NAMES,
    HOLD_OWNERS,
    HOLD_PRIORITY,
    RATED_BONUS,
    SOURCE_SPECS,
    SOURCES,
    STRENGTH,
    Box,
    Conflict,
    Ctx,
    Decision,
    Reading,
    Rule,
    Trust,
)
from .rules import load_rules
from .timefmt import hours_between, lfd_deadline, parse_date, parse_dt, say_age, say_date, say_lb, say_num

RULES: list[Rule] = load_rules()

STEP_SENTENCE = {
    "RELEASE": "Release at its slot.",
    "WATCH": "Watch and recheck at the next poll.",
    "ASK": "Ask for fresher information before acting.",
    "SLOW": "Keep it moving in a later slot or another lane.",
    "HOLD": "Gate release withheld.",
    "HAND": "A planner must decide now.",
}
FALLBACK_SENTENCE = "No rule matched this box."

# A reefer is silent once contact is lost, or once its newest reading is older than the C3 threshold.
SILENT_AFTER_H = 2.0
TRIP_WINDOW = timedelta(minutes=10)
# "Several units" on one circuit: this unit plus at least two others.
TRIP_MIN_UNITS = 3


def silent_since(reading: dict | None, now: datetime) -> datetime | None:
    if not reading:
        return None
    lost = parse_dt(reading.get("comms_lost_at"))
    if lost and lost <= now:
        return lost
    seen = parse_dt(reading.get("last_seen"))
    if seen and hours_between(now, seen) > SILENT_AFTER_H:
        return seen
    return None


def classify_silence(box: Box, now: datetime) -> dict | None:
    """Why a reefer went quiet, from its last heard reading and its circuit peers.

    tripped: several units on the same circuit silent within 10 minutes.
    failed: the last reading carried an alarm, or a draw outside the normal band.
    telemetry: a single unit silent with normal draw before.
    It reads the last heard reading even when the reefer source is dark, because that reading is the evidence.
    """
    reading = box.reefer
    since = silent_since(reading, now)
    if since is None:
        return None
    peers = sorted(
        p["number"]
        for p in box.circuit_peers
        if (other := silent_since(p, now)) is not None and abs(other - since) <= TRIP_WINDOW
    )
    circuit = reading.get("circuit")
    draw = reading.get("draw_kw")
    alarm = reading.get("alarm")
    abnormal = draw is not None and not (DRAW_BAND_KW[0] <= float(draw) <= DRAW_BAND_KW[1])
    if circuit and len(peers) + 1 >= TRIP_MIN_UNITS:
        kind = "tripped"
    elif alarm or abnormal:
        kind = "failed"
    else:
        kind = "telemetry"
    return {"kind": kind, "since": since, "circuit": circuit, "peers": peers, "draw_kw": draw, "alarm": alarm}


def _source_status(box: Box, now: datetime):
    readings: dict[str, dict] = {}
    ages: dict[str, float | None] = {}
    observed: dict[str, datetime | None] = {}
    dark: list[str] = []
    present: list[str] = []
    for name in SOURCES:
        data = box.source(name)
        if data is None:
            ages[name] = None
            observed[name] = None
            continue
        present.append(name)
        spec = SOURCE_SPECS[name]
        seen = parse_dt(data.get(spec.observed_field))
        observed[name] = seen
        age = max(0.0, hours_between(now, seen)) if seen else None
        ages[name] = age
        if name in box.dark_sources or age is None or age > spec.dark_after_h:
            dark.append(name)
        else:
            readings[name] = data
    return readings, ages, observed, dark, present


def _holds(readings: dict[str, dict]) -> tuple[list[dict], list[dict]]:
    found = []
    for source in ("customs", "terminal"):
        for hold in (readings.get(source) or {}).get("holds") or []:
            name = hold.get("name", "other")
            found.append({**hold, "name": name, "source": source, "owner": HOLD_OWNERS.get(name, "terminal")})
    found.sort(key=lambda h: HOLD_PRIORITY.index(h["name"]) if h["name"] in HOLD_PRIORITY else len(HOLD_PRIORITY))
    active = [h for h in found if h.get("status") == "hold"]
    pending = [h for h in found if h.get("status") == "pending"]
    return active, pending


def _conflicts(box, now, readings, ages, dark, active, pending, available, lfd, lfd_hours) -> list[Conflict]:
    out: list[Conflict] = []
    carrier, weigh = readings.get("carrier"), readings.get("weighbridge")
    backed_manifest = box.call_outcome == "confirmed_empty"
    if (
        not backed_manifest
        and carrier
        and weigh
        and carrier.get("weight_in_lbs") is not None
        and weigh.get("measured_weight_lbs") is not None
    ):
        a = float(carrier["weight_in_lbs"])
        b = float(weigh["measured_weight_lbs"])
        gap = abs(b - a)
        declared_empty = carrier.get("current_status") == "empty" and b > 8000
        if gap > max(3000.0, 0.12 * a) or declared_empty:
            ratio = gap / a * 100 if a else 100.0
            pct = f"{ratio:.1f}" if ratio < 100 else f"{ratio:.0f}"
            out.append(
                Conflict(
                    "C1",
                    ["carrier", "weighbridge"],
                    {"carrier": a, "weighbridge": b},
                    f"Manifest {say_lb(a)} lb, weighbridge {say_lb(b)} lb, gap {pct} percent.",
                )
            )

    if available is not None:
        mismatch_hold = available and active
        mismatch_clear = (not available) and not active and not pending
        if mismatch_hold or mismatch_clear:
            sources = ["terminal"]
            if mismatch_clear or any(h["source"] == "customs" for h in active):
                sources.append("customs")
            out.append(
                Conflict(
                    "C2",
                    sources,
                    {"available_for_pickup": available, "active_holds": [h["name"] for h in active]},
                    f"Availability and holds disagree. Terminal data {say_age(ages['terminal'])} old.",
                )
            )

    reefer = readings.get("reefer")
    if reefer:
        sp = float(reefer["set_point_c"])
        t = float(reefer["product_temp_c"])
        states = []
        if reefer.get("power_on") is False:
            states.append("power off")
        if t - sp > 2:
            states.append("warming")
        if (ages["reefer"] or 0) > 2:
            states.append(f"silent for {say_age(ages['reefer'])}")
        if states:
            out.append(
                Conflict(
                    "C3",
                    ["reefer"],
                    {"power_on": reefer.get("power_on"), "product_temp_c": t, "set_point_c": sp},
                    f"Reefer {' and '.join(states)}: product {say_num(t)} C against set point {say_num(sp)} C.",
                )
            )

    for name in dark:
        out.append(
            Conflict(
                "C4",
                [name],
                {"age_h": round(ages[name], 2) if ages[name] is not None else None},
                f"{name.capitalize()} has not reported for {say_age(ages[name])}.",
            )
        )

    terminal = readings.get("terminal")
    if terminal and lfd is not None:
        demurrage = _demurrage(terminal)
        if (lfd_hours is not None and lfd_hours <= 24 and available is not True) or demurrage > 0:
            tail = f"Demurrage {say_lb(demurrage)} USD accruing." if demurrage > 0 else "Demurrage starts after that day."
            out.append(
                Conflict(
                    "C5",
                    ["terminal"],
                    {"pickup_lfd": lfd.isoformat(), "demurrage_usd": demurrage},
                    f"Last free day {say_date(lfd)}. {tail}",
                )
            )
    return out


def _demurrage(terminal: dict) -> float:
    return sum(
        float(f.get("amount") or 0)
        for f in terminal.get("fees_at_pod_terminal") or []
        if f.get("type") == "demurrage"
    )


def _trust(present, readings, ages, dark, conflicts, call_outcome: str | None = None) -> dict[str, Trust]:
    out: dict[str, Trust] = {}
    confirmed = CALL_CONFIRMS.get(call_outcome or "")
    for name in SOURCES:
        spec = SOURCE_SPECS[name]
        if name not in present:
            out[name] = Trust(name, 0.0, f"{name}: no reading for this box, trust 0.00")
            continue
        if name in dark:
            out[name] = Trust(name, 0.0, f"{name}: dark, last report {say_age(ages[name])} ago, trust 0.00")
            continue
        age = ages[name] or 0.0
        freshness = 0.5 ** (age / spec.half_life_h)
        n = sum(1 for c in conflicts if name in c.sources)
        value = spec.base * freshness * 0.7**n
        noun = "conflict" if n == 1 else "conflicts"
        reason = f"{name}: base {spec.base:.2f}, age {say_age(age)}, freshness {freshness:.2f}, {n} {noun}, trust {value:.2f}"
        if name == confirmed:
            value = min(0.99, value + CALL_TRUST_BONUS)
            reason += f", plus {CALL_TRUST_BONUS:.2f} because the trucker call backed it, trust {value:.2f}"
        out[name] = Trust(name, round(value, 2), reason)
    return out


def _urgency(readings, active, pending, lfd_hours, appt_hours, rated: bool = False) -> int:
    points = float(RATED_BONUS) if rated else 0.0
    reefer = readings.get("reefer")
    if reefer:
        sp = float(reefer["set_point_c"])
        kind = cargo_kind(sp)
        over = max(0.0, float(reefer["product_temp_c"]) - sp)
        temp_points = min(40.0, over / 4 * 40)
        points += temp_points * (0.5 if kind == "frozen" else 1.0)
        if reefer.get("power_on") is False and kind in ("chilled", "produce"):
            points += 40
    if lfd_hours is not None:
        if lfd_hours <= 24:
            points += 30
        elif lfd_hours <= 48:
            points += 20
        elif lfd_hours <= 72:
            points += 10
    terminal = readings.get("terminal")
    if terminal and _demurrage(terminal) > 0:
        points += 15
    if any(h["name"] in CUSTOMS_HOLD_NAMES for h in active):
        points += 15
    if any(h["name"] in ("line", "freight", "TMF") for h in active):
        points += 10
    if pending:
        points += 5
    if appt_hours is not None and -1 < appt_hours <= 2:
        points += 10
    return int(min(100, round(points)))


def _readings_list(box: Box, readings: dict[str, dict], observed) -> list[Reading]:
    out = []
    for name, data in readings.items():
        for key, value in data.items():
            out.append(Reading(name, key, value, observed[name]))
    return out


def build_ctx(box: Box, now: datetime) -> tuple[Ctx, dict[str, Trust], list[Reading]]:
    readings, ages, observed, dark, present = _source_status(box, now)
    active, pending = _holds(readings)
    terminal = readings.get("terminal")
    available = None
    lfd = None
    lfd_hours = None
    if terminal:
        if terminal.get("availability_known", True) is not False and terminal.get("available_for_pickup") is not None:
            available = bool(terminal["available_for_pickup"])
        lfd = parse_date(terminal.get("pickup_lfd"))
        if lfd:
            lfd_hours = hours_between(lfd_deadline(lfd, now.tzinfo), now)
    appt_at = parse_dt((box.appointment or {}).get("at")) or parse_dt((terminal or {}).get("pickup_appointment_at"))
    appt_hours = hours_between(appt_at, now) if appt_at else None
    conflicts = _conflicts(box, now, readings, ages, dark, active, pending, available, lfd, lfd_hours)
    trust = _trust(present, readings, ages, dark, conflicts, box.call_outcome)
    urgency = _urgency(readings, active, pending, lfd_hours, appt_hours, box.rated is not None)
    ctx = Ctx(
        box=box,
        now=now,
        readings=readings,
        ages_h=ages,
        dark=dark,
        conflicts=conflicts,
        urgency=urgency,
        active_holds=active,
        pending_holds=pending,
        available=available,
        lfd_hours=lfd_hours,
        appointment_hours=appt_hours,
        silence=classify_silence(box, now),
    )
    return ctx, trust, _readings_list(box, readings, observed)


def _owner(ctx: Ctx, fired: list[Rule], step: str) -> str | None:
    if step == "HOLD" and ctx.active_holds:
        return ctx.active_holds[0]["owner"]
    for same_step_only in (True, False):
        for rule in fired:
            if rule.owner and (rule.step_for(ctx) == step or not same_step_only):
                owner = rule.owner(ctx)
                if owner:
                    return owner
    return None


def _reason(
    ctx: Ctx, fired: list[Rule], whys: dict[str, str], step: str, hand: bool, pinned: bool, owner: str | None
) -> str:
    parts: list[str] = []
    told: set[int] = set()

    def tell_conflicts(codes):
        for i, c in enumerate(ctx.conflicts):
            if c.code in codes and i not in told:
                told.add(i)
                parts.append(c.sentence)

    if not fired:
        parts.append(f"{FALLBACK_SENTENCE} Urgency {ctx.urgency}.")
    for rule in fired:
        tell_conflicts(rule.uses)
        parts.append(whys[rule.id])
    tell_conflicts({c.code for c in ctx.conflicts})
    parts.append("Release first at its slot." if pinned else STEP_SENTENCE[step])
    if hand and step != "HAND":
        if step == "RELEASE":
            parts.append("Planner confirms with one tap.")
        elif any(r.id == "R6" for r in fired):
            parts.append("Escalated to planner with reefer evidence.")
        else:
            parts.append("Escalated to planner.")
    if owner:
        parts.append(f"Owner: {owner}.")
    return " ".join(p.strip() for p in parts if p.strip())


def evaluate(box: Box, now: datetime, rules: list[Rule] | None = None) -> Decision:
    rules = RULES if rules is None else rules
    ctx, trust, readings = build_ctx(box, now)
    fired = [rule for rule in rules if rule.test(ctx)]
    steps = [rule.step_for(ctx) for rule in fired]
    step = max(steps, key=lambda s: STRENGTH[s]) if steps else "WATCH"
    hand = (
        any(rule.hand for rule in fired)
        or "HAND" in steps
        or step == "HOLD"
        or (step == "RELEASE" and (bool(ctx.conflicts) or box.call_outcome is not None))
    )
    pinned = step == "RELEASE" and any(rule.pin for rule in fired)
    owner = _owner(ctx, fired, step)
    whys = {rule.id: rule.why(ctx) for rule in fired}
    return Decision(
        box=box.number,
        step=step,
        hand=hand,
        urgency=ctx.urgency,
        fired=[rule.id for rule in fired],
        conflicts=ctx.conflicts,
        trust={name: t.value for name, t in trust.items()},
        reason=_reason(ctx, fired, whys, step, hand, pinned, owner),
        owner=owner,
        pinned=pinned,
        votes={rule.id: s for rule, s in zip(fired, steps)},
        whys=whys,
        trust_detail=trust,
        readings=readings,
        twist_tag=next((rule.twist_tag for rule in fired if rule.twist_tag), None),
        silence=ctx.silence,
    )
