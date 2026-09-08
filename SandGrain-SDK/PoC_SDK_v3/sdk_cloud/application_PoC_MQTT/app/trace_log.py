"""trace_log.py

Cloud-side end-to-end traceability (V4 spec, section 3 "Cloud SDK").

Design goals / parity with the device + gateway SDK trace feature:

  * Switches (TRACE_LOG_PATH / TRACE_LOG_DEBUG share the C-side names):
      - TRACE_LOG_PATH   : file sink on/off + destination file (INFO level).
      - TRACE_LOG_MQTT   : MQTT sink on/off. Truthy publishes every trace row to
                           sandgrain/v1/<tid>/cloud_log (mirror of the gateway's
                           gw_log), so TrustBridge-Be can subscribe and ingest
                           cloud-side logs the same way it ingests gw_log. Rides
                           the cloud's existing broker connection; independent of
                           the file sink (either, both, or neither).
      - TRACE_LOG_DEBUG  : adds the debug-level masked `request_data` object to
                           BOTH sinks. No-op unless a sink is enabled. Any value
                           except unset/""/"0"/"false" enables it.
  * One JSON object per line (trace_cloud.jsonl); the cloud_log payload is that
    SAME object, so the wire matches the file and lines up with the
    device/gateway trace_*.jsonl files for machine parsing.

Unlike the C side (which writes its own line), the cloud already logs through
Python `logging` on two loggers:
    sandgrain-poc-cloud   (dispatcher / handlers)
    cyberrock-client      (HTTP client)
So instead of a parallel writer, we attach ONE JSONL handler to those two
loggers. Every existing log call is captured; the per-request identity/scope
envelope is supplied out-of-band via a contextvars context set once per MQTT
message, and structured extras (dt_ms, http_method, error_code, ...) ride in
via the standard logging `extra=` mechanism.

SECURITY: never write unmasked crypto material. `request_data` only appears
when TRACE_LOG_DEBUG is set, and every sensitive element (rw / ek / cw / hrw /
hcw / ...) is masked to first-4 + last-4 by mask()/mask_data() first.
"""
from __future__ import annotations

import contextvars
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# --------------------------------------------------------------------------- #
# Module state (configured once by init_trace()).
# --------------------------------------------------------------------------- #
# _enabled is the union: the JSONL handler attaches (and rows are built) if
# EITHER sink wants them. The two sinks are independently switched:
#     _file_enabled  : TRACE_LOG_PATH set  -> write trace_cloud.jsonl
#     _mqtt_enabled  : TRACE_LOG_MQTT truthy -> publish each row to cloud_log
# TRACE_LOG_DEBUG (shared) adds masked request_data to BOTH sinks.
_enabled: bool = False
_file_enabled: bool = False
_mqtt_enabled: bool = False
_debug: bool = False
_path: Optional[str] = None

# Publisher for the cloud_log MQTT sink. Wired by main.py AFTER the cloud's MQTT
# transport is up (set_cloud_log_publisher), so we piggyback on the existing
# broker connection rather than opening a second one. Signature: fn(topic, body).
_publisher: "Optional[Any]" = None

# Per-thread reentrancy guard: transport.publish() logs on our own trace logger
# when a publish fails, which re-enters emit() on the same thread. The guard
# stops that inner emit from publishing again (infinite recursion), while still
# letting it write to the file.
_reentry = threading.local()

# cloud_log wire settings — mirror gw_log: QoS 0, fire-and-forget telemetry.
_CLOUD_LOG_QOS = 0

_seq_lock = threading.Lock()
_seq_counters: Dict[str, int] = {}

# Per-request trace envelope, propagated across awaits within one asyncio task.
_context: "contextvars.ContextVar[Optional[Dict[str, Any]]]" = contextvars.ContextVar(
    "sg_cloud_trace_ctx", default=None
)

# Logger names this trace attaches to (the two documented cloud sub-layers).
_LOGGERS = ("sandgrain-poc-cloud", "cyberrock-client")

# Context keys that make up the per-request envelope (V4 section 3, info level).
# Field names use this deployment's concrete topology; the V4 spec calls these
# the "edge_node" and the "leaf":
#     gateway_id  == V4 edge_node_id      event_scope/app_seq_scope value
#     device_id   == V4 leaf_id             "gateway" == edge_node, "device" == leaf
_CONTEXT_KEYS = (
    # flow_id correlates every line of ONE auth attempt (cloud-side: threaded
    # across the requestCW/replyRW messages by their shared CyberRock
    # transactionId). Set once per MQTT message by main.py.
    "flow_id",
    "request_originator",
    "gateway_id",
    "event_scope",
    "device_id",
    "app_seq_scope",
    "app_message_seq",
    "action",
)

# Structured extras a caller may attach via logging `extra=`; surfaced verbatim.
_EXTRA_KEYS = (
    "http_method",
    "url",
    "path",
    "http_status",
    "dt_ms",
    "error_code",
    "error_result",
    "additional_info",
    # Per-call span structure: req_id pairs a request line with its response /
    # error line; event = http.request | http.response | http.error | action.end;
    # status = in_progress | success | failure (default "info" for other lines);
    # step names the sub-call; reason/duration_ms add outcome + latency.
    "req_id",
    "step",
    "event",
    "status",
    "reason",
    "duration_ms",
)

# Substrings (case-insensitive) that mark a field as sensitive crypto material.
_SENSITIVE = ("rw", "ek", "cw", "hrw", "hcw", "hrw2", "key", "secret", "token", "password")


def _truthy(value: Optional[str]) -> bool:
    return bool(value) and value.strip().lower() not in ("", "0", "false", "no", "off")


# --------------------------------------------------------------------------- #
# Masking (mirrors the C trace_log_mask rule: first-4 + last-4, else ****).
# --------------------------------------------------------------------------- #
def mask(value: Any) -> Any:
    """Keep first-4 + last-4 chars; anything shorter than 12 becomes ****.

    Real crypto (rw/ek/cw) is 32-64 hex chars, so at least 8 chars stay hidden;
    short secrets never leak whole.
    """
    if value is None:
        return None
    s = str(value)
    if len(s) < 12:
        return "****"
    return f"{s[:4]}...{s[-4:]}"


def _is_sensitive(key: str) -> bool:
    k = key.lower()
    return any(tag in k for tag in _SENSITIVE)


def mask_data(obj: Any) -> Any:
    """Recursively mask sensitive members of a JSON-ish structure by key name."""
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if _is_sensitive(str(k)):
                out[k] = mask(v) if not isinstance(v, (dict, list)) else mask_data(v)
            else:
                out[k] = mask_data(v)
        return out
    if isinstance(obj, list):
        return [mask_data(v) for v in obj]
    return obj


# --------------------------------------------------------------------------- #
# app_message_seq — scoped per app_seq_scope (gateway | device), NOT global.
# Used for gap/duplicate detection only, not as a correlation key (V4).
# --------------------------------------------------------------------------- #
def next_app_seq(scope: str, ident: str) -> int:
    key = f"{scope}:{ident}"
    with _seq_lock:
        n = _seq_counters.get(key, 0) + 1
        _seq_counters[key] = n
        return n


# --------------------------------------------------------------------------- #
# Per-request context.
# --------------------------------------------------------------------------- #
def set_context(**fields: Any) -> None:
    """Replace the per-request trace envelope (call once per MQTT message)."""
    _context.set({k: v for k, v in fields.items() if v is not None})


def bind(**fields: Any) -> None:
    """Merge extra fields into the current envelope (e.g. late action rebinding)."""
    cur = dict(_context.get() or {})
    for k, v in fields.items():
        if v is not None:
            cur[k] = v
    _context.set(cur)


def clear_context() -> None:
    _context.set(None)


def debug_enabled() -> bool:
    return _enabled and _debug


def set_cloud_log_publisher(publisher: Any) -> None:
    """Wire the MQTT publish callable used by the cloud_log sink.

    Called by main.py once the cloud's own MQTT transport is connected, so the
    cloud_log telemetry rides the existing broker connection. `publisher` is
    invoked as publisher(topic, body_dict). No-op effect unless TRACE_LOG_MQTT
    enabled the sink. Safe to call even when tracing is off (just stored)."""
    global _publisher
    _publisher = publisher


# --------------------------------------------------------------------------- #
# The JSONL handler.
# --------------------------------------------------------------------------- #
class _JsonlTraceHandler(logging.Handler):
    def __init__(self, path: str) -> None:
        super().__init__()
        self._path = path
        self._lock_io = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:  # noqa: D401
        try:
            rec: Dict[str, Any] = {
                # ISO 8601 UTC, consistent with the device/gateway trace files.
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "component": record.name,          # logger = sub-layer identity
                "level": record.levelname,
                "message": record.getMessage(),
            }

            # Per-request envelope (identity / scope / sequence / action).
            ctx = _context.get() or {}
            for k in _CONTEXT_KEYS:
                if k in ctx and ctx[k] is not None:
                    rec[k] = ctx[k]

            # Structured extras attached by the caller via logging `extra=`.
            for k in _EXTRA_KEYS:
                if hasattr(record, k):
                    rec[k] = getattr(record, k)

            # Every row carries an outcome key: operations set it explicitly
            # (in_progress on a request line, success/failure on its close);
            # non-operational lines (startup, cache hits, ...) default to "info".
            rec.setdefault("status", "info")

            # Debug-level request_data — masked, and only when the 2nd switch is on.
            if _debug:
                rd = getattr(record, "request_data", None)
                if rd is not None:
                    rec["request_data"] = mask_data(rd)

            # Sink 1 — local JSONL file (trace_cloud.jsonl).
            if _file_enabled and self._path:
                line = json.dumps(rec, ensure_ascii=True, default=str) + "\n"
                with self._lock_io:
                    with open(self._path, "a", encoding="utf-8") as fh:
                        fh.write(line)

            # Sink 2 — cloud_log MQTT topic (mirror of the gateway's gw_log).
            # Publish the SAME row so the wire matches the file exactly, including
            # masked request_data under debug. Route by TID (== device_id); rows
            # with no device context (e.g. startup lines) have no TID, so skip.
            if _mqtt_enabled and _publisher is not None and not getattr(_reentry, "active", False):
                tid = rec.get("device_id")
                if tid:
                    _reentry.active = True
                    try:
                        _publisher(f"sandgrain/v1/{tid}/cloud_log", rec)
                    finally:
                        _reentry.active = False
        except Exception:  # never let tracing break the app
            pass


# --------------------------------------------------------------------------- #
# init / teardown.
# --------------------------------------------------------------------------- #
def init_trace() -> None:
    """Read the env switches and, if enabled, attach the JSONL handler.

    Idempotent-ish: safe to call once at startup. When TRACE_LOG_PATH is unset
    this is a complete no-op, so normal runs are unaffected.
    """
    global _enabled, _file_enabled, _mqtt_enabled, _debug, _path

    _path = os.getenv("TRACE_LOG_PATH") or None
    _file_enabled = _path is not None and _path.strip() != ""
    _mqtt_enabled = _truthy(os.getenv("TRACE_LOG_MQTT"))
    # The handler attaches (and rows get built) if either sink wants them.
    _enabled = _file_enabled or _mqtt_enabled
    _debug = _enabled and _truthy(os.getenv("TRACE_LOG_DEBUG"))

    if not _enabled:
        logging.getLogger("sandgrain-poc-cloud").info(
            "Traceability OFF (TRACE_LOG_PATH and TRACE_LOG_MQTT both unset)"
        )
        return

    handler = _JsonlTraceHandler(_path or "")
    handler.setLevel(logging.DEBUG if _debug else logging.INFO)

    for name in _LOGGERS:
        lg = logging.getLogger(name)
        # Avoid double-attaching if init runs twice.
        if not any(isinstance(h, _JsonlTraceHandler) for h in lg.handlers):
            lg.addHandler(handler)

    sinks = []
    if _file_enabled:
        sinks.append(f"file={_path}")
    if _mqtt_enabled:
        sinks.append("mqtt=sandgrain/v1/<tid>/cloud_log")
    logging.getLogger("sandgrain-poc-cloud").info(
        "Traceability ON (%s) sinks: %s",
        "INFO+DEBUG" if _debug else "INFO",
        ", ".join(sinks),
    )
