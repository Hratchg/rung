"""Open a cloudflared quick tunnel to the app and write its URL to .env as PUBLIC_BASE_URL.

Usage:
    .venv/bin/python scripts/tunnel.py [port]

Runs until Ctrl-C. A quick tunnel gets a new URL on every start, so once retell_setup.py has written
RETELL_LLM_ID, this also points the Retell custom functions at the new URL.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts import envfile, retell_setup  # noqa: E402

URL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
READY_SECONDS = 60


def wait_until_reachable(url: str) -> bool:
    """Quick tunnel DNS takes a few seconds to resolve after cloudflared prints the URL."""
    deadline = time.monotonic() + READY_SECONDS
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{url}/api/state", timeout=5).status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(2)
    return False


def main(argv: list[str]) -> int:
    port = argv[1] if len(argv) > 1 else "8000"
    if not shutil.which("cloudflared"):
        print("cloudflared is not installed. See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        return 1
    proc = subprocess.Popen(
        ["cloudflared", "tunnel", "--no-autoupdate", "--url", f"http://localhost:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    url = ""
    try:
        for line in proc.stdout:
            sys.stdout.write(line)
            found = URL_PATTERN.search(line)
            if url or not found:
                continue
            url = found.group(0)
            envfile.set_values({"PUBLIC_BASE_URL": url})
            print(f"PUBLIC_BASE_URL={url} written to .env", flush=True)
            if wait_until_reachable(url):
                print(f"{url}/api/state answers from the internet.", flush=True)
            else:
                print(f"{url}/api/state did not answer within {READY_SECONDS} s. Is the app running on port {port}?", flush=True)
            if not retell_setup.value("RETELL_API_KEY"):
                print("Put RETELL_API_KEY in .env, then run make retell-setup.", flush=True)
            elif not retell_setup.value("RETELL_LLM_ID"):
                print("Run make retell-setup to create the Retell agent with this URL.", flush=True)
            else:
                retell_setup.run(base_url=url)
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
    return proc.wait()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
