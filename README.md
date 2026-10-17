# Rung

Gate triage for the shift yard planner at Pier 7, a fictional container terminal in San Pedro Bay.
For every container waiting to leave, Rung fuses five sources, scores how much waiting costs, detects
conflicts between sources, and recommends the gentlest step on a ladder:
RELEASE, WATCH, ASK, SLOW, HOLD, and HAND. The planner approves or overrides every hold or release,
and every decision is written to an audit log.

Status: Phase 1 (Can't Wait) is built. The box card, gate optimizer, and voice calls come in later phases.

## Setup

Needs Python 3.12 and Node 20 or newer.

```bash
make setup        # creates .venv, installs requirements.txt and frontend packages, copies .env.example to .env
```

Every value in `.env` may stay empty. The scenario runs with no network at all. With no
`T49_API_KEY`, or a key that gets a 401, the Terminal49 poller runs on `fixtures/t49_snapshot.json`
and every box is badged simulated.

## Run

| Purpose | Command |
| --- | --- |
| Dev, two servers with hot reload | `make dev` runs `uvicorn backend.main:app --reload --port 8000` and `npm run dev` in `frontend` with `/api` proxied to port 8000 |
| Demo, one process on one port | `make demo` builds the frontend, then runs `uvicorn backend.main:app --port 8000`. Open http://localhost:8000 |
| Tests | `make test` |

`make build` only builds the frontend. `make tunnel` starts a cloudflared quick tunnel and prints the
`PUBLIC_BASE_URL` line to paste into `.env`. `scripts/track.py` creates Terminal49 tracking requests.

## Driving the scenario

The scenario clock starts at 22:00 on Oct 18 and runs one scenario minute per real second. The header
has Reset, a speed picker (Paused stops the clock), and buttons for the scripted events: close or reopen
lanes 4 to 6, place the customs hold on TCLU7654321, cut power on any powered reefer, and take the
terminal feed dark or bring it back. The same controls exist as API calls:

```bash
curl -X POST localhost:8000/api/scenario/reset
curl -X POST localhost:8000/api/scenario/speed -H 'Content-Type: application/json' -d '{"minutes_per_second": 0}'
curl -X POST localhost:8000/api/scenario/jump  -H 'Content-Type: application/json' -d '{"t": "+00:40"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_power_off", "box": "MSKU1234567"}'
```

## Layout

| Path | What it holds |
| --- | --- |
| `backend/engine.py` | Pure `evaluate(box, now)`: trust, conflicts C1 to C5, urgency, rule firing, reason strings |
| `backend/rules/` | One file per rule, R0 to R11, each with a module level `RULE` and `created_at` |
| `backend/scenario.py` | Loads `scenario.json`, builds the seeded synthetic population, scenario clock, events, planner actions |
| `backend/feeds.py` | Simulated reefer telemetry and weighbridge readings |
| `backend/t49.py` | Terminal49 poller with fixture fallback |
| `backend/audit.py` | `audit.jsonl` writer and a 5000 line ring buffer |
| `backend/main.py` | FastAPI routes, serves `frontend/dist` from the same origin |
| `frontend/src/` | Vite, React, TypeScript, Tailwind, TanStack Query. Header and Queue screen |
| `tests/` | Engine and API tests. `test_gate.py` is a placeholder until Phase 3 |

## Live versus simulated

| Source | Fields | Origin today |
| --- | --- | --- |
| carrier | weight, equipment, status, seal, arrival | Simulated. Live from Terminal49 when a key with read access is set |
| terminal | availability, last free day, fees, location, appointment, line, freight and TMF holds | Simulated. Live from Terminal49 when a key with read access is set |
| customs | customs, USDA, VACIS holds | Simulated. Live from Terminal49 when a key with read access is set |
| weighbridge | measured weight | Simulated only |
| reefer | set point, air and product temperature, power | Simulated only |
