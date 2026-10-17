# Rung

Gate triage for the shift yard planner at Pier 7, a fictional container terminal in San Pedro Bay.
For every container waiting to leave, Rung fuses five sources, scores how much waiting costs, detects
conflicts between sources, and recommends the gentlest step on a ladder:
RELEASE, WATCH, ASK, SLOW, HOLD, and HAND. The planner approves or overrides every hold or release,
and every decision is written to an audit log.

## Setup

Needs Python 3.12 and Node 20 or newer.

```bash
make setup        # creates .venv, installs requirements.txt and frontend packages, copies .env.example to .env
```

Every value in `.env` may stay empty. The scenario runs with no network at all.

## Run

| Purpose | Command |
| --- | --- |
| Dev, two servers with hot reload | `make dev` runs `uvicorn backend.main:app --reload --port 8000` and `npm run dev` in `frontend` with `/api` proxied to port 8000 |
| Demo, one process on one port | `make demo` builds the frontend, then runs `uvicorn backend.main:app --port 8000`. Open http://localhost:8000 |
| Tests | `make test` |

`make build` only builds the frontend. `make tunnel` starts a cloudflared quick tunnel and prints the
`PUBLIC_BASE_URL` line to paste into `.env`.

## Live versus simulated

| Source | Fields | Origin today |
| --- | --- | --- |
| carrier | weight, equipment, status, seal, arrival | Simulated. Live from Terminal49 when a key with read access is set |
| terminal | availability, last free day, fees, location, appointment | Simulated. Live from Terminal49 when a key with read access is set |
| customs | customs, USDA, VACIS holds | Simulated. Live from Terminal49 when a key with read access is set |
| weighbridge | measured weight | Simulated only |
| reefer | set point, air and product temperature, power | Simulated only |
