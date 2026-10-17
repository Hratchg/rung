# AI assistant usage log

One entry per phase. Each entry says what the assistant produced and what a human still has to check.

## Entry 1. Phase 0, repo, environment, skeleton

- Asked the assistant to read the Rung spec and set up the repo.
- It created the Python 3.12 virtual environment, pinned the backend packages in `requirements.txt`, scaffolded the Vite, React, TypeScript, Tailwind, and TanStack Query frontend, and pinned exact versions in `frontend/package.json`.
- It wrote `.env.example`, the Makefile, `scenario.json` with the Harbor Night example box, the empty Terminal49 fixture, the scenario loader with the seeded synthetic population, the simulated reefer and weighbridge feeds, an `evaluate()` stub, and `GET /api/state` with a header that shows the scenario clock.
- Human check: the reefer warm up curves and the synthetic population mix.
