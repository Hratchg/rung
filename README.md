# Rung

Rung is a gate triage tool for the night shift yard planner at Pier 7, a fictional container terminal
in San Pedro Bay. For each of the 191 containers waiting to leave, it reads five sources (carrier,
terminal, customs, weighbridge, reefer), scores how much waiting costs, finds where the sources
disagree, and recommends the gentlest step on a six step ladder:

| Step | Meaning |
| --- | --- |
| RELEASE | No conflict and cleared. Dispatch at its slot |
| WATCH | Do nothing yet. Recheck at the next poll |
| ASK | Get fresher information first: re-poll, request a reweigh, or call the trucker |
| SLOW | Keep it moving, in a later slot or another lane |
| HOLD | Withhold the gate release for this box only, pending a named outside owner |
| HAND | A person must decide now |

The planner approves or overrides every hold and every release that follows a conflict. Every
decision, call, spoof, and override is written to an audit log with the reason in plain sentences.

The same app runs two nights. On an ordinary Tuesday the queue is a dispatcher's pull list and the
voice agent calls truckers about weight mismatches. On Harbor Night, half the gate lanes close, a new
customs hold lands, a reefer of chilled beef that already sits under a customs hold is warming, and the
terminal feed goes dark. Rung keeps the gate open: it re-slots every truck in under a millisecond and
hands the planner only the boxes that need a person.

- [How Rung works](docs/how-it-works.md): architecture, trust, conflicts, urgency, the rules, the optimizer, the voice call, and what is live versus simulated.
- [Demo pitch](docs/demo-pitch.md): a 3 minute script with a click by click run of show, a 30 second version, and a judges Q&A sheet.

## Quick start

Needs Python 3.12, Node 20 or newer, and `make`.

```bash
make demo
```

Then open http://127.0.0.1:8000.

The first run creates `.venv`, installs `requirements.txt`, runs `npm ci` in `frontend`, copies
`.env.example` to `.env`, builds the frontend, and starts one FastAPI process that serves the API and
the app on one port. Later runs skip any install that is already up to date. `PORT=8123 make demo`
picks another port, and `HOST=0.0.0.0 make demo` listens on every interface.

No keys and no network are needed. With an empty `.env`, every box is simulated, the Ask call plays a
scripted simulated call, and the scenario runs the same way every time.

| Command | What it does |
| --- | --- |
| `make demo` | Install if needed, build, and serve on one port |
| `make test` | Run the pytest suite |
| `make dev` | Hot reload: uvicorn on port 8000 plus the Vite dev server, with `/api` proxied to port 8000 |
| `make setup` | Install only |
| `make build` | Build the frontend into `frontend/dist` |
| `make tunnel` | Open a public cloudflared tunnel to the app and write `PUBLIC_BASE_URL` |
| `make retell-setup` | Create or update the Retell voice agent and write its ids |

## Keys, fixture mode, and going live

Keys live only in `.env`, which git ignores. No script prints them.

| Variable | Set by | What it does |
| --- | --- | --- |
| `T49_API_KEY` | You | Terminal49 key. Rung polls `GET /v2/containers` every 60 seconds |
| `RETELL_API_KEY` | You | Retell secret key, the one with the webhook badge under API Keys. Places calls and verifies custom function signatures |
| `RETELL_LLM_ID`, `RETELL_AGENT_ID` | `make retell-setup` | The Retell LLM and the "Pier 7 gate desk" agent |
| `PUBLIC_BASE_URL` | `make tunnel` | Public URL that Retell calls for the custom functions |
| `RETELL_VOICE_ID` | You, optional | Voice for a new agent. Empty picks `retell-Cimo` when the account has it |
| `RETELL_FROM_NUMBER`, `RETELL_PHONE_ENABLED` | You, optional | A number bought in Retell, and `true` to place phone calls instead of browser web calls |
| `SCENARIO_PATH`, `MINUTES_PER_SECOND` | Defaults | `scenario.json`, and one scenario minute per real second |
| `RETELL_PUBLIC_KEY` | Not needed | Web calls join with the access token that `create_web_call` returns |

### Fixture mode

Without a Terminal49 key that can read, Rung runs on `fixtures/t49_snapshot.json` and badges every
field simulated. That covers an empty `T49_API_KEY` and a key that can only create tracking requests,
which gets a 401 saying the other permissions need a paid plan. The header chip reads "Fixture mode.
Terminal49 key has no read access" and no dark feed banner shows. A rejected key or an unreachable API
is a real failure, and it does raise the banner. With read access, register real containers with
`scripts/track.py container <number> <SCAC>` and they appear as extra live rows in the queue.

### A live Retell call

With `RETELL_API_KEY` in `.env`:

```bash
make demo            # terminal 1. The app on port 8000
make tunnel          # terminal 2, keep it open. Needs cloudflared. Writes PUBLIC_BASE_URL to .env
make retell-setup    # once. Creates the LLM and the agent, writes RETELL_LLM_ID and RETELL_AGENT_ID to .env
```

Then restart `make demo`. The Ask button on a box card now places a real Retell web call in the
browser. Allow the microphone, and answer as the trucker.

- A quick tunnel gets a new URL on every start. Once `RETELL_LLM_ID` is in `.env`, `make tunnel` points the agent's custom functions at the new URL by itself.
- The tunnel makes the whole app public, scenario controls included, for as long as it runs.
- `make retell-setup` is safe to run again. It updates the LLM and the agent in place. `make retell-setup ARGS=--recreate` makes new ones.
- Phone calls and inbound "is my box ready" calls need a number bought in the Retell dashboard. Put it in `RETELL_FROM_NUMBER`, set `RETELL_PHONE_ENABLED=true`, and run `make retell-setup` again to bind it.

## Feature tour

| Feature | Where | What you see |
| --- | --- | --- |
| Queue | Queue tab | Every box grouped by step, with urgency, reason, clocks, live or simulated badges, and Approve or Override per row. Filters for dray carrier and step |
| Box card | Click a box number | Five source panels with trust bars, conflicts with both values, fired rules, the reason in large text, decision history, and on Harbor Night the reefer warm up clock |
| Ask call | Box card | Ask calls the trucker about a weight conflict. The transcript and outcome land on the card and re-evaluate the box |
| Gate | Gate tab | Lanes by hourly windows, lane toggles, moved and overflow lists, solve time, and Rung against closing the terminal |
| Audit log | Audit log tab | Every decision line newest first, filtered by box |
| Twist log | Twist log tab | Each twist tag, what it added, when it merged, and the git diff of its commits |
| Dark feed banner | Header | Shows how long a feed has been dark. The queue keeps running from the last snapshot |
| Spoof input | Box card | Type a fake carrier weight or toggle a hold, and watch trust and the step change at once |
| Rated orders | Header switch | Six listed boxes get a 03:00 gate out deadline, plus 50 urgency, and first claim on the gate. Boxes that slid show in overflow |
| Silent reefer classifier | Header reefer picker | Cut power, trip a circuit, drop telemetry, or fail a unit. Rung tells a tripped circuit from a failed unit from a telemetry fault |

The header drives the scenario: Reset, the speed picker (Paused stops the clock), Close lanes 4 to 6,
Hold TCLU7654321, the reefer picker, and Terminal feed dark. The scripted Harbor Night events fire on
their own as the clock passes them. See [How Rung works](docs/how-it-works.md#the-scenario) for the
timeline and the matching API calls.

## Layout

| Path | What it holds |
| --- | --- |
| `backend/engine.py` | Pure `evaluate(box, now)`: trust, conflicts C1 to C5, urgency, rule firing, reason strings |
| `backend/rules/` | One file per rule, R0 to R14 |
| `backend/scenario.py` | Scenario clock, the seeded population, events, planner actions, rated orders, spoof input |
| `backend/feeds.py` | Simulated reefer telemetry and weighbridge readings |
| `backend/gate.py` | Gate re-slotting with `scipy.optimize.linear_sum_assignment` and a greedy fallback |
| `backend/voice.py` | Retell web and phone calls, signature checks, and the scripted simulated call |
| `backend/t49.py` | Terminal49 poller with the fixture fallback |
| `backend/audit.py`, `backend/gitdiff.py` | `audit.jsonl` writer and ring buffer, and the twist diff reader |
| `backend/main.py` | FastAPI routes. Serves `frontend/dist` from the same origin |
| `frontend/src/` | Vite, React, TypeScript, Tailwind, TanStack Query |
| `scripts/` | `retell_setup.py`, `tunnel.py`, `track.py`, `envfile.py` |
| `scenario.json`, `fixtures/`, `twists.json` | The scenario, the Terminal49 fixture, and the twist log |
| `tests/` | Engine, API, gate, voice, live setup, and Phase 5 tests |
