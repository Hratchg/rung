from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Literal, Union

from pydantic import BaseModel, Field

SOURCES = ("carrier", "terminal", "customs", "weighbridge", "reefer")


@dataclass(frozen=True)
class SourceSpec:
    base: float
    half_life_h: float
    dark_after_h: float
    observed_field: str


SOURCE_SPECS: dict[str, SourceSpec] = {
    "carrier": SourceSpec(0.75, 24, 72, "observed_at"),
    "terminal": SourceSpec(0.85, 4, 12, "terminal_checked_at"),
    "customs": SourceSpec(0.95, 12, 36, "observed_at"),
    "weighbridge": SourceSpec(0.90, 2, 6, "measured_at"),
    "reefer": SourceSpec(0.90, 1, 3, "last_seen"),
}

STEPS = ("RELEASE", "WATCH", "ASK", "SLOW", "HOLD", "HAND")
STRENGTH = {step: i for i, step in enumerate(STEPS)}

CUSTOMS_HOLD_NAMES = ("customs", "USDA", "VACIS")
TERMINAL_HOLD_NAMES = ("line", "freight", "TMF", "other")
HOLD_OWNERS = {
    "customs": "customs broker",
    "USDA": "customs broker",
    "VACIS": "customs broker",
    "line": "shipping line",
    "freight": "shipping line",
    "TMF": "terminal",
    "other": "terminal",
}
HOLD_PRIORITY = ("customs", "VACIS", "USDA", "line", "freight", "TMF", "other")
HOLD_LABELS = {
    "customs": "Customs",
    "USDA": "USDA",
    "VACIS": "VACIS",
    "line": "Line",
    "freight": "Freight",
    "TMF": "TMF",
    "other": "Terminal",
}
WEIGHT_OWNER = "shipping line"

CALL_OUTCOMES = ("confirmed_empty", "confirmed_loaded", "reschedule_accepted", "unknown")
# Which source a trucker call backs: confirmed_empty backs the manifest, confirmed_loaded the scale.
CALL_CONFIRMS = {"confirmed_empty": "carrier", "confirmed_loaded": "weighbridge"}
CALL_TRUST_BONUS = 0.2

RATED_BONUS = 50
REEFER_CREW = "reefer crew"
SILENCE_KINDS = ("tripped", "telemetry", "failed")
SILENCE_LABELS = {"tripped": "Tripped circuit", "telemetry": "Telemetry fault", "failed": "Failed unit"}
SPOOF_HOLD_NAMES = ("customs", "USDA", "VACIS", "line", "freight", "TMF")


@dataclass
class Reading:
    source: str
    field: str
    value: Any
    observed_at: datetime | None


@dataclass
class Trust:
    source: str
    value: float
    reason: str


@dataclass
class Conflict:
    code: str
    sources: list[str]
    values: dict[str, Any]
    sentence: str


@dataclass
class Box:
    number: str
    live: bool = False
    carrier: dict | None = None
    terminal: dict | None = None
    customs: dict | None = None
    weighbridge: dict | None = None
    reefer: dict | None = None
    appointment: dict | None = None
    dark_sources: frozenset[str] = frozenset()
    lanes_closed: frozenset[int] = frozenset()
    weight_asked: bool = False
    pending_release: bool = False
    live_sources: frozenset[str] = frozenset()
    call_outcome: str | None = None
    # Gate out deadline, ISO, when rated order mode is on and the box is on the rated list.
    rated: str | None = None
    # Other reefers on the same circuit: {number, last_seen, comms_lost_at} from their latest reading.
    circuit_peers: tuple[dict, ...] = ()

    def source(self, name: str) -> dict | None:
        return getattr(self, name)


@dataclass
class Ctx:
    box: Box
    now: datetime
    readings: dict[str, dict]
    ages_h: dict[str, float | None]
    dark: list[str]
    conflicts: list[Conflict]
    urgency: int
    active_holds: list[dict]
    pending_holds: list[dict]
    available: bool | None
    lfd_hours: float | None
    appointment_hours: float | None
    silence: dict | None = None

    def has(self, code: str) -> bool:
        return any(c.code == code for c in self.conflicts)

    def codes(self) -> set[str]:
        return {c.code for c in self.conflicts}

    @property
    def is_reefer(self) -> bool:
        carrier = self.box.carrier or {}
        return carrier.get("equipment_type") == "reefer" or self.box.reefer is not None

    @property
    def depends_on(self) -> set[str]:
        """Sources whose silence blocks a decision. Carrier and weighbridge only feed the weight check."""
        return {"terminal", "customs"} | ({"reefer"} if self.is_reefer else set())

    @property
    def dark_dependencies(self) -> list[str]:
        return [s for s in self.dark if s in self.depends_on]

    @property
    def lane_closed(self) -> bool:
        appt = self.box.appointment
        return bool(appt) and appt.get("lane") in self.box.lanes_closed

    def holds_named(self, names: tuple[str, ...]) -> list[dict]:
        return [h for h in self.active_holds if h["name"] in names]


StepSpec = Union[str, Callable[[Ctx], str]]


@dataclass
class Rule:
    id: str
    step: StepSpec
    test: Callable[[Ctx], bool]
    why: Callable[[Ctx], str]
    hand: bool = False
    pin: bool = False
    uses: tuple[str, ...] = ()
    owner: Callable[[Ctx], str | None] | None = None
    twist_tag: str | None = None
    created_at: str = ""
    name: str = ""
    file: str = ""

    def step_for(self, ctx: Ctx) -> str:
        return self.step(ctx) if callable(self.step) else self.step

    @property
    def order(self) -> int:
        digits = "".join(ch for ch in self.id if ch.isdigit())
        return int(digits) if digits else 10_000


@dataclass
class Decision:
    box: str
    step: str
    hand: bool
    urgency: int
    fired: list[str]
    conflicts: list[Conflict]
    trust: dict[str, float]
    reason: str
    owner: str | None
    pinned: bool = False
    votes: dict[str, str] = field(default_factory=dict)
    whys: dict[str, str] = field(default_factory=dict)
    trust_detail: dict[str, Trust] = field(default_factory=dict)
    readings: list[Reading] = field(default_factory=list)
    twist_tag: str | None = None
    silence: dict | None = None


class DecisionIn(BaseModel):
    box: str
    action: Literal["approve", "override"]
    step: Literal["RELEASE", "WATCH", "ASK", "SLOW", "HOLD", "HAND"] | None = None
    note: str = ""


class JumpIn(BaseModel):
    t: str = Field(pattern=r"^\+\d{2}:\d{2}$")


class CallIn(BaseModel):
    mock_outcome: Literal["confirmed_empty", "confirmed_loaded", "reschedule_accepted", "unknown"] | None = None


class LaneIn(BaseModel):
    lane: int
    open: bool


class RatedIn(BaseModel):
    on: bool


class HoldToggle(BaseModel):
    name: Literal["customs", "USDA", "VACIS", "line", "freight", "TMF"] = "customs"
    on: bool


class SpoofIn(BaseModel):
    weight_in_lbs: int | None = Field(None, ge=0, le=150_000)
    hold: HoldToggle | None = None


class SpeedIn(BaseModel):
    minutes_per_second: float = Field(ge=0, le=120)


class RegionIn(BaseModel):
    region: str
