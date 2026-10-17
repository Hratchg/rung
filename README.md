# Rung

Gate triage for the shift yard planner at Pier 7, a fictional container terminal in San Pedro Bay.
For every container waiting to leave, Rung fuses five sources, scores how much waiting costs, detects
conflicts between sources, and recommends the gentlest step on a ladder:
RELEASE, WATCH, ASK, SLOW, HOLD, and HAND. The planner approves or overrides every hold or release,
and every decision is written to an audit log.

Status: Phase 4 (Ask Call) is built: the queue, the box card with the Ask call, the audit and twist
panels, and the gate re-slotting optimizer with its Gate screen. With no Retell key the Ask call
runs as a scripted simulated web call.

## Screens

| Screen | How to get there | What it shows |
| --- | --- | --- |
| Queue | `#/`, the Queue tab | Every waiting box grouped by step, with Approve and Override per row |
| Box card | Click a box number, or open `#/box/MSKU1234567` | Five source panels with trust bars (hover for the trust reason), conflicts with both values, fired rules with their step, the reason, the Ask call with its transcript and outcome, decision history, and on Harbor Night the reefer warm up clock |
| Gate | `#/gate`, the Gate tab | Lanes by windows with appointment chips (R reefer, L last free day today, M moved), a Close or Open toggle per lane, the moved and overflow lists, solve time and solver name, and Rung against closing the terminal |
| Audit log panel | Audit log tab, or Open in audit log on a box card | Audit lines newest first, filter by box |
| Twist log panel | Twist log tab | Each twist tag, when it was received, what was added, and when it merged |

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
curl localhost:8000/api/gate
curl -X POST localhost:8000/api/gate/lanes     -H 'Content-Type: application/json' -d '{"lane": 4, "open": false}'
```

## Gate optimizer

`backend/gate.py` places every open booking into slot units, one per lane, window, and truck, over
open lanes only. Cost is delay hours times (101 minus urgency), plus a flat 1e6 penalty for a window
earlier than the booking, a HOLD box, or a closed lane. Pairs that carry the penalty are dropped, so a
box with no feasible unit lands in overflow, ordered by urgency. Reefers and boxes at or past their
last free day are solved first, so they keep a slot whenever one exists. If scipy fails, a greedy
urgency sort takes over and the Gate screen says so. Approving SLOW on a box books it into its planned slot.

## Ask call

The Ask button on a box card calls `POST /api/call/{number}` to ask the trucker about a weight
conflict. Try it on the heavy box `CMAU9939083`, whose manifest says 36,000 lb against 40,500 lb on the scale.
A poller reads the call every 3 seconds, and the outcome re-evaluates the box:

| Outcome | Effect |
| --- | --- |
| `confirmed_empty` | The trucker backs the manifest. C1 clears and carrier trust rises by 0.20 |
| `confirmed_loaded` | The trucker backs the scale. Weighbridge trust rises by 0.20 and rule R12 sends the box to HAND |
| `reschedule_accepted` | The trucker takes a later slot. C1 stays open and R12 votes SLOW |
| `unknown` | C1 stays open and R12 votes HOLD, owner shipping line |

Every call writes a `voice` audit line with the call id when it starts, and another with the call id and outcome when it ends.

| Keys set in `.env` | What runs |
| --- | --- |
| None | Simulated web call. A scripted transcript plays line by line, and a picker on the card sets the trucker answer |
| `RETELL_API_KEY`, `RETELL_AGENT_ID` | `create_web_call` with the six dynamic variables as strings and the box number in metadata. The browser joins with `retell-client-js-sdk` using the access token |
| plus `RETELL_FROM_NUMBER` and `RETELL_PHONE_ENABLED=true` | `create_phone_call` from that number to the trucker phone on the appointment |
| plus `PUBLIC_BASE_URL` from `make tunnel` | Retell can reach the custom functions `POST /api/retell/lookup` (inbound, "is my box ready") and `POST /api/retell/record` (outbound outcome). Both check `x-retell-signature` with `retell.verify` when a key is set |

The Retell agent "Pier 7 gate desk" needs a post call analysis with the fields `outcome`
(confirmed_empty, confirmed_loaded, reschedule_accepted, unknown), `callback_needed`, and `notes`.

## Layout

| Path | What it holds |
| --- | --- |
| `backend/engine.py` | Pure `evaluate(box, now)`: trust, conflicts C1 to C5, urgency, rule firing, reason strings |
| `backend/rules/` | One file per rule, R0 to R12, each with a module level `RULE` and `created_at`. R12 applies the Ask call outcome |
| `backend/scenario.py` | Loads `scenario.json`, builds the seeded synthetic population, scenario clock, events, planner actions |
| `backend/feeds.py` | Simulated reefer telemetry and weighbridge readings |
| `backend/t49.py` | Terminal49 poller with fixture fallback |
| `backend/voice.py` | Retell web and phone calls, the call poller shape, signature checks, and the scripted mock call |
| `backend/gate.py` | Pure `solve()` for gate re-slotting with `scipy.optimize.linear_sum_assignment` and a greedy fallback |
| `backend/audit.py` | `audit.jsonl` writer and a 5000 line ring buffer |
| `backend/main.py` | FastAPI routes, serves `frontend/dist` from the same origin |
| `twists.json` | Twist log. One entry per merged TWIST: tag, text, received and merged times, files added |
| `frontend/src/` | Vite, React, TypeScript, Tailwind, TanStack Query. `App.tsx` header and hash routes, `Queue.tsx`, `BoxCard.tsx`, `AskCall.tsx`, `Gate.tsx`, `Audit.tsx` panels, `Decide.tsx` approve and override |
| `tests/` | Engine, API, gate optimizer, and voice tests |

## Live versus simulated

| Source | Fields | Origin today |
| --- | --- | --- |
| carrier | weight, equipment, status, seal, arrival | Simulated. Live from Terminal49 when a key with read access is set |
| terminal | availability, last free day, fees, location, appointment, line, freight and TMF holds | Simulated. Live from Terminal49 when a key with read access is set |
| customs | customs, USDA, VACIS holds | Simulated. Live from Terminal49 when a key with read access is set |
| weighbridge | measured weight | Simulated only |
| reefer | set point, air and product temperature, power | Simulated only |
| ask call | transcript, outcome, callback needed, notes | Simulated. Live through Retell when `RETELL_API_KEY` and `RETELL_AGENT_ID` are set |
