import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].split("\t#", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


_load_dotenv(ROOT / ".env")


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip() or default


T49_API_KEY = env("T49_API_KEY")
SCENARIO_PATH = ROOT / env("SCENARIO_PATH", "scenario.json")
MINUTES_PER_SECOND = float(env("MINUTES_PER_SECOND", "1"))
AUDIT_PATH = ROOT / env("AUDIT_PATH", "audit.jsonl")
FIXTURE_PATH = ROOT / "fixtures" / "t49_snapshot.json"
TWIST_LOG_PATH = ROOT / "twists.json"
FRONTEND_DIST = ROOT / "frontend" / "dist"
