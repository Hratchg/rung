SHELL := /bin/bash
PYTHON ?= python3.12
PY := .venv/bin/python
HOST ?= 127.0.0.1
PORT ?= 8000

.PHONY: setup dev build demo test tunnel retell-setup

.venv/.ready: requirements.txt
	$(PYTHON) -m venv .venv
	.venv/bin/pip install -q -r requirements.txt
	touch $@

frontend/node_modules/.ready: frontend/package.json frontend/package-lock.json
	cd frontend && npm ci --no-audit --no-fund
	touch $@

.env:
	cp .env.example .env

setup: .venv/.ready frontend/node_modules/.ready .env

dev: setup
	trap 'kill 0' EXIT; \
	$(PY) -m uvicorn backend.main:app --reload --host $(HOST) --port $(PORT) & \
	(cd frontend && npm run dev) & \
	wait

build: frontend/node_modules/.ready
	cd frontend && npm run build

demo: setup build
	$(PY) -m uvicorn backend.main:app --host $(HOST) --port $(PORT)

test: .venv/.ready
	$(PY) -m pytest -q; code=$$?; if [ $$code -eq 5 ]; then echo "No tests collected"; exit 0; fi; exit $$code

tunnel: .venv/.ready
	$(PY) scripts/tunnel.py $(PORT)

retell-setup: .venv/.ready
	$(PY) scripts/retell_setup.py $(ARGS)
