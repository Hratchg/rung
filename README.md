# Rung

Gate triage for the shift yard planner at Pier 7, a fictional container terminal in San Pedro Bay.
For every container waiting to leave, Rung fuses five sources, scores how much waiting costs, detects
conflicts between sources, and recommends the gentlest step on a ladder:
RELEASE, WATCH, ASK, SLOW, HOLD, and HAND. The planner approves or overrides every hold or release,
and every decision is written to an audit log.

Status: Phase 5 (stand-out features) is built on top of Phases 1 to 4: the queue, the box card with
the Ask call, the audit and twist panels, and the gate re-slotting optimizer with its Gate screen,
plus the dark feed banner, the spoof input, rated order mode, the silent reefer classifier, and the
twist diff. With no Retell key the Ask call runs as a scripted simulated web call.

## Screens

| Screen | How to get there | What it shows |
| --- | --- | --- |
| Header | Always on top | Clock, lanes, counters, poller status, the live and simulated legend, the Rated orders switch, scenario controls, and a red dark feed banner while a feed is dark |
| Queue | `#/`, the Queue tab | Every waiting box grouped by step, with Approve and Override per row |
| Box card | Click a box number, or open `#/box/MSKU1234567` | Five source panels with trust bars (hover for the trust reason), conflicts with both values, fired rules with their step, the reason, the Ask call with its transcript and outcome, the spoof input, decision history, the silent reefer class, and on Harbor Night the reefer warm up clock |
| Gate | `#/gate`, the Gate tab | Lanes by windows with appointment chips (R reefer, L last free day today, M moved, D rated order), a Close or Open toggle per lane, the rated orders strip, the moved and overflow lists with slid boxes first, solve time and solver name, and Rung against closing the terminal |
| Audit log panel | Audit log tab, or Open in audit log on a box card | Audit lines newest first, filter by box |
| Twist log panel | Twist log tab | Each twist tag, when it was received, what was added, when it merged, and the git diff of its commits |

## Setup

Needs Python 3.12 and Node 20 or newer.

```bash
make setup        # creates .venv, installs requirements.txt and frontend packages, copies .env.example to .env
```

Every value in `.env` may stay empty. The scenario runs with no network at all. With no
`T49_API_KEY`, or a key without read access, the Terminal49 poller runs on `fixtures/t49_snapshot.json`
and every box is badged simulated. Keys live only in `.env`, which git ignores, and no script prints them.

## Run

| Purpose | Command |
| --- | --- |
| Dev, two servers with hot reload | `make dev` runs `uvicorn backend.main:app --reload --port 8000` and `npm run dev` in `frontend` with `/api` proxied to port 8000 |
| Demo, one process on one port | `make demo` builds the frontend, then runs `uvicorn backend.main:app --port 8000`. Open http://localhost:8000 |
| Tests | `make test` |

`make build` only builds the frontend. `scripts/track.py` creates Terminal49 tracking requests.

## Going live

The only Retell value to paste is `RETELL_API_KEY`, the secret key with the webhook badge under API
Keys in the Retell dashboard, so it can also verify the signatures on custom function calls. With the
app running on port 8000:

```bash
make tunnel          # second terminal, keep it open. Opens a cloudflared quick tunnel and writes PUBLIC_BASE_URL to .env
make retell-setup    # once. Creates the Retell LLM and the "Pier 7 gate desk" agent, writes RETELL_LLM_ID and RETELL_AGENT_ID to .env
```

Then restart the app. The Ask button on a box card now places a real Retell web call in the browser.

- `make tunnel` needs `cloudflared` on the path. It checks that `PUBLIC_BASE_URL/api/state` answers from the internet. A quick tunnel gets a new URL on every start, so once `RETELL_LLM_ID` is in `.env` it also points the Retell custom functions at the new URL. The tunnel makes the whole app public, scenario controls included, for as long as it runs.
- `make retell-setup` is safe to run again. It updates the LLM and agent whose ids are in `.env`, and `make retell-setup ARGS=--recreate` makes new ones. The agent gets the prompt for the outbound weight check and the inbound "is my box ready" call, the custom functions `lookup_box` and `record_outcome`, an `end_call` tool, and the post call analysis fields `outcome`, `callback_needed`, and `notes`. `RETELL_VOICE_ID` picks the voice. Without `PUBLIC_BASE_URL` the agent has no custom functions, and the outcome comes from the post call analysis alone.
- Phone calls need a number bought in the Retell dashboard. Put it in `RETELL_FROM_NUMBER`, set `RETELL_PHONE_ENABLED=true`, and run `make retell-setup` again to bind the number to the agent for inbound and outbound calls. Inbound "is my box ready" calls only happen on a number.
- Terminal49 reads need full API access, a paid plan or the 7 day API trial from Developers in the Terminal49 app. A key without it gets a 401 that says it can only create tracking requests. Rung treats that as fixture mode: the header chip reads "Fixture mode. Terminal49 key has no read access", every box stays simulated, and there is no dark feed banner. With read access, `GET /v2/containers` returns only the containers tracked in the account, so register real ones first with `scripts/track.py container <number> <SCAC>`. They show up as extra live rows in the queue. Terminal49 webhooks need the same paid access.

## Driving the scenario

The scenario clock starts at 22:00 on Oct 18 and runs one scenario minute per real second. The header
has Reset, a speed picker (Paused stops the clock), and buttons for the scripted events: close or reopen
lanes 4 to 6, place the customs hold on TCLU7654321, and take the terminal feed dark or bring it back.
The reefer picker lists every reefer that is powered and reporting, with its circuit, and applies one of
Cut power, Trip circuit, Drop telemetry, or Fail the unit. The same controls exist as API calls:

```bash
curl -X POST localhost:8000/api/scenario/reset
curl -X POST localhost:8000/api/scenario/speed -H 'Content-Type: application/json' -d '{"minutes_per_second": 0}'
curl -X POST localhost:8000/api/scenario/jump  -H 'Content-Type: application/json' -d '{"t": "+00:40"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_power_off", "box": "MSKU1234567"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "circuit_trip", "circuit": "R4"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_silent", "box": "HLBU4421825"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_silent", "box": "HLBU8714647", "alarm": "compressor fault"}'
curl -X POST localhost:8000/api/scenario/rated -H 'Content-Type: application/json' -d '{"on": true}'
curl -X POST localhost:8000/api/box/MSKU5027648/spoof -H 'Content-Type: application/json' -d '{"weight_in_lbs": 41000}'
curl -X POST localhost:8000/api/box/CMAU9939083/spoof -H 'Content-Type: application/json' -d '{"hold": {"name": "customs", "on": true}}'
curl localhost:8000/api/gate
curl -X POST localhost:8000/api/gate/lanes     -H 'Content-Type: application/json' -d '{"lane": 4, "open": false}'
curl 'localhost:8000/api/audit?limit=1&diff=true'
```

## Stand-out features

| Feature | Where | How it works |
| --- | --- | --- |
| Dark feed banner | Header | A red banner reads "Terminal feed dark, N min" while a `source_dark` event is in force, counted in scenario minutes, or while the Terminal49 poller fails because the key is rejected or the API is unreachable, counted in real minutes. A missing key, or a key that can only create tracking requests, is fixture mode, not a failure, so it shows no banner. The queue keeps running from the last snapshot |
| Spoof input | Box card | Type a fake carrier weight or place and clear a hold. The engine re-evaluates at once, the trust bars move, the card shows the step and trust before and after, and the audit log gets a `spoof` line |
| Rated order mode | Header switch, Gate screen | `scenario.json` lists six rated boxes under `rated_orders` with a gate out deadline 5 h after the clock start (03:00). While on, they get plus 50 urgency and rule R13 votes RELEASE with a pin, so a stronger step such as ASK on a weight conflict still wins. On the gate they are solved first and cannot take a window that starts after 02:00. Boxes that lost their slot to them show as Slid at the top of Overflow, with the slot they would have had |
| Silent reefer classifier | Header reefer picker, queue, box card | Each reefer reports its circuit (5 yard rows per circuit), its power draw, and any alarm. A unit is silent when its telemetry stops, or when its last reading is more than 2 h old. Rule R14 votes ASK, owner reefer crew, with one text per class. Tripped: 3 or more units on one circuit silent within 10 minutes. Failed: an alarm, or a draw outside 2 to 8 kW, before the silence. Telemetry: a single unit that drew a normal load |
| Twist diff | Twist log panel | For each twist tag, every commit whose message starts `twist: <tag>`, plus any git tag whose name starts with `twist`, with the files changed and the patch, capped at 400 lines. Without git the panel says there is no diff |

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
| `RETELL_API_KEY`, `RETELL_AGENT_ID` | `create_web_call` with the six dynamic variables as strings and the box number in metadata. The browser joins with `retell-client-js-sdk` on the transport and ICE servers the call returns. The gateway transport streams no transcript to the browser, so the card shows the transcript when the call ends, within 3 seconds |
| plus `RETELL_FROM_NUMBER` and `RETELL_PHONE_ENABLED=true` | `create_phone_call` from that number to the trucker phone on the appointment |
| plus `PUBLIC_BASE_URL` from `make tunnel` | Retell can reach the custom functions `POST /api/retell/lookup` (inbound, "is my box ready") and `POST /api/retell/record` (outbound outcome). Both check `x-retell-signature` with `retell.verify` when a key is set |

`make retell-setup` builds the agent "Pier 7 gate desk" with the post call analysis fields `outcome`
(confirmed_empty, confirmed_loaded, reschedule_accepted, unknown), `callback_needed`, and `notes`.
When `record_outcome` runs during the call, the outcome lands on the card before the call ends.

## Layout

| Path | What it holds |
| --- | --- |
| `backend/engine.py` | Pure `evaluate(box, now)`: trust, conflicts C1 to C5, urgency, rule firing, reason strings |
| `backend/rules/` | One file per rule, R0 to R14, each with a module level `RULE` and `created_at`. R12 applies the Ask call outcome, R13 releases rated orders, R14 asks about silent reefers |
| `backend/scenario.py` | Loads `scenario.json`, builds the seeded synthetic population, scenario clock, events, planner actions, rated order mode, and spoof input |
| `backend/feeds.py` | Simulated reefer telemetry with circuits, power draw, alarms, and silences, plus weighbridge readings |
| `backend/gitdiff.py` | Reads `twist:` commits and twist git tags for the twist log, cached per HEAD |
| `backend/t49.py` | Terminal49 poller with fixture fallback |
| `backend/voice.py` | Retell web and phone calls, the call poller shape, signature checks, and the scripted mock call |
| `backend/gate.py` | Pure `solve()` for gate re-slotting with `scipy.optimize.linear_sum_assignment` and a greedy fallback |
| `backend/audit.py` | `audit.jsonl` writer and a 5000 line ring buffer |
| `backend/main.py` | FastAPI routes, serves `frontend/dist` from the same origin |
| `scripts/` | `retell_setup.py` for `make retell-setup`, `tunnel.py` for `make tunnel`, `track.py` for Terminal49 tracking requests, `envfile.py` to write `.env` |
| `twists.json` | Twist log. One entry per merged TWIST: tag, text, received and merged times, files added |
| `frontend/src/` | Vite, React, TypeScript, Tailwind, TanStack Query. `App.tsx` header and hash routes, `Queue.tsx`, `BoxCard.tsx`, `AskCall.tsx`, `Spoof.tsx`, `Gate.tsx`, `Audit.tsx` panels, `Decide.tsx` approve and override |
| `tests/` | Engine, API, gate optimizer, voice, and Phase 5 feature tests |

## Live versus simulated

| Source | Fields | Origin today |
| --- | --- | --- |
| carrier | weight, equipment, status, seal, arrival | Simulated. Live from Terminal49 when a key with read access is set |
| terminal | availability, last free day, fees, location, appointment, line, freight and TMF holds | Simulated. Live from Terminal49 when a key with read access is set |
| customs | customs, USDA, VACIS holds | Simulated. Live from Terminal49 when a key with read access is set |
| weighbridge | measured weight | Simulated only |
| reefer | set point, air and product temperature, power, circuit, draw, alarm, telemetry loss | Simulated only |
| ask call | transcript, outcome, callback needed, notes | Simulated. Live through Retell when `RETELL_API_KEY` and `RETELL_AGENT_ID` are set |
