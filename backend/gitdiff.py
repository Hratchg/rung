"""Git diff per twist tag for the twist panel.

A merged twist is committed with the message "twist: <tag>". A git tag with the twist tag's name also counts.
Results are cached per HEAD and tag list, so the twist panel can poll every 2 seconds without running git each time.
"""
from __future__ import annotations

import subprocess
import threading
import time
from pathlib import Path

from . import config

PREFIX = "twist:"
GIT_TIMEOUT_S = 5
REFRESH_S = 5.0
PATCH_MAX_LINES = 400
PATCH_MAX_CHARS = 40_000
SEP = "\x1f"


class TwistDiffs:
    def __init__(self, root: Path = config.ROOT):
        self.root = Path(root)
        self.lock = threading.Lock()
        self._checked = 0.0
        self._key: tuple[str, str] | None = None
        self._by_tag: dict[str, list[dict]] | None = None

    def _git(self, *args: str) -> str | None:
        try:
            out = subprocess.run(
                ["git", "-C", str(self.root), *args], capture_output=True, text=True, timeout=GIT_TIMEOUT_S
            )
        except (OSError, subprocess.SubprocessError):
            return None
        return out.stdout if out.returncode == 0 else None

    def _commit(self, sha: str, short: str, date: str, subject: str, via: str) -> dict:
        files = []
        for line in (self._git("show", "--numstat", "--format=", sha) or "").splitlines():
            parts = line.split("\t")
            if len(parts) == 3:
                added, deleted, path = parts
                files.append({"path": path, "added": int(added) if added.isdigit() else None, "deleted": int(deleted) if deleted.isdigit() else None})
        patch = self._git("show", "--format=", "--patch", "--no-color", "-M", sha) or ""
        lines = patch.splitlines()
        truncated = len(lines) > PATCH_MAX_LINES or len(patch) > PATCH_MAX_CHARS
        if truncated:
            patch = "\n".join(lines[:PATCH_MAX_LINES])[:PATCH_MAX_CHARS]
        return {"sha": sha, "short": short, "date": date, "subject": subject, "via": via, "files": files, "patch": patch, "truncated": truncated}

    def _scan(self) -> dict[str, list[dict]]:
        by_tag: dict[str, list[dict]] = {}
        log = self._git("log", "--reverse", f"--grep=^{PREFIX}", f"--format=%H{SEP}%h{SEP}%cI{SEP}%s") or ""
        for line in log.splitlines():
            parts = line.split(SEP)
            if len(parts) != 4 or not parts[3].startswith(PREFIX):
                continue
            tag = parts[3][len(PREFIX):].strip()
            if tag:
                by_tag.setdefault(tag, []).append(self._commit(*parts, via="message"))
        for name in (self._git("tag", "--list") or "").split():
            if name in by_tag:
                continue
            info = self._git("log", "-1", f"--format=%H{SEP}%h{SEP}%cI{SEP}%s", f"{name}^{{commit}}")
            parts = (info or "").strip().split(SEP)
            if len(parts) == 4 and name.lower().startswith("twist"):
                by_tag[name] = [self._commit(*parts, via="git tag")]
        return by_tag

    def commits(self) -> dict[str, list[dict]] | None:
        """Twist commits by tag, oldest first. None when the project is not in a git repo."""
        with self.lock:
            now = time.monotonic()
            if self._key is not None and now - self._checked < REFRESH_S:
                return self._by_tag
            self._checked = now
            head = self._git("rev-parse", "HEAD")
            if head is None:
                self._key, self._by_tag = ("", ""), None
                return None
            key = (head.strip(), self._git("tag", "--list") or "")
            if key != self._key:
                self._key, self._by_tag = key, self._scan()
            return self._by_tag
