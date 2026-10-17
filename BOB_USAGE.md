# AI assistant usage log

One entry per phase. Each entry says what the assistant produced and what a human still has to check.

## Entry 1. Phase 0, repo, environment, skeleton

- Asked the assistant to read the Rung spec and set up the repo.
- It created the Python 3.12 virtual environment, pinned the backend packages in `requirements.txt`, scaffolded the Vite, React, TypeScript, Tailwind, and TanStack Query frontend, and pinned exact versions in `frontend/package.json`.
- It wrote `.env.example`, the Makefile, `scenario.json` with the Harbor Night example box, the empty Terminal49 fixture, the scenario loader with the seeded synthetic population, the simulated reefer and weighbridge feeds, an `evaluate()` stub, and `GET /api/state` with a header that shows the scenario clock.
- Human check: the reefer warm up curves and the synthetic population mix.

## Entry 2. Phase 1, Can't Wait

- Asked the assistant to build the full engine, the queue API, and the Queue screen.
- It wrote trust, the five conflict detectors, the urgency score, rules R0 to R11 as one file each, the reason strings, and the audit writer.
- It added `GET /api/queue`, `GET /api/box`, `POST /api/decision`, the audit and scenario endpoints, and the Terminal49 poller with fixture fallback.
- It built the header with counters, poller status, legend, and scenario controls, plus the Queue screen grouped by step with Approve, Override, and badges.
- It wrote 36 tests covering the Harbor Night box, a clear box, a C2 box, a dark terminal with a pending release, the queue reorder on reefer power loss, reset twice, and the poller fallback.
- Human check: the list of spec gaps and the choices made for them in the phase report.

## Entry 3. Phase 2, Rung

- Asked the assistant to build the box card and the audit and twist panels, and to settle the open Phase 1 decisions with the spec's tie break rule.
- It dropped the urgency gate on R0 so clean urgent boxes release, and narrowed "pending release" to RELEASE boxes whose truck is due within 2 h, which cut the dark terminal HAND count from 104 to 21.
- It added rule names, files, and per rule sentences to decisions, a reefer warm up clock with the CSIRO note, `twists.json` for merged twists, and a limit on `GET /api/audit`.
- It built `BoxCard.tsx` with five source panels, trust bars with the trust reason on hover, conflicts with both values, fired rules, the reason, and history, plus `Audit.tsx` with the audit and twist panels.
- It added 8 tests. The suite has 44 tests.
- Human check: the warm up clock wording and the loss limits, 8 C over the set point for frozen cargo and 4 C over for the rest.

## Entry 4. Phase 3, Slow Lane

- Asked the assistant to build the gate re-slotting optimizer, the gate API, and the Gate screen, with counters measured against closing the terminal.
- It wrote `backend/gate.py`: slot units per open lane, window, and truck, the spec cost matrix with a flat finite penalty, `linear_sum_assignment` solved first for reefers and last free day boxes and then for the rest, a greedy fallback, and a moved diff with one line reasons.
- It added `GET /api/gate`, `POST /api/gate/lanes`, blunt move counters, planned slots on the appointment clock, and SLOW approval that rebooks the box.
- It built `Gate.tsx` with the lanes by windows grid, lane toggles, moved and overflow lists, the solver chip, and the comparison against a closed terminal.
- It wrote 14 gate tests. The suite has 58 tests.
- Human check: the spec cost weight (101 minus urgency) makes delay cheaper for urgent boxes. The priority tier keeps reefers and last free day boxes whole, but inside a tier urgent boxes are the ones pushed later.

## Entry 5. Phase 4, Ask Call

- Asked the assistant to build the Retell ask call, the custom functions, and the Ask button on the box card, with a mock path because no Retell key is available.
- It wrote `backend/voice.py`:
  - `create_web_call` with the six dynamic variables as strings and the box in metadata.
  - `create_phone_call` only when `RETELL_FROM_NUMBER` is set and `RETELL_PHONE_ENABLED` is true.
  - `retrieve` normalized into a transcript and an outcome, and `retell.verify` on custom function bodies.
  - A scripted mock call that unfolds line by line in real seconds.
- It added the outcome to the engine input. `confirmed_empty` clears C1 and lifts carrier trust, `confirmed_loaded` lifts weighbridge trust, and a new rule file R12 maps the remaining outcomes to HAND, HOLD, or SLOW.
- It added `POST /api/call/{number}`, `POST /api/retell/lookup`, and `POST /api/retell/record`, a 3 second call poller, and `voice` audit lines with the call id and outcome.
- It built `AskCall.tsx`, which runs a live web call through `retell-client-js-sdk` or plays the simulated call, plus call tags in the history and audit panel.
- It wrote 13 voice tests. The suite has 71 tests.
- Human check: create the "Pier 7 gate desk" agent in Retell with the post call analysis fields, then run one real web call. That path is tested only against a fake client.

## Entry 6. Phase 5, stand-out features

- Asked the assistant to build the five Phase 5 features: dark feed banner, spoof input, rated order mode, silent reefer classifier, and twist diff.
- It added poller failure tracking and a `dark_feed` list to `GET /api/state`, drawn as a red header banner in place of the old chip.
- It added `POST /api/box/{number}/spoof` and `Spoof.tsx`. A weight spoof restamps the carrier reading, a hold spoof goes through the existing hold events, and each spoof writes a `spoof` audit line.
- It added `rated_orders` to `scenario.json`, plus 50 urgency, rule R13, a gate out deadline enforced as a latest window in `backend/gate.py`, `POST /api/scenario/rated`, the header switch, the rated strip, and Slid chips in Overflow measured against a solve with rated orders off.
- It gave each simulated reefer a circuit, a power draw, alarms, and silences, added the `reefer_silent` and `circuit_trip` events, `classify_silence` in the engine, and rule R14 with one ASK text per class.
- It wrote `backend/gitdiff.py` for `twist:` commits and twist git tags, and the diff view in the twist panel.
- It wrote 16 Phase 5 tests. The suite has 87 tests.
- Human check: the circuit layout (5 yard rows per circuit), the 3 unit trip threshold, the 2 to 8 kW normal draw band, and the 02:00 last window for the 03:00 rated deadline are all assumptions. Confirm them with the terminal.

## Entry 7. Live paths

- Asked the assistant to turn on the live Retell and Terminal49 paths so the user only pastes keys.
- It wrote `scripts/retell_setup.py` (`make retell-setup`), which creates or updates the Retell LLM and the "Pier 7 gate desk" agent with the prompt, the `lookup_box` and `record_outcome` custom functions, `end_call`, and the post call analysis fields, then writes the ids to `.env`.
- It wrote `scripts/tunnel.py` (`make tunnel`), which opens a cloudflared quick tunnel, writes `PUBLIC_BASE_URL` to `.env`, checks it from the internet, and re-points the Retell functions when the URL changes.
- A real web call from the Ask button failed at first: Retell now hands out gateway transport tokens, and the browser was joining over LiveKit. The call start now passes the transport and ICE servers through.
- The Terminal49 key can only create tracking requests. That 401 is now fixture mode with a calm header chip, not a dark feed banner.
- It wrote 8 tests for the setup script, the `.env` writer, the transport pass through, and fixture mode. The suite has 95 tests.
- Human check: two real web calls ran with a recorded trucker voice. Both hit `record_outcome` through the tunnel, landed `confirmed_loaded`, and wrote audit lines with the Retell call id. The transcript reaches the card only when the call ends.
