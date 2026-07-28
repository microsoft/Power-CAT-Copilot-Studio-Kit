"""Independent operational logging for the MCP server.

Logs *what the MCP does*, with full detail: each tool call and its arguments,
the ServiceNow request that was fired (endpoint + query) and the data that came
back, and any error. Written to a daily JSONL file and mirrored to the console.

Deliberately simple: no cross-component correlation (no session id, no shared
request id). Correlate by reading the file top-to-bottom / by timestamp.

Every entry point swallows its own exceptions, so logging can never break a
tool call or change a response.

Line fields: timestamp, event, tool, request, response, severity, duration_ms.

Config (env, all optional):
  MCP_FILE_LOG        "0"/"false" disables file logging (default on).
  MCP_LOG_DIR         log directory (default: <cwd>/logs).
  MCP_LOG_MAX_BYTES   rotate the day's file at this size (default 5 MB).
  MCP_LOG_MAX_ROWS    max ServiceNow rows recorded per response (default 50).
"""
from __future__ import annotations

import functools
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from .logger import get_logger

_log     = get_logger("shared_mcp.file_logger")
_console = get_logger("mcp.trace")  # same events also render to stdout

# ── Config ────────────────────────────────────────────────────────────────────
_ENABLED   = os.getenv("MCP_FILE_LOG", "1").lower() not in ("0", "false", "no", "")
_LOG_ROOT  = Path(os.getenv("MCP_LOG_DIR") or (Path.cwd() / "logs"))
_MAX_BYTES = int(os.getenv("MCP_LOG_MAX_BYTES", str(5 * 1024 * 1024)))
_MAX_ROWS  = int(os.getenv("MCP_LOG_MAX_ROWS", "50"))


def _trim(obj):
    """Keep lines readable: truncate very long strings. Never raises."""
    try:
        if isinstance(obj, dict):
            return {k: _trim(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [_trim(v) for v in obj]
        if isinstance(obj, str) and len(obj) > 4000:
            return obj[:4000] + "…<truncated>"
        return obj
    except Exception:
        return "<unserializable>"


def cap_rows(rows: list) -> list:
    """Cap a returned-record list so a single call can't produce a huge line."""
    try:
        if len(rows) > _MAX_ROWS:
            return list(rows[:_MAX_ROWS]) + [{"_note": f"{len(rows) - _MAX_ROWS} more rows not logged"}]
        return list(rows)
    except Exception:
        return rows


# ── Writer ────────────────────────────────────────────────────────────────────
def _write(record: dict) -> None:
    if not _ENABLED:
        return
    try:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        _LOG_ROOT.mkdir(parents=True, exist_ok=True)
        f = _LOG_ROOT / f"{day}.jsonl"
        if f.exists() and f.stat().st_size >= _MAX_BYTES:
            f.rename(_LOG_ROOT / f"{day}.{int(time.time())}.jsonl")
        with f.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    except Exception as exc:
        _log.debug("file_log_write_failed", error=str(exc))


def _emit_console(rec: dict) -> None:
    try:
        level  = {"ERROR": "error", "WARNING": "warning"}.get(rec.get("severity", "INFO"), "info")
        fields = {k: v for k, v in rec.items() if k not in ("event", "severity") and v is not None}
        getattr(_console, level)(rec.get("event", "event"), **fields)
    except Exception:
        pass


def log_event(event: str, *, severity: str = "INFO", tool: str = "",
              request=None, response=None, duration_ms=None) -> None:
    """Write one event line to file + console. Never raises."""
    try:
        rec = {
            "timestamp":   datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "event":       event,
            "tool":        tool,
            "request":     _trim(request),
            "response":    _trim(response),
            "severity":    severity,
            "duration_ms": duration_ms,
        }
        _write(rec)
        _emit_console(rec)
    except Exception as exc:
        _log.debug("file_log_event_failed", error=str(exc))


# ── Tool wrapper ──────────────────────────────────────────────────────────────
def _result_payload(result):
    """The payload the MCP returns to the agent/widget (structuredContent), i.e.
    what actually gets displayed. Large record lists are row-capped so a single
    call can't produce a huge line; long strings are trimmed by log_event."""
    sc = getattr(result, "structuredContent", None)
    if not isinstance(sc, dict):
        return None
    out: dict = {}
    for k, v in sc.items():
        out[k] = cap_rows(v) if isinstance(v, list) else v
    return out


def log_tool(name: str):
    """Wrap an async MCP tool handler to log call / result / error. Transparent."""
    def decorator(fn):
        if not _ENABLED:
            return fn

        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            start = time.monotonic()
            log_event("tool_call", tool=name, request=kwargs)
            try:
                result = await fn(*args, **kwargs)
            except Exception as exc:
                dur = round((time.monotonic() - start) * 1000, 1)
                log_event("tool_error", tool=name, request=kwargs,
                          response={"error": True, "message": str(exc), "exc_type": type(exc).__name__},
                          severity="ERROR", duration_ms=dur)
                raise
            dur     = round((time.monotonic() - start) * 1000, 1)
            payload = _result_payload(result)
            sev     = "ERROR" if (isinstance(payload, dict) and payload.get("error")) else "INFO"
            log_event("tool_result", tool=name, request=kwargs, response=payload,
                      severity=sev, duration_ms=dur)
            return result

        return wrapper
    return decorator


def wrap_specs_logging(specs: list[dict]) -> list[dict]:
    """Return TOOL_SPECS with every handler wrapped by log_tool."""
    return [
        {**spec, "handler": log_tool(spec["name"])(spec.get("handler") or spec["func"])}
        for spec in specs
    ]
