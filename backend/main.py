from __future__ import annotations

from fastapi import FastAPI

from . import config
from .scenario import Scenario
from .timefmt import format_offset, iso

LEGEND = {
    "live": "Live from Terminal49",
    "simulated": "Simulated by the Pier 7 scenario",
}

app = FastAPI(title="Rung")
app.state.scenario = Scenario()


def scenario() -> Scenario:
    return app.state.scenario


@app.get("/api/state")
def get_state() -> dict:
    sc = scenario()
    with sc.lock:
        sc.advance()
        return {
            "terminal": sc.terminal_name,
            "clock": iso(sc.now),
            "clock_start": iso(sc.start),
            "offset": format_offset(sc.now - sc.start),
            "minutes_per_second": sc.speed,
            "mode": sc.mode,
            "lanes": sc.lane_count,
            "lanes_open": sc.lanes_open(),
            "counters": {
                "released": 0,
                "released_blunt": 0,
                "reefers_powered": 0,
                "reefers_lost": 0,
                "demurrage_avoided_usd": 0,
                "throughput_pct": 0,
            },
            "legend": LEGEND,
            "poller": {"live_count": 0, "last_ok": None, "status": "fixture"},
        }


app.frontend("/", directory=config.FRONTEND_DIST, fallback="index.html", check_dir=False)
