"""Write values into the gitignored .env without touching other lines or printing anything."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
EXAMPLE_PATH = ROOT / ".env.example"


def set_values(values: dict[str, str], path: Path | None = None) -> None:
    """Replace KEY=value for each key, keeping a trailing comment, and append keys not yet present."""
    path = path or ENV_PATH
    if not path.exists() and EXAMPLE_PATH.exists():
        shutil.copyfile(EXAMPLE_PATH, path)
    lines = path.read_text().splitlines() if path.exists() else []
    pending = dict(values)
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
        if key in pending:
            rest = line.split("=", 1)[1]
            comment = ""
            for marker in (" #", "\t#"):
                if marker in rest:
                    comment = "  #" + rest.split(marker, 1)[1]
                    break
            out.append(f"{key}={pending.pop(key)}{comment}")
        else:
            out.append(line)
    out.extend(f"{k}={v}" for k, v in pending.items())
    path.write_text("\n".join(out) + "\n")
    path.chmod(0o600)


def read_value(key: str, path: Path | None = None) -> str:
    """The current value in the file, read fresh so a value written by another script is seen."""
    path = path or ENV_PATH
    if not path.exists():
        return ""
    for line in path.read_text().splitlines():
        if line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.split(" #", 1)[0].split("\t#", 1)[0].strip().strip('"').strip("'")
    return ""
