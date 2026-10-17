from __future__ import annotations

from datetime import date, datetime, timedelta

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def parse_dt(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_date(value: str | date | None) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value[:10])


def iso(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value else None


def parse_offset(t: str) -> timedelta:
    sign = -1 if t.startswith("-") else 1
    hh, mm = t.lstrip("+-").split(":")
    return sign * timedelta(hours=int(hh), minutes=int(mm))


def format_offset(delta: timedelta) -> str:
    minutes = int(delta.total_seconds() // 60)
    sign = "-" if minutes < 0 else "+"
    minutes = abs(minutes)
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


def window_at(window: str, clock_start: datetime) -> datetime:
    """Resolve an HH:MM window to the first occurrence at or after the shift start."""
    hh, mm = (int(x) for x in window.split(":"))
    at = clock_start.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if at < clock_start.replace(second=0, microsecond=0):
        at += timedelta(days=1)
    return at


def lfd_deadline(lfd: date, tz) -> datetime:
    """Free time runs to the end of the last free day in terminal local time."""
    return datetime(lfd.year, lfd.month, lfd.day, tzinfo=tz) + timedelta(days=1)


def hours_between(later: datetime, earlier: datetime) -> float:
    return (later - earlier).total_seconds() / 3600


def say_age(hours: float | None) -> str:
    if hours is None:
        return "unknown"
    minutes = max(0, round(hours * 60))
    if minutes < 60:
        return f"{minutes} min"
    h, m = divmod(minutes, 60)
    return f"{h} h {m} min" if m else f"{h} h"


def say_num(value: float, digits: int = 1) -> str:
    """Numbers in UI copy say minus instead of using a dash."""
    text = f"{abs(value):.{digits}f}"
    return f"minus {text}" if value < 0 and float(text) != 0 else text


def say_lb(value: float) -> str:
    return f"{round(value):,}"


def say_date(value: date) -> str:
    return f"{MONTHS[value.month - 1]} {value.day}"


def say_time(value: datetime) -> str:
    return value.strftime("%H:%M")
