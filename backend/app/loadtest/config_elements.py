"""
Config Element handlers — JMeter Config Element equivalent.
Each element transforms the thread-group config dict before the engine runs.
"""
from __future__ import annotations
import csv
import io
import random
from typing import Optional


class PromptPool:
    """Holds a pool of custom prompts loaded from a CSV Data Set element."""
    def __init__(self, prompts: list[str], mode: str = "random"):
        self.prompts = [p for p in prompts if p.strip()]
        self.mode = mode
        self._index = 0

    def next(self) -> Optional[str]:
        if not self.prompts:
            return None
        if self.mode == "sequential":
            p = self.prompts[self._index % len(self.prompts)]
            self._index += 1
            return p
        return random.choice(self.prompts)


def apply_config_elements(tg_config: dict, elements: list[dict]) -> tuple[dict, Optional[PromptPool]]:
    """
    Apply config elements to a thread-group config dict.
    Returns updated config and an optional PromptPool.
    """
    tg = dict(tg_config)  # shallow copy
    pool: Optional[PromptPool] = None

    for el in elements:
        etype = el.get("type", "")

        if etype == "csv_data_set":
            raw = el.get("data", "")  # newline-separated prompts or CSV text
            col = el.get("column", None)  # optional column name for CSV
            prompts = _parse_csv_prompts(raw, col)
            mode = el.get("mode", "random")
            if prompts:
                pool = PromptPool(prompts, mode=mode)

        elif etype in ("think_time", "timer"):
            timer_type = el.get("timer_type", "uniform")
            if timer_type == "constant":
                delay = int(el.get("delay_ms") or el.get("min_ms") or 200)
                tg["think_time_min_ms"] = delay
                tg["think_time_max_ms"] = delay
            elif timer_type == "gaussian":
                mean_ms = int(el.get("delay_ms") or 500)
                dev_ms = int(el.get("deviation_ms") or 150)
                tg["think_time_min_ms"] = max(0, mean_ms - dev_ms)
                tg["think_time_max_ms"] = mean_ms + dev_ms
            else:
                tg["think_time_min_ms"] = int(el.get("min_ms") or 0)
                tg["think_time_max_ms"] = int(el.get("max_ms") or 0)

        elif etype == "auth_header":
            # Stored in tg for adapter to pick up if supported
            tg.setdefault("extra_headers", {})
            tg["extra_headers"][el.get("key", "Authorization")] = el.get("value", "")

        elif etype == "token_budget":
            if "max_tokens" in el and el["max_tokens"] is not None:
                tg["max_tokens"] = el["max_tokens"]
            if "temperature" in el and el["temperature"] is not None:
                tg["temperature"] = el["temperature"]

        elif etype == "user_defined_variables":
            # JMeter User Defined Variables: interpolate ${VAR_NAME} into fields
            vars_dict = el.get("variables", {})
            if isinstance(vars_dict, dict):
                for k, v in vars_dict.items():
                    placeholder = f"${{{k}}}"
                    val_str = str(v)
                    for field in ["system_prompt", "model"]:
                        if tg.get(field) and isinstance(tg[field], str):
                            tg[field] = tg[field].replace(placeholder, val_str)
                    if "extra_headers" in tg and isinstance(tg["extra_headers"], dict):
                        for hk, hv in list(tg["extra_headers"].items()):
                            if isinstance(hv, str):
                                tg["extra_headers"][hk] = hv.replace(placeholder, val_str)

    return tg, pool


def _parse_csv_prompts(raw: str, column: Optional[str]) -> list[str]:
    """Parse prompts from newline-separated text or CSV."""
    raw = raw.strip()
    if not raw:
        return []
    # Try CSV parsing with header
    if column and "," in raw:
        reader = csv.DictReader(io.StringIO(raw))
        prompts = [row[column].strip() for row in reader if row.get(column, "").strip()]
        if prompts:
            return prompts
    # Fall back to one-prompt-per-line
    return [line.strip() for line in raw.splitlines() if line.strip()]
