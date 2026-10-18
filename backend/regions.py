"""Region profiles for the global twist.

A region changes what the planner reads, never what Rung decides. evaluate(), the rules, the ladder, trust,
and the gate optimizer keep working in pounds, US dollars, and the canonical hold and owner names. The API
edge rewrites generated sentences with localize(), and the frontend formats numbers with the profile from
GET /api/state. Exchange rates are fixed demo rates, not live quotes.
"""
from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass

from .emissions import IDLE_GALLONS_PER_HOUR, KG_CO2_PER_GALLON_DIESEL, KG_CO2_PER_IDLE_HOUR
from .models import HOLD_LABELS

LB_TO_KG = 0.45359237
LITRES_PER_GALLON = 3.785411784


def _metric_emissions_label() -> str:
    litres = IDLE_GALLONS_PER_HOUR * LITRES_PER_GALLON
    per_litre = KG_CO2_PER_GALLON_DIESEL / LITRES_PER_GALLON
    return (
        f"{KG_CO2_PER_IDLE_HOUR:.2f} kg CO2 per truck idle hour. A heavy duty diesel truck burns about "
        f"{litres:.1f} litres of diesel an hour at idle, and each litre makes {per_litre:.2f} kg CO2."
    )


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    port: str
    country: str
    locode: str
    timezone: str
    tz_label: str
    utc_offset: str
    weight_unit: str
    currency: str
    per_usd: float
    customs: str
    customs_short: str
    customs_broker: str
    hold_labels: dict[str, str]
    hold_text: dict[str, str]
    adapter: str
    adapter_note: str
    sources: dict[str, str]
    appointments: str
    language: str
    emissions_label: str | None
    emissions_rules: str

    def public(self) -> dict:
        return asdict(self)


LOS_ANGELES = Region(
    id="los_angeles",
    name="Los Angeles",
    port="San Pedro Bay, California",
    country="United States",
    locode="USLAX",
    timezone="America/Los_Angeles",
    tz_label="PDT",
    utc_offset="UTC minus 7",
    weight_unit="lb",
    currency="USD",
    per_usd=1.0,
    customs="U.S. Customs and Border Protection",
    customs_short="CBP",
    customs_broker="customs broker",
    hold_labels=dict(HOLD_LABELS),
    hold_text={},
    adapter="Terminal49",
    adapter_note="Terminal49 tracks the ocean carrier and the terminal for US imports.",
    sources={
        "carrier": "Terminal49, from the ocean carrier",
        "terminal": "Terminal49, from the terminal",
        "customs": "CBP holds, through Terminal49",
        "weighbridge": "Gate weighbridge",
        "reefer": "Reefer telemetry",
    },
    appointments="Terminal appointment systems, with PierPass off peak shifts",
    language="English",
    emissions_label=None,
    emissions_rules="California limits a diesel truck to 5 minutes of idling.",
)

ROTTERDAM = Region(
    id="rotterdam",
    name="Rotterdam",
    port="Maasvlakte, Port of Rotterdam",
    country="Netherlands",
    locode="NLRTM",
    timezone="Europe/Amsterdam",
    tz_label="CEST",
    utc_offset="UTC plus 2",
    weight_unit="kg",
    currency="EUR",
    per_usd=0.86,
    customs="Dutch Customs (Douane), under the EU customs code and ICS2",
    customs_short="Douane",
    customs_broker="customs agent",
    hold_labels={**HOLD_LABELS, "USDA": "NVWA", "VACIS": "Douane scan", "TMF": "Terminal fee"},
    hold_text={
        "CBP HOLD": "DOUANE HOLD",
        "USDA HOLD": "NVWA INSPECTION",
        "VACIS EXAM": "DOUANE SCAN",
        "TMF HOLD": "TERMINAL FEE",
    },
    adapter="Portbase",
    adapter_note="Portbase is the port community system for Rotterdam. Its adapter is a stub in this build.",
    sources={
        "carrier": "Portbase, from the shipping line",
        "terminal": "Portbase, from the terminal",
        "customs": "Douane status, through Portbase",
        "weighbridge": "Gate weighbridge",
        "reefer": "Reefer telemetry",
    },
    appointments="Portbase pre notification, with terminal time slots",
    language="Dutch and English",
    emissions_label=_metric_emissions_label(),
    emissions_rules="EU ETS covers ships since 2024. Road fuel joins EU ETS 2 later this decade.",
)

SHANGHAI = Region(
    id="shanghai",
    name="Shanghai",
    port="Yangshan, Port of Shanghai",
    country="China",
    locode="CNSHA",
    timezone="Asia/Shanghai",
    tz_label="CST",
    utc_offset="UTC plus 8",
    weight_unit="kg",
    currency="CNY",
    per_usd=7.1,
    customs="General Administration of Customs of China (GACC)",
    customs_short="China Customs",
    customs_broker="customs declaration agent",
    hold_labels={**HOLD_LABELS, "USDA": "Quarantine", "VACIS": "Customs scan", "TMF": "Terminal fee"},
    hold_text={
        "CBP HOLD": "CUSTOMS HOLD",
        "USDA HOLD": "QUARANTINE INSPECTION",
        "VACIS EXAM": "CUSTOMS SCAN",
        "TMF HOLD": "TERMINAL FEE",
    },
    adapter="China Single Window",
    adapter_note="The China International Trade Single Window carries customs release. Its adapter is a stub in this build.",
    sources={
        "carrier": "Carrier EDI",
        "terminal": "Terminal operator EDI",
        "customs": "China Customs release, through the Single Window",
        "weighbridge": "Gate weighbridge",
        "reefer": "Reefer telemetry",
    },
    appointments="Terminal truck appointment platforms",
    language="Mandarin Chinese",
    emissions_label=_metric_emissions_label(),
    emissions_rules="The national carbon market in China covers power and heavy industry, not trucks.",
)

REGIONS: dict[str, Region] = {r.id: r for r in (LOS_ANGELES, ROTTERDAM, SHANGHAI)}
DEFAULT = LOS_ANGELES.id

# Strings under these keys are identifiers or code, so localize() leaves them alone.
SKIP_KEYS = frozenset(
    {"name", "step", "engine_step", "code", "id", "kind", "source", "type", "box", "number", "tag", "actor",
     "outcome", "mode", "status", "currency_code", "patch", "twists", "file", "path", "sha", "call_id",
     "access_token", "url"}
)
_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)"
WEIGHT_RE = re.compile(rf"\b{_NUM} (lb|pounds)\b")
MONEY_RE = re.compile(rf"\b{_NUM} USD\b")


def get(region_id: str) -> Region:
    if region_id not in REGIONS:
        raise KeyError(region_id)
    return REGIONS[region_id]


def round_half_up(value: float) -> int:
    """Matches Math.round in the frontend, so a sentence and a field never differ by one."""
    return math.floor(value + 0.5)


def kg(lb: float) -> int:
    return round_half_up(lb * LB_TO_KG)


def money(usd: float, region: Region) -> int:
    return round_half_up(usd * region.per_usd)


def localize_text(text: str, region: Region) -> str:
    """One generated sentence in the region's units, currency, and names."""
    if region.id == DEFAULT or not text:
        return text
    if region.weight_unit == "kg":
        text = WEIGHT_RE.sub(
            lambda m: f"{kg(int(m.group(1).replace(',', ''))):,} {'kg' if m.group(2) == 'lb' else 'kilograms'}", text
        )
    if region.currency != "USD":
        text = MONEY_RE.sub(lambda m: f"{money(int(m.group(1).replace(',', '')), region):,} {region.currency}", text)
    text = text.replace("customs broker", region.customs_broker)
    for old, new in region.hold_text.items():
        text = text.replace(old, new)
    for name in ("USDA", "VACIS", "TMF"):
        old, new = HOLD_LABELS[name], region.hold_labels[name]
        text = text.replace(f"{old} hold", f"{new} hold")
    return text


def localize(value, region: Region, key: str | None = None):
    """Walk a JSON payload and localize every generated sentence. Identifiers and numbers pass through."""
    if region.id == DEFAULT or key in SKIP_KEYS:
        return value
    if isinstance(value, str):
        if key == "label" and value in HOLD_LABELS.values():
            return next((region.hold_labels[n] for n, v in HOLD_LABELS.items() if v == value), value)
        return localize_text(value, region)
    if isinstance(value, list):
        return [localize(v, region, key) for v in value]
    if isinstance(value, dict):
        return {k: localize(v, region, k) for k, v in value.items()}
    return value
