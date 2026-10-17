import os
import tempfile
from pathlib import Path

os.environ.setdefault("AUDIT_PATH", str(Path(tempfile.gettempdir()) / "rung-test-audit.jsonl"))
# Real keys in .env must never reach Terminal49 or place a Retell call from the test suite.
for key in ("T49_API_KEY", "RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_FROM_NUMBER", "PUBLIC_BASE_URL"):
    os.environ[key] = ""
