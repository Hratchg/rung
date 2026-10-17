import os
import tempfile
from pathlib import Path

os.environ.setdefault("AUDIT_PATH", str(Path(tempfile.gettempdir()) / "rung-test-audit.jsonl"))
os.environ["T49_API_KEY"] = ""
