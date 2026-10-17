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
