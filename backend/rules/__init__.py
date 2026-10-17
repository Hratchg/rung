"""One file per rule. A twist is answered by adding a file with a module level RULE and created_at."""
from __future__ import annotations

import importlib
import pkgutil

from ..models import Rule


def load_rules() -> list[Rule]:
    rules: list[Rule] = []
    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_"):
            continue
        module = importlib.import_module(f"{__name__}.{info.name}")
        rule = getattr(module, "RULE", None)
        if isinstance(rule, Rule):
            rule.created_at = getattr(module, "created_at", rule.created_at)
            rules.append(rule)
    rules.sort(key=lambda r: (r.order, r.id))
    return rules
