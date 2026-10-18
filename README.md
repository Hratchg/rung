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

- [UI guide](docs/ui-guide.md): a 60 second tour, every screen with annotated screenshots, a plain language glossary of every term on screen, and common questions. Start here if you have no port or logistics background.
- [How Rung works](docs/how-it-works.md): architecture, trust, conflicts, urgency, the rules, the optimizer, the voice call, and what is live versus simulated.
- [Demo pitch](docs/demo-pitch.md): a pitch that fits in 2:50 with the live voice call, a click by click run of show, a 30 second version, and a judges Q&A sheet.
- [Funding pathway](docs/funding-pathway.md): the federal funding plan, with sources. An NSF SBIR Phase I grant to launch, DoD through USTRANSCOM and SDDC for the Harbor Night dual use, and port-led MARAD grants to roll out.

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

No keys and no network are needed. With an empty `.env`, every box is simulated, **Call the trucker**
plays a scripted simulated call, and the scenario runs the same way every time.

| Command | What it does |
| --- | --- |
| `make demo` | Install if needed, build, and serve on one port |
| `make test` | Run the pytest suite |
| `cd frontend && npm test` | Run the Vitest suite: the UI copy rules, the ladder helpers, and the prompt drawer parser |
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
which gets a 401 saying the other permissions need a paid plan. The data source chip at the right of
the header reads "All data simulated", hovering it says the key has no read access, and no dark feed
banner shows. A rejected key or an unreachable API
is a real failure, and it does raise the banner. With read access, register real containers with
`scripts/track.py container <number> <SCAC>` and they appear as extra live rows in the queue.

### A live Retell call

With `RETELL_API_KEY` in `.env`:

```bash
make demo            # terminal 1. The app on port 8000
make tunnel          # terminal 2, keep it open. Needs cloudflared. Writes PUBLIC_BASE_URL to .env
make retell-setup    # once. Creates the LLM and the agent, writes RETELL_LLM_ID and RETELL_AGENT_ID to .env
```

Then restart `make demo`. **Call the trucker** on a box card now places a real Retell web call in the
browser, and its chip reads **Retell web call**. Allow the microphone, and answer as the trucker.

- A quick tunnel gets a new URL on every start. Once `RETELL_LLM_ID` is in `.env`, `make tunnel` points the agent's custom functions at the new URL by itself.
- The tunnel makes the whole app public, scenario controls included, for as long as it runs.
- `make retell-setup` is safe to run again. It updates the LLM and the agent in place. `make retell-setup ARGS=--recreate` makes new ones.
- Phone calls and inbound "is my box ready" calls need a number bought in the Retell dashboard. Put it in `RETELL_FROM_NUMBER`, set `RETELL_PHONE_ENABLED=true`, and run `make retell-setup` again to bind it.

## Feature tour

| Feature | Where | What you see |
| --- | --- | --- |
| Queue | Queue tab | A headline with how many boxes need a decision, the ladder strip with a count per step (click a step to filter), and one row per box with plain issue tags, urgency in words, clocks, live or simulated badges, and one main button named for the action. A dray carrier filter and **Show only these** for the boxes that need you |
| The ladder | Queue, **How the ladder works** | Every step, what it means at the gate, who acts, and how the rule votes are counted |
| Box card | Click a box number | What Rung recommends and the next step in one sentence, with **Your move** beside it. Then the call panel and reefer card when they matter, the rule votes, and where the sources disagree. Sources and trust, the full reason, and the history open on demand |
| Ask call | Box card, **Call the trucker** | The voice agent calls the trucker about a weight conflict. The transcript and outcome land on the card and re-evaluate the box |
| Voice agent prompt | **See the agent prompt** on the box card, or **Voice agent prompt** in the dock | The exact Retell prompt from `scripts/retell_setup.py`, the values filled in for each call, the tools, and the fields read back after the call |
| Truck idle and CO2 | Header, box card, Gate plan | Modelled idle hours and kg CO2 for trucks waiting at the gate: so far tonight in the header, per truck on the box card and the gate lists, and saved against closing the terminal in the gate headline. The factor and its DOE and EPA sources sit behind an info icon and in a footnote |
| Gate plan | Gate plan tab | A headline against closing the terminal, lanes by hourly windows with lane toggles, **Moved to a new slot**, and **No slot tonight** |
| Audit log | Audit log tab | Every decision line newest first with the reason first, filtered by box |
| Dark feed banner | Header | Shows how long a feed has been dark. The queue keeps running from the last snapshot |
| Fake a reading | Box card, **Demo: fake a reading** | Type a fake carrier weight or toggle a hold, and watch trust and the step change at once |
| Rated orders | Dock, **More controls** | Six listed boxes get a 03:00 gate out deadline, plus 50 urgency, and first claim on the gate. Boxes that slid show under **No slot tonight** |
| Silent reefer classifier | Dock, **More controls**, **Reefer fault** | Cut power, trip a circuit, drop telemetry, or fail a unit. Rung tells a tripped circuit from a failed unit from a telemetry fault |
| Twist log | Dock, **More controls**, **Twist log** | Each twist tag, what it added, when it merged, and the git diff of its commits |

The dashed amber **Demo controls** dock at the bottom drives the scenario and is not part of the
planner's app: **Reset**, **Minutes per second** (Pause stops the clock), the next scripted event, and
**More controls** with Close lanes 4 to 6, Customs hold on TCLU7654321, Cut terminal feed, the reefer
faults, and rated orders. The scripted Harbor Night events fire on their own as the clock passes them.
See [How Rung works](docs/how-it-works.md#the-scenario) for the timeline and the matching API calls,
and the [UI guide](docs/ui-guide.md) for an annotated tour of every screen and a glossary of every term.

## Layout

| Path | What it holds |
| --- | --- |
| `backend/engine.py` | Pure `evaluate(box, now)`: trust, conflicts C1 to C5, urgency, rule firing, reason strings |
| `backend/rules/` | One file per rule, R0 to R14 |
| `backend/scenario.py` | Scenario clock, the seeded population, events, planner actions, rated orders, spoof input |
| `backend/feeds.py` | Simulated reefer telemetry and weighbridge readings |
| `backend/gate.py` | Gate re-slotting with `scipy.optimize.linear_sum_assignment` and a greedy fallback |
| `backend/emissions.py` | Truck idle hours at the gate and the CO2 factor, with its sources |
| `backend/voice.py` | Retell web and phone calls, signature checks, and the scripted simulated call |
| `backend/t49.py` | Terminal49 poller with the fixture fallback |
| `backend/audit.py`, `backend/gitdiff.py` | `audit.jsonl` writer and ring buffer, and the twist diff reader |
| `backend/main.py` | FastAPI routes. Serves `frontend/dist` from the same origin |
| `frontend/src/` | Vite, React, TypeScript, Tailwind, TanStack Query, shadcn/ui primitives on Radix in `components/ui` |
| `frontend/src/copy.ts` | Every plain language label: step meanings, rule tags, planner verbs, event lines |
| `scripts/` | `retell_setup.py`, `tunnel.py`, `track.py`, `envfile.py` |
| `scenario.json`, `fixtures/`, `twists.json` | The scenario, the Terminal49 fixture, and the twist log |
| `tests/` | Engine, API, gate, voice, live setup, and Phase 5 tests |
