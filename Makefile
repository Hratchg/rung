SHELL := /bin/bash
PY := .venv/bin/python
PORT ?= 8000

.PHONY: setup dev build demo test tunnel retell-setup

setup:
	python3.12 -m venv .venv
	.venv/bin/pip install -r requirements.txt
	cd frontend && npm install
	[ -f .env ] || cp .env.example .env

dev:
	trap 'kill 0' EXIT; \
	$(PY) -m uvicorn backend.main:app --reload --port $(PORT) & \
	(cd frontend && npm run dev) & \
	wait

build:
	cd frontend && npm run build

demo: build
	$(PY) -m uvicorn backend.main:app --port $(PORT)

test:
	$(PY) -m pytest -q; code=$$?; if [ $$code -eq 5 ]; then echo "No tests collected"; exit 0; fi; exit $$code

tunnel:
	$(PY) scripts/tunnel.py $(PORT)

retell-setup:
	$(PY) scripts/retell_setup.py $(ARGS)
