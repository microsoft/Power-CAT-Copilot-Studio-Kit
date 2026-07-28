"""ServiceNow tool handlers + _TOOL_SPECS_LIST registry."""
import asyncio
import re
from datetime import datetime, timezone

import httpx
from cachetools import TTLCache
from mcp import types
from mcp.types import PromptMessage, TextContent

from .servicenow_client import (
    CHANGE_FIELDS,
    HR_FIELDS,
    INCIDENT_FIELDS,
    PROBLEM_FIELDS,
    REQUEST_FIELDS,
    REQUEST_ITEM_FIELDS,
    _val,
    servicenow_request,
)
from shared_mcp.logger import get_logger


log = get_logger("sn")


# ── TTL cache (invalidated on write) ──────────────────────────────────────────
# Mirrors the SF pattern: per-entity TTLCache, keyed by "v". Skips for filtered
# reads and for user-scoped queues (pending_approvals stays uncached because the
# in-process cache is shared across all callers — see plan adversarial notes).

_ENTITY_CACHE: dict[str, TTLCache] = {
    "incidents":          TTLCache(maxsize=2, ttl=90),
    "requests":           TTLCache(maxsize=2, ttl=90),
    "change_requests":    TTLCache(maxsize=2, ttl=90),
    "problems":           TTLCache(maxsize=2, ttl=90),
    "hr_cases":           TTLCache(maxsize=2, ttl=90),
    "service_catalog":    TTLCache(maxsize=2, ttl=600),
    "knowledge_articles": TTLCache(maxsize=2, ttl=600),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cache_get(entity: str) -> tuple[list | None, str | None]:
    entry = _ENTITY_CACHE[entity].get("v")
    if entry:
        return entry["items"], entry["at"]
    return None, None


def _cache_set(entity: str, items: list) -> str:
    at = _now_iso()
    _ENTITY_CACHE[entity]["v"] = {"items": items, "at": at}
    return at


def _cache_invalidate(entity: str) -> None:
    _ENTITY_CACHE[entity].pop("v", None)


# ── State + priority normalization ────────────────────────────────────────────
# ServiceNow stores state/priority as numeric codes (e.g., incident.state=1=New).
# Filters using raw display strings ("state=new") will not match. The normalizers
# below translate display strings → codes, accept aliases ("open" → 1,2,3),
# accept comma-separated mixed values, and return a complete SN encoded-query
# fragment ready for append.
#
# When the input is non-empty but completely unrecognized, normalizers return an
# impossible-match fragment so the result is an honest empty list rather than
# silently dropping the filter and returning everything.

_NEVER_MATCH = "sys_id=00000000000000000000000000000000"

_PRIORITY_NAMES = {"critical": "1", "urgent": "1", "high": "2", "medium": "3", "moderate": "3", "low": "4"}
_PRIORITY_VALID = {"1", "2", "3", "4"}

# Per-entity state mappings. Probed live from this PDI's sys_choice table.
_INCIDENT_STATE_DISPLAY = {
    "new": "1", "in progress": "2", "in_progress": "2",
    "on hold": "3", "on_hold": "3",
    "resolved": "6", "closed": "7", "canceled": "8", "cancelled": "8",
}
_INCIDENT_STATE_GROUPS = {"open": "1,2,3", "active": "1,2,3"}
_INCIDENT_STATE_CODES = {"1", "2", "3", "6", "7", "8"}

_CHANGE_STATE_DISPLAY = {
    "new": "-5", "assess": "-4", "authorize": "-3",
    "scheduled": "-2", "implement": "-1", "review": "0",
    "closed": "3", "canceled": "4", "cancelled": "4",
}
_CHANGE_STATE_GROUPS = {"open": "-5,-4,-3,-2,-1,0", "active": "-5,-4,-3,-2,-1,0"}
_CHANGE_STATE_CODES = {"-5", "-4", "-3", "-2", "-1", "0", "3", "4"}

_PROBLEM_STATE_DISPLAY = {
    "new": "101", "assess": "102",
    "root cause analysis": "103", "root_cause_analysis": "103", "rca": "103",
    "fix in progress": "104", "fix_in_progress": "104",
    "resolved": "106", "closed": "107",
}
_PROBLEM_STATE_GROUPS = {"open": "101,102,103,104", "active": "101,102,103,104"}
_PROBLEM_STATE_CODES = {"101", "102", "103", "104", "106", "107"}

_HR_STATE_DISPLAY = {
    "draft": "1", "closed complete": "3", "closed incomplete": "4",
    "cancelled": "7", "canceled": "7",
    "ready": "10", "awaiting approval": "11",
    "work in progress": "18", "in_progress": "18", "in progress": "18",
    "awaiting acceptance": "20", "suspended": "24",
}
_HR_STATE_GROUPS = {"open": "1,10,11,18,20", "active": "1,10,11,18,20"}
_HR_STATE_CODES = {"1", "3", "4", "7", "10", "11", "18", "20", "24"}

# sc_request.request_state uses string keys (e.g., "requested" = Pending Approval)
_REQUEST_STATE_DISPLAY = {
    "pending": "requested", "pending approval": "requested", "requested": "requested",
    "approved": "in_process", "in process": "in_process", "in_process": "in_process",
    "closed complete": "closed_complete", "closed_complete": "closed_complete",
    "closed incomplete": "closed_incomplete", "closed_incomplete": "closed_incomplete",
    "closed rejected": "closed_rejected", "closed_rejected": "closed_rejected",
    "closed cancelled": "closed_cancelled", "closed_cancelled": "closed_cancelled",
    "closed skipped": "closed_skipped", "closed_skipped": "closed_skipped",
}
_REQUEST_STATE_GROUPS = {"open": "requested,in_process", "active": "requested,in_process"}
_REQUEST_STATE_KEYS = set(_REQUEST_STATE_DISPLAY.values())

# Category: display_value=true returns labels; normalize back to sys_choice value column.
_INCIDENT_CATEGORY_DISPLAY_TO_VALUE = {
    "inquiry / help": "inquiry", "inquiry": "inquiry",
    "software": "software", "hardware": "hardware",
    "network": "network", "database": "database",
    "password reset": "password_reset", "password_reset": "password_reset",
}


def _normalize_category(val: str) -> str:
    """Convert display label to sys_choice value for category (text picklist)."""
    if not val:
        return ""
    return _INCIDENT_CATEGORY_DISPLAY_TO_VALUE.get(val.lower(), val.lower())


# Risk: display_value=true returns "High"/"Moderate"/"Low"; normalize to numeric codes.
_RISK_DISPLAY_TO_VALUE = {
    "high": "2", "moderate": "3", "low": "4",
    "2": "2", "3": "3", "4": "4",
}


def _normalize_risk(val: str) -> str:
    """Convert risk display label to numeric code for change_request."""
    if not val:
        return ""
    return _RISK_DISPLAY_TO_VALUE.get(val.strip().lower(), val)


def _normalize_risk_filter(val: str) -> str | None:
    """Filter normalizer: convert risk label/code to SN query fragment."""
    if not val or not val.strip():
        return None
    code = _RISK_DISPLAY_TO_VALUE.get(val.strip().lower(), val.strip())
    if code in ("2", "3", "4"):
        return f"risk={code}"
    return None


def _normalize_state(field: str, val: str, display_map: dict[str, str], groups: dict[str, str],
                     valid_codes: set[str], starts_with_groups: dict[str, str] | None = None) -> str | None:
    """Translate user-facing state value into a SN encoded-query fragment.

    Returns None when input is empty. Returns an impossible-match fragment when
    input is non-empty but unrecognized (honest empty result, not silent
    drop-filter that returns everything).
    """
    if not val or not val.strip():
        return None
    s = val.strip().lower()

    if starts_with_groups and s in starts_with_groups:
        return f"{field}STARTSWITH{starts_with_groups[s]}"
    if s in groups:
        return f"{field}IN{groups[s]}"
    if s in display_map:
        return f"{field}={display_map[s]}"
    if s in valid_codes:
        return f"{field}={s}"

    if "," in s:
        codes: list[str] = []
        for p in s.split(","):
            p = p.strip()
            if p in display_map:
                codes.append(display_map[p])
            elif p in valid_codes:
                codes.append(p)
        codes = list(dict.fromkeys(codes))  # dedup, preserve order
        if len(codes) == 1:
            return f"{field}={codes[0]}"
        if len(codes) > 1:
            return f"{field}IN{','.join(codes)}"

    return _NEVER_MATCH


def _normalize_incident_state(val: str) -> str | None:
    return _normalize_state("state", val, _INCIDENT_STATE_DISPLAY, _INCIDENT_STATE_GROUPS, _INCIDENT_STATE_CODES)


def _normalize_change_state(val: str) -> str | None:
    return _normalize_state("state", val, _CHANGE_STATE_DISPLAY, _CHANGE_STATE_GROUPS, _CHANGE_STATE_CODES)


def _normalize_problem_state(val: str) -> str | None:
    return _normalize_state("state", val, _PROBLEM_STATE_DISPLAY, _PROBLEM_STATE_GROUPS, _PROBLEM_STATE_CODES)


def _normalize_hr_state(val: str) -> str | None:
    return _normalize_state("state", val, _HR_STATE_DISPLAY, _HR_STATE_GROUPS, _HR_STATE_CODES)


def _normalize_request_state(val: str) -> str | None:
    return _normalize_state(
        "request_state", val,
        _REQUEST_STATE_DISPLAY, _REQUEST_STATE_GROUPS, _REQUEST_STATE_KEYS,
        starts_with_groups={"closed": "closed_"},
    )


def _normalize_priority(val: str) -> str | None:
    if not val or not val.strip():
        return None
    nums: list[str] = []
    for p in val.replace(" or ", ",").replace(", ", ",").split(","):
        p = p.strip().lower().lstrip("p")
        p = _PRIORITY_NAMES.get(p, p)
        if p in _PRIORITY_VALID:
            nums.append(p)
    nums = list(dict.fromkeys(nums))
    if not nums:
        return _NEVER_MATCH
    if len(nums) == 1:
        return f"priority={nums[0]}"
    return f"priorityIN{','.join(nums)}"


# ── Entity table schemas (parallel to SF's _ENTITY_SCHEMAS) ───────────────────
# Each column is (api_field, output_key, nullable_to_None_when_empty).
# The list of api_fields drives `sysparm_fields` automatically — one source of truth.
# Filter spec: (field, op) for standard ops, or (field, None, normalizer) for
# custom value translation (state/priority — see normalizers above).

_ENTITY_TABLES: dict[str, dict] = {
    "incident": {
        "table": "incident",
        "default_limit": 5,
        "default_query": "ORDERBYDESCsys_created_on",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("number",            "number",            False),
            ("short_description", "short_description", False),
            ("description",       "description",       False),
            ("state",             "state",             False),
            ("priority",          "priority",          False),
            ("impact",            "impact",            True),
            ("assigned_to",       "assigned_to",       True),
            ("sys_created_on",    "sys_created_on",    False),
            ("category",          "category",          True),
            ("caller_id",         "caller_id",         True),
        ],
        "filters": {
            "short_description": ("short_description", "like"),
            "assigned_to":       ("assigned_to",       "eq"),
            "category":          ("category",          "eq"),
            "caller_id":         ("caller_id",         "eq"),
            "assigned_to_name":  ("assigned_to.name",  "contains"),
            "caller_name":       ("caller_id.name",    "contains"),
            "created_at_from":   ("sys_created_on",    "gte"),
            "created_at_to":     ("sys_created_on",    "lte"),
            "state":             ("state",    None, _normalize_incident_state),
            "priority":          ("priority", None, _normalize_priority),
        },
    },
    "request": {
        "table": "sc_request",
        "default_limit": 5,
        "default_query": "ORDERBYDESCsys_created_on",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("number",            "number",            False),
            ("short_description", "short_description", False),
            ("description",       "description",       False),
            ("request_state",     "request_state",     False),
            ("priority",          "priority",          False),
            ("approval",          "approval",          False),
            ("sys_created_on",    "sys_created_on",    False),
            ("requested_for",     "requested_for",     True),
            ("due_date",          "due_date",          True),
        ],
        "filters": {
            "short_description": ("short_description", "like"),
            "request_state":     ("request_state", None, _normalize_request_state),
            "priority":          ("priority",      None, _normalize_priority),
            "approval":          ("approval",          "eq"),
            "requested_for":     ("requested_for",     "eq"),
            "due_date_from":     ("due_date",          "gte"),
            "due_date_to":       ("due_date",          "lte"),
            "created_at_from":   ("sys_created_on",    "gte"),
            "created_at_to":     ("sys_created_on",    "lte"),
        },
    },
    "problem": {
        "table": "problem",
        "default_limit": 5,
        "default_query": "ORDERBYDESCsys_created_on",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("number",            "number",            False),
            ("short_description", "short_description", False),
            ("description",       "description",       False),
            ("state",             "state",             False),
            ("priority",          "priority",          False),
            ("assigned_to",       "assigned_to",       True),
            ("sys_created_on",    "sys_created_on",    False),
            ("workaround",       "workaround",        True),
        ],
        "filters": {
            "short_description": ("short_description", "like"),
            "state":             ("state",    None, _normalize_problem_state),
            "priority":          ("priority", None, _normalize_priority),
            "assigned_to":       ("assigned_to",       "eq"),
        },
    },
    "knowledge_article": {
        "table": "kb_knowledge",
        "default_limit": 5,
        "default_query": "workflow_state=published^ORDERBYDESCsys_updated_on",
        "columns": [
            ("sys_id",              "sys_id",            False),
            ("number",              "number",            False),
            ("short_description",   "short_description", False),
            ("kb_category",         "category",          True),
            ("author",              "author",            True),
            ("sys_updated_on",      "updated_on",        False),
            ("workflow_state",      "state",             False),
            ("kb_knowledge_base",   "kb_knowledge_base", True),
            ("sys_view_count",      "view_count",        True),
        ],
        # NOTE: sys_view_count exists on standard kb_knowledge tables. If the
        # field is unavailable on a given instance, the SELECT returns null for
        # that field and the filter no-ops — no 400.
        "filters": {
            "short_description": ("short_description", "like"),
            "category":          ("kb_category",       "eq"),
            "author":            ("author",            "eq"),
            "updated_after":     ("sys_updated_on",    "gte"),
            "kb_knowledge_base": ("kb_knowledge_base", "eq"),
            "view_count_min":    ("sys_view_count",    "gte"),
            "view_count_max":    ("sys_view_count",    "lte"),
        },
    },
    "service_catalog": {
        "table": "sc_cat_item",
        "default_limit": 10,
        "default_query": "active=true^ORDERBYname",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("name",              "name",              False),
            ("short_description", "short_description", False),
            ("category",          "category",          True),
            ("price",             "price",             True),
            ("delivery_time",     "delivery_time",     True),
        ],
        "filters": {
            "short_description": ("short_description", "like"),
            "name":              ("name",              "like"),
            "category":          ("category",          "eq"),
            "price_min":         ("price",             "gte"),
            "price_max":         ("price",             "lte"),
        },
    },
    "change_request": {
        "table": "change_request",
        "default_limit": 5,
        "default_query": "ORDERBYDESCsys_created_on",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("number",            "number",            False),
            ("short_description", "short_description", False),
            ("description",       "description",       False),
            ("state",             "state",             False),
            ("priority",          "priority",          False),
            ("risk",              "risk",              False),
            ("category",          "category",          False),
            ("assigned_to",       "assigned_to",       True),
            ("sys_created_on",    "sys_created_on",    False),
            ("start_date",        "planned_start",     True),
            ("end_date",          "planned_end",       True),
        ],
        "filters": {
            "short_description":   ("short_description", "like"),
            "state":               ("state",    None, _normalize_change_state),
            "priority":            ("priority", None, _normalize_priority),
            "risk":                ("risk",    None, _normalize_risk_filter),
            "category":            ("category",          "eq"),
            "assigned_to":         ("assigned_to",       "eq"),
            "planned_start_from":  ("start_date",        "gte"),
            "planned_start_to":    ("start_date",        "lte"),
            "planned_end_from":    ("end_date",          "gte"),
            "planned_end_to":      ("end_date",          "lte"),
            "created_at_from":     ("sys_created_on",    "gte"),
            "created_at_to":       ("sys_created_on",    "lte"),
        },
    },
    "hr_case": {
        "table": "sn_hr_core_case",
        "default_limit": 10,
        "default_query": "ORDERBYDESCsys_created_on",
        "columns": [
            ("sys_id",            "sys_id",            False),
            ("number",            "number",            False),
            ("short_description", "subject",           False),    # widget contract: rename
            ("description",       "description",       False),
            ("state",             "state",             False),
            ("priority",          "priority",          False),
            ("opened_by",         "opened_by",         True),
            ("sys_created_on",    "sys_created_on",    False),
            ("opened_for",        "opened_for",        True),
            ("assigned_to",       "assigned_to",       True),
            ("hr_service",        "hr_service",        True),
        ],
        # NOTE: hr_service requires HR Pro/Enterprise plugin. If instance lacks
        # the plugin, the GET will 400; existing error handler surfaces it.
        "filters": {
            "subject":      ("short_description", "like"),
            "state":        ("state",    None, _normalize_hr_state),
            "priority":     ("priority", None, _normalize_priority),
            "opened_for":   ("opened_for",        "eq"),
            "assigned_to":  ("assigned_to",       "eq"),
            "hr_service":   ("hr_service",        "eq"),
            "created_at_from": ("sys_created_on", "gte"),
            "created_at_to":   ("sys_created_on", "lte"),
        },
    },
}


def _build_sn_query(entity_type: str, params: dict) -> list[str]:
    """Convert {param_name: value} dict into ServiceNow encoded-query fragments
    using the entity's `filters` spec in _ENTITY_TABLES.

    Caller joins returned list with '^' (and prepends/appends as needed).
    Empty/None values skipped. Params not in spec ignored (forward-compat).

    Ops:
      'like'     → FieldLIKEval
      'eq'       → Field=val
      'contains' → FieldCONTAINSval   (dot-walk-safe partial match —
                                       e.g. assigned_to.nameCONTAINSJoe.
                                       Verified live 2026-05-29; works on
                                       polymorphic refs like cmdb_ci.name.)
      'gte'      → Field>=val   (date ISO YYYY-MM-DD literal, or numeric float)
      'lte'      → Field<=val   (same)
    """
    spec = _ENTITY_TABLES.get(entity_type, {}).get("filters", {})
    fragments: list[str] = []
    for pname, val in params.items():
        if val is None or val == "":
            continue
        if pname not in spec:
            continue
        entry = spec[pname]
        # 3-tuple with custom normalizer: normalizer returns complete fragment
        # (handles state/priority value translation; see _normalize_* helpers).
        if len(entry) == 3 and entry[2] is not None:
            frag = entry[2](val)
            if frag:
                fragments.append(frag)
            continue
        field, op = entry[0], entry[1]
        if op == "like":
            fragments.append(f"{field}LIKE{_sn_escape(str(val))}")
        elif op == "eq":
            fragments.append(f"{field}={_sn_escape(str(val))}")
        elif op == "contains":
            fragments.append(f"{field}CONTAINS{_sn_escape(str(val))}")
        elif op in ("gte", "lte"):
            sym = ">=" if op == "gte" else "<="
            val_str = str(val).strip()
            # SN accepts ISO date / datetime literals in display-value mode
            if re.match(r"^\d{4}-\d{2}-\d{2}", val_str):
                fragments.append(f"{field}{sym}{val_str}")
                continue
            # Numeric fallback (price, view_count, etc.)
            try:
                num = float(val_str)
            except (TypeError, ValueError):
                continue
            fragments.append(f"{field}{sym}{num}")
    return fragments


def _map_record(r: dict, columns: list[tuple]) -> dict:
    """Map a ServiceNow record dict through column descriptors → flat dict."""
    result: dict = {}
    for api_field, key, nullable in columns:
        val = _val(r.get(api_field, ""))
        if nullable and not val:
            val = None
        result[key] = val
    return result


async def _fetch_table(entity_type: str, limit: int | None = None, query: str | None = None) -> list[dict]:
    """Generic list-fetch — drives all entity list helpers below.
    Derives sysparm_fields from the column spec (single source of truth)."""
    cfg = _ENTITY_TABLES[entity_type]
    api_fields = ",".join(c[0] for c in cfg["columns"])
    actual_limit = limit if limit is not None else cfg["default_limit"]
    actual_query = query if query is not None else cfg["default_query"]
    resp = await servicenow_request(
        "GET", f"/api/now/table/{cfg['table']}",
        params={"sysparm_limit": actual_limit, "sysparm_query": actual_query,
                "sysparm_fields": api_fields, "sysparm_display_value": "true"},
    )
    return [_map_record(r, cfg["columns"]) for r in resp.json().get("result", [])]


def _error_result(message: str) -> types.CallToolResult:
    # isError=True is the canonical MCP flag the widget bridge checks
    # (McpBridge.tsx throws ToolSemanticError on isError). Without it,
    # widget-initiated calls treated _error_result as success and silently
    # toasted "created" while the record was never written.
    return types.CallToolResult(
        isError=True,
        content=[types.TextContent(type="text", text=message)],
        structuredContent={"error": True, "message": message},
    )


def _sn_escape(value: str) -> str:
    """Escape a value embedded in a ServiceNow encoded query — removes ^ and = injectors."""
    return value.replace("^", "").replace("=", "")


# ── Internal list helpers (used by write tools to return refreshed views) ─────
# All driven by _ENTITY_TABLES / _fetch_table above. Add new entities by extending the dict.

async def _fetch_incidents(limit: int = 5) -> list: return await _fetch_table("incident", limit=limit)
async def _fetch_requests(limit: int = 5)  -> list: return await _fetch_table("request",  limit=limit)
async def _fetch_problems(limit: int = 5)  -> list: return await _fetch_table("problem",  limit=limit)
async def _fetch_hr_cases(limit: int = 10) -> list: return await _fetch_table("hr_case",  limit=limit)


async def _text_search(table: str, query: str, fields: str, limit: int, fallback_query: str) -> list:
    """Try sysparm_text (full-text) first; fall back to explicit LIKE query if empty or error.
    Structurally different from _fetch_table — kept as-is."""
    try:
        resp = await servicenow_request(
            "GET", f"/api/now/table/{table}",
            params={"sysparm_text": query, "sysparm_limit": limit,
                    "sysparm_fields": fields, "sysparm_display_value": "true"},
        )
        records = resp.json().get("result", [])
        if records:
            return records
    except Exception:
        pass
    resp = await servicenow_request(
        "GET", f"/api/now/table/{table}",
        params={"sysparm_query": fallback_query, "sysparm_limit": limit,
                "sysparm_fields": fields, "sysparm_display_value": "true"},
    )
    return resp.json().get("result", [])


async def _fetch_approvals(limit: int = 10) -> list:
    resp = await servicenow_request(
        "GET", "/api/now/table/sysapproval_approver",
        params={"sysparm_limit": limit,
                "sysparm_query": "state=requested^ORDERBYDESCsys_created_on",
                "sysparm_fields": "sys_id,approver,sysapproval,state,due_date,sys_created_on,sysapproval.sys_class_name,sysapproval.number,sysapproval.short_description",
                "sysparm_display_value": "true"},
    )
    return [
        {"sys_id": _val(r.get("sys_id")), "approver": _val(r.get("approver")),
         "document": _val(r.get("sysapproval")),
         "document_type": _val(r.get("sysapproval.sys_class_name", "")) or None,
         "document_number": _val(r.get("sysapproval.number", "")) or None,
         "short_description": _val(r.get("sysapproval.short_description", "")) or None,
         "state": _val(r.get("state")),
         "due_date": _val(r.get("due_date")), "created_on": _val(r.get("sys_created_on"))}
        for r in resp.json().get("result", [])
    ]


# ── FK name resolution (SF pattern: single-LIKE fold + sys_id short-circuit + TTL cache) ──
# Mirrors sf-mcp-copilot/_resolve_account. One ServiceNow query per happy-path
# resolve. Sys_id short-circuit skips the query when input is already a 32-char hex.
# Hit cache: 5 min. Miss cache: 30s (avoids hammering on typos).

_SYS_ID_RE = re.compile(r"^[a-f0-9]{32}$", re.IGNORECASE)
_RESOLVE_HIT_CACHE: TTLCache = TTLCache(maxsize=512, ttl=300)
_RESOLVE_MISS_CACHE: TTLCache = TTLCache(maxsize=512, ttl=30)


def _is_sys_id(value: str) -> bool:
    return bool(value) and bool(_SYS_ID_RE.match(value))


def _resolve_cache_get(table: str, q: str) -> tuple[bool, str | None]:
    """Returns (cached, sys_id). cached=True with sys_id=None means cached miss."""
    key = (table, q.strip().lower())
    if key in _RESOLVE_HIT_CACHE:
        return True, _RESOLVE_HIT_CACHE[key]
    if key in _RESOLVE_MISS_CACHE:
        return True, None
    return False, None


def _resolve_cache_set(table: str, q: str, sys_id: str | None) -> None:
    key = (table, q.strip().lower())
    if sys_id:
        _RESOLVE_HIT_CACHE[key] = sys_id
    else:
        _RESOLVE_MISS_CACHE[key] = True


def _sn_like_escape(value: str) -> str:
    """Strip ServiceNow encoded-query separators from a LIKE term."""
    return value.replace("^", "").replace("=", "")


async def _resolve_user(name: str) -> tuple[str | None, list[dict]]:
    """Find sys_user.sys_id from name / user_name / email. Returns
    (sys_id, []) on exact match, (None, candidates) otherwise.

    Cost: 1 SN query on happy path (LIKE OR'd across 3 fields, LIMIT 6,
    field projection). Falls back to 5 most-recently-created users on no
    fuzzy hits.
    """
    if not name:
        return None, []
    if _is_sys_id(name):
        return name, []
    cached, cached_id = _resolve_cache_get("sys_user", name)
    if cached:
        return cached_id, []

    q = _sn_like_escape(name)
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sys_user",
            params={
                "sysparm_query": f"nameLIKE{q}^ORuser_nameLIKE{q}^ORemailLIKE{q}",
                "sysparm_limit": 6,
                "sysparm_fields": "sys_id,name,user_name,email",
            },
        )
        rows = resp.json().get("result", [])
    except Exception as exc:
        log.warning("_resolve_user_query_failed", name=name, error=str(exc))
        return None, []

    lname = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").strip().lower() == lname or \
           (r.get("user_name") or "").strip().lower() == lname or \
           (r.get("email") or "").strip().lower() == lname:
            sys_id = r.get("sys_id", "")
            _resolve_cache_set("sys_user", name, sys_id)
            return sys_id, []

    # No exact match. If LIKE returned exactly one candidate, that's
    # unambiguous — auto-pick. Handles "Lucius" → "Lucius Bagnoli".
    if len(rows) == 1:
        sys_id = rows[0].get("sys_id", "")
        _resolve_cache_set("sys_user", name, sys_id)
        return sys_id, []

    if rows:
        _resolve_cache_set("sys_user", name, None)
        return None, [
            {"sys_id": r.get("sys_id", ""), "name": r.get("name", ""),
             "user_name": r.get("user_name", ""), "email": r.get("email", "")}
            for r in rows[:5]
        ]

    # No fuzzy hits — recent fallback
    try:
        recent_resp = await servicenow_request(
            "GET", "/api/now/table/sys_user",
            params={
                "sysparm_query": "ORDERBYDESCsys_created_on",
                "sysparm_limit": 5,
                "sysparm_fields": "sys_id,name,user_name,email",
            },
        )
        recent = recent_resp.json().get("result", [])
    except Exception:
        recent = []
    _resolve_cache_set("sys_user", name, None)
    return None, [
        {"sys_id": r.get("sys_id", ""), "name": r.get("name", ""),
         "user_name": r.get("user_name", ""), "email": r.get("email", "")}
        for r in recent
    ]


async def _resolve_users_batched(names: dict[str, str]) -> dict[str, tuple[str | None, list[dict]]]:
    """Batched user lookup for tools with multiple sys_user FKs (e.g. create_hr_case).

    Strategy: collapse N inputs into a single OR'd LIKE query against sys_user,
    then bind each result row back to whichever input it matches exactly.
    Sys_id short-circuit and TTL cache apply per-input.
    """
    if not names:
        return {}
    out: dict[str, tuple[str | None, list[dict]]] = {}
    to_query: dict[str, str] = {}
    for field, name in names.items():
        if not name:
            continue
        if _is_sys_id(name):
            out[field] = (name, [])
            continue
        cached, cached_id = _resolve_cache_get("sys_user", name)
        if cached:
            out[field] = (cached_id, [])
        else:
            to_query[field] = name

    if not to_query:
        return out

    clauses = []
    for nm in to_query.values():
        q = _sn_like_escape(nm)
        clauses.append(f"nameLIKE{q}^ORuser_nameLIKE{q}^ORemailLIKE{q}")
    sysparm_query = "^OR".join(clauses)

    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sys_user",
            params={
                "sysparm_query": sysparm_query,
                "sysparm_limit": 6 * len(to_query),
                "sysparm_fields": "sys_id,name,user_name,email",
            },
        )
        rows = resp.json().get("result", [])
    except Exception as exc:
        log.warning("_resolve_users_batched_query_failed", fields=list(to_query.keys()), error=str(exc))
        for field in to_query:
            out[field] = (None, [])
        return out

    for field, nm in to_query.items():
        lname = nm.strip().lower()
        matched = None
        for r in rows:
            if (r.get("name") or "").strip().lower() == lname or \
               (r.get("user_name") or "").strip().lower() == lname or \
               (r.get("email") or "").strip().lower() == lname:
                matched = r
                break
        if matched:
            sys_id = matched.get("sys_id", "")
            _resolve_cache_set("sys_user", nm, sys_id)
            out[field] = (sys_id, [])
        else:
            candidates = [
                r for r in rows
                if nm.lower() in (r.get("name") or "").lower()
                or nm.lower() in (r.get("user_name") or "").lower()
                or nm.lower() in (r.get("email") or "").lower()
            ]
            # Single LIKE candidate → auto-pick (matches _resolve_user policy).
            if len(candidates) == 1:
                sys_id = candidates[0].get("sys_id", "")
                _resolve_cache_set("sys_user", nm, sys_id)
                out[field] = (sys_id, [])
            else:
                _resolve_cache_set("sys_user", nm, None)
                out[field] = (None, [
                    {"sys_id": r.get("sys_id", ""), "name": r.get("name", ""),
                     "user_name": r.get("user_name", ""), "email": r.get("email", "")}
                    for r in candidates[:5]
                ])

    return out


async def _resolve_hr_service(name: str) -> tuple[str | None, list[dict]]:
    """Find sn_hr_core_service.sys_id from a service name. Same single-LIKE
    fold pattern as _resolve_user, single field (name)."""
    if not name:
        return None, []
    if _is_sys_id(name):
        return name, []
    cached, cached_id = _resolve_cache_get("sn_hr_core_service", name)
    if cached:
        return cached_id, []

    q = _sn_like_escape(name)
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sn_hr_core_service",
            params={
                "sysparm_query": f"nameLIKE{q}",
                "sysparm_limit": 6,
                "sysparm_fields": "sys_id,name",
            },
        )
        rows = resp.json().get("result", [])
    except Exception as exc:
        log.warning("_resolve_hr_service_query_failed", name=name, error=str(exc))
        return None, []

    lname = name.strip().lower()
    for r in rows:
        if (r.get("name") or "").strip().lower() == lname:
            sys_id = r.get("sys_id", "")
            _resolve_cache_set("sn_hr_core_service", name, sys_id)
            return sys_id, []

    # No exact match. If LIKE returned exactly one candidate, auto-pick.
    if len(rows) == 1:
        sys_id = rows[0].get("sys_id", "")
        _resolve_cache_set("sn_hr_core_service", name, sys_id)
        return sys_id, []

    if rows:
        _resolve_cache_set("sn_hr_core_service", name, None)
        return None, [{"sys_id": r.get("sys_id", ""), "name": r.get("name", "")} for r in rows[:5]]

    try:
        recent_resp = await servicenow_request(
            "GET", "/api/now/table/sn_hr_core_service",
            params={
                "sysparm_query": "ORDERBYDESCsys_created_on",
                "sysparm_limit": 5,
                "sysparm_fields": "sys_id,name",
            },
        )
        recent = recent_resp.json().get("result", [])
    except Exception:
        recent = []
    _resolve_cache_set("sn_hr_core_service", name, None)
    return None, [{"sys_id": r.get("sys_id", ""), "name": r.get("name", "")} for r in recent]


def _user_not_found_msg(name: str, suggestions: list[dict]) -> str:
    msg = f"User '{name}' not found."
    if suggestions:
        names = [s.get("name") or s.get("user_name") or s.get("email") or "" for s in suggestions]
        names = [n for n in names if n]
        if names:
            msg += f" Did you mean: {', '.join(names[:5])}?"
    return msg


def _hr_service_not_found_msg(name: str, suggestions: list[dict]) -> str:
    msg = f"HR service '{name}' not found."
    if suggestions:
        names = [s.get("name", "") for s in suggestions if s.get("name")]
        if names:
            msg += f" Did you mean: {', '.join(names[:5])}?"
    return msg


# ── FK alert helpers (no top-level isError → no Copilot retry; widget reads
# ── structuredContent.type='alert' to render persistent suggestion toast)
# ── Mirrors the SF `_account_not_found_alert` pattern. See
# ── Project-Theory/lob-mcp-apps/fk-alert-pattern-playbook.md for rationale.

def _user_not_found_alert(name: str, suggestions: list[dict], field: str = "assigned_to_name") -> types.CallToolResult:
    """Single-FK alert when a user name can't be resolved to sys_id.
    `field` identifies which input the widget should highlight (assigned_to_name,
    caller_name, requested_for_name, etc.)."""
    msg = _user_not_found_msg(name, suggestions)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,          # widget-facing flag (NOT the top-level
                                      # CallToolResult.isError that triggers
                                      # Copilot's planner-side retry)
            "title": f"User '{name}' not found",
            "message": msg,
            "suggestions": [
                s.get("name") or s.get("user_name") or s.get("email") or ""
                for s in suggestions if (s.get("name") or s.get("user_name") or s.get("email"))
            ][:5],
            "field": field,
        },
    )


def _multi_fk_not_found_alert(failures: list[dict]) -> types.CallToolResult:
    """Combined alert when multiple FK lookups fail in the same call (e.g.
    sn__create_incident with both assigned_to_name AND caller_name unresolved).
    `failures` is a list of {field, name, suggestions, kind} where kind is
    'user' or 'hr_service'. Widget renders one toast listing all failures."""
    lines: list[str] = []
    for f in failures:
        kind = f.get("kind", "user")
        if kind == "hr_service":
            lines.append(_hr_service_not_found_msg(f["name"], f.get("suggestions", [])))
        else:
            lines.append(_user_not_found_msg(f["name"], f.get("suggestions", [])))
    msg = "\n\n".join(lines)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,
            "title": f"{len(failures)} lookup(s) didn't resolve",
            "message": msg,
            "failures": [
                {
                    "field": f.get("field", ""),
                    "name": f["name"],
                    "kind": f.get("kind", "user"),
                    "suggestions": [
                        s.get("name") or s.get("user_name") or s.get("email") or ""
                        for s in f.get("suggestions", [])
                        if (s.get("name") or s.get("user_name") or s.get("email"))
                    ][:5],
                }
                for f in failures
            ],
        },
    )


# ── FK lookup tools (enable agent's edit-by-FK chain) ──────────────────────────
# Wrappers exposing the resolver helpers as agent-callable tools. Used when
# the agent needs a sys_id BEFORE calling a filter tool (e.g. "show me
# incidents assigned to Joe" → sn__get_users(name="Joe") → sys_id →
# sn__get_incidents(assigned_to=<sys_id>)).

async def sn__get_users(name: str = "", limit: int = 10) -> types.CallToolResult:
    if not name:
        return _error_result("Provide a name, user_name, or email to search.")
    capped = max(1, min(int(limit) if limit else 10, 25))
    q = _sn_like_escape(name)
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sys_user",
            params={
                "sysparm_query": f"nameLIKE{q}^ORuser_nameLIKE{q}^ORemailLIKE{q}",
                "sysparm_limit": capped,
                "sysparm_fields": "sys_id,name,user_name,email",
            },
        )
        rows = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error searching users: {e}")
    items = [
        {"sys_id": r.get("sys_id", ""), "name": r.get("name", ""),
         "user_name": r.get("user_name", ""), "email": r.get("email", "")}
        for r in rows
    ]
    if not items:
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"No users found matching '{name}'.")],
            structuredContent={"type": "users", "total": 0, "items": [], "_query": name},
        )
    summary = "\n".join(f"  - {i['name'] or i['user_name'] or i['email']}  (sys_id: {i['sys_id']})" for i in items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"{len(items)} user(s) matching '{name}':\n{summary}")],
        structuredContent={"type": "users", "total": len(items), "items": items, "_query": name},
    )


async def sn__get_hr_services(name: str = "", limit: int = 10) -> types.CallToolResult:
    if not name:
        return _error_result("Provide a service name to search.")
    capped = max(1, min(int(limit) if limit else 10, 25))
    q = _sn_like_escape(name)
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sn_hr_core_service",
            params={
                "sysparm_query": f"nameLIKE{q}",
                "sysparm_limit": capped,
                "sysparm_fields": "sys_id,name",
            },
        )
        rows = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error searching HR services: {e}")
    items = [{"sys_id": r.get("sys_id", ""), "name": r.get("name", "")} for r in rows]
    if not items:
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"No HR services found matching '{name}'.")],
            structuredContent={"type": "hr_services", "total": 0, "items": [], "_query": name},
        )
    summary = "\n".join(f"  - {i['name']}  (sys_id: {i['sys_id']})" for i in items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"{len(items)} HR service(s) matching '{name}':\n{summary}")],
        structuredContent={"type": "hr_services", "total": len(items), "items": items, "_query": name},
    )


# ── Read tools ────────────────────────────────────────────────────────────────


async def sn__get_incidents(limit: int = 5, number: str = "", query: str = "", action: str = "", state: str = "", priority: str = "", sys_id: str = "", short_description: str = "", assigned_to: str = "", assigned_to_name: str = "", category: str = "", caller_id: str = "", caller_name: str = "", created_at_from: str = "", created_at_to: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id or number:
        if sys_id:
            lookup_query = f"sys_id={sys_id}"
            label = sys_id
        else:
            num = number.strip().upper()
            lookup_query = f"number={num}"
            label = num
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/incident",
                params={"sysparm_query": lookup_query, "sysparm_limit": 1,
                        "sysparm_fields": INCIDENT_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up incident {label}: {e}")
        if not records:
            return _error_result(f"Incident {label} not found.")
        r = records[0]
        if action == "resolve":
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Opening resolve form for {_val(r.get('number'))}.")],
                structuredContent={"type": "form", "entity": "incident", "mode": "resolve",
                                   "recordId": _val(r.get("sys_id")),
                                   "number": _val(r.get("number")),
                                   "short_description": _val(r.get("short_description", "")),
                                   "description": _val(r.get("description", "")),
                                   "priority": _val(r.get("priority", "")),
                                   "state": _val(r.get("state", "")),
                                   "assigned_to": _val(r.get("assigned_to", "")),
                                   "category": _val(r.get("category", "")),
                                   "prefill": {"close_code": "Solution provided", "close_notes": ""}},
            )
        if action == "edit":
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Opening edit form for {_val(r.get('number'))}.")],
                structuredContent={"type": "form", "entity": "incident", "mode": "edit",
                                   "recordId": _val(r.get("sys_id")),
                                   "prefill": {"short_description": _val(r.get("short_description", "")),
                                               "description": _val(r.get("description", "")),
                                               "priority": _val(r.get("priority", "3")),
                                               "state": _val(r.get("state", "")),
                                               "category": _normalize_category(_val(r.get("category", ""))),
                                               "impact": _val(r.get("impact", "")),
                                               "assigned_to": _val(r.get("assigned_to", "")),
                                               "caller_id": _val(r.get("caller_id", ""))}},
            )
        # Default: return list-of-one in the standard list shape (matches SF pattern).
        # The LLM must pass action="edit" to open the edit form.
        item = {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
                "short_description": _val(r.get("short_description")),
                "description": _val(r.get("description", "")),
                "state": _val(r.get("state")), "priority": _val(r.get("priority")),
                "assigned_to": _val(r.get("assigned_to")) or None,
                "category": _normalize_category(_val(r.get("category", ""))) or None,
                "caller_id": _val(r.get("caller_id", "")) or None,
                "sys_created_on": _val(r.get("sys_created_on"))}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Incident {label} retrieved. Widget below ↓")],
            structuredContent={"type": "incidents", "total": 1, "incidents": [item],
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )
    schema_fragments = _build_sn_query("incident", {
        "short_description": short_description, "assigned_to": assigned_to,
        "assigned_to_name": assigned_to_name,
        "category": category, "caller_id": caller_id, "caller_name": caller_name,
        "created_at_from": created_at_from, "created_at_to": created_at_to,
        "state": state, "priority": priority,
    })
    has_filters = bool(query or schema_fragments) or limit != 5
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("incidents")
        if cached_items is not None:
            summary = f"{len(cached_items)} incident(s) retrieved (cached). Widget below ↓" if cached_items else "No incidents found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "incidents", "total": len(cached_items), "incidents": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    if query:
        try:
            text_clause = f"short_descriptionLIKE{query}^ORdescriptionLIKE{query}"
            full_query = f"{schema_clause}^{text_clause}^ORDERBYDESCsys_created_on" if schema_clause else f"{text_clause}^ORDERBYDESCsys_created_on"
            records = await _text_search(
                "incident", query, INCIDENT_FIELDS, limit, full_query,
            )
        except Exception as e:
            return _error_result(f"Error searching incidents: {e}")
    else:
        try:
            base_query = f"{schema_clause}^ORDERBYDESCsys_created_on" if schema_clause else "ORDERBYDESCsys_created_on"
            resp = await servicenow_request(
                "GET", "/api/now/table/incident",
                params={"sysparm_limit": limit, "sysparm_query": base_query,
                        "sysparm_fields": INCIDENT_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except httpx.HTTPStatusError as e:
            return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
        except Exception as e:
            return _error_result(f"Error fetching incidents: {e}")
    incidents = [
        {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
         "short_description": _val(r.get("short_description")),
         "description": _val(r.get("description", "")),
         "state": _val(r.get("state")), "priority": _val(r.get("priority")),
         "impact": _val(r.get("impact", "")) or None,
         "assigned_to": _val(r.get("assigned_to")) or None,
         "category": _normalize_category(_val(r.get("category", ""))) or None,
         "caller_id": _val(r.get("caller_id", "")) or None,
         "sys_created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    cached_at = _cache_set("incidents", incidents) if use_cache else _now_iso()
    structured = {"type": "incidents", "total": len(incidents), "incidents": incidents,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No incidents found." if not incidents else f"{len(incidents)} incident(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_requests(limit: int = 5, number: str = "", query: str = "", action: str = "", sys_id: str = "", short_description: str = "", request_state: str = "", priority: str = "", approval: str = "", requested_for: str = "", due_date_from: str = "", due_date_to: str = "", created_at_from: str = "", created_at_to: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id or number:
        if sys_id:
            lookup_query = f"sys_id={sys_id}"
            label = sys_id
        else:
            num = number.strip().upper()
            lookup_query = f"number={num}"
            label = num
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/sc_request",
                params={"sysparm_query": lookup_query, "sysparm_limit": 1,
                        "sysparm_fields": REQUEST_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up request {label}: {e}")
        if not records:
            return _error_result(f"Request {label} not found.")
        r = records[0]
        if action == "edit":
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Opening edit form for {_val(r.get('number'))}.")],
                structuredContent={"type": "form", "entity": "request", "mode": "edit",
                                   "recordId": _val(r.get("sys_id")),
                                   "prefill": {"short_description": _val(r.get("short_description", "")),
                                               "description": _val(r.get("description", "")),
                                               "priority": _val(r.get("priority", "3")),
                                               "approval": _val(r.get("approval", "")),
                                               "request_state": _val(r.get("request_state", "")),
                                               "due_date": _val(r.get("due_date", "")),
                                               "requested_for": _val(r.get("requested_for", ""))}},
            )
        item = {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
                "short_description": _val(r.get("short_description")),
                "description": _val(r.get("description", "")),
                "request_state": _val(r.get("request_state")),
                "priority": _val(r.get("priority")),
                "approval": _val(r.get("approval", "")),
                "requested_for": _val(r.get("requested_for")) or None,
                "due_date": _val(r.get("due_date", "")) or None,
                "sys_created_on": _val(r.get("sys_created_on"))}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Request {label} retrieved. Widget below ↓")],
            structuredContent={"type": "requests", "total": 1, "requests": [item],
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )
    schema_fragments = _build_sn_query("request", {
        "short_description": short_description, "request_state": request_state,
        "priority": priority, "approval": approval, "requested_for": requested_for,
        "due_date_from": due_date_from, "due_date_to": due_date_to,
        "created_at_from": created_at_from, "created_at_to": created_at_to,
    })
    has_filters = bool(query or schema_fragments) or limit != 5
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("requests")
        if cached_items is not None:
            summary = f"{len(cached_items)} request(s) retrieved (cached). Widget below ↓" if cached_items else "No requests found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "requests", "total": len(cached_items), "requests": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    if query:
        try:
            text_clause = f"short_descriptionLIKE{query}^ORdescriptionLIKE{query}"
            full_query = f"{schema_clause}^{text_clause}^ORDERBYDESCsys_created_on" if schema_clause else f"{text_clause}^ORDERBYDESCsys_created_on"
            records = await _text_search(
                "sc_request", query, REQUEST_FIELDS, limit, full_query,
            )
        except Exception as e:
            return _error_result(f"Error searching requests: {e}")
    else:
        try:
            base_query = f"{schema_clause}^ORDERBYDESCsys_created_on" if schema_clause else "ORDERBYDESCsys_created_on"
            resp = await servicenow_request(
                "GET", "/api/now/table/sc_request",
                params={"sysparm_limit": limit, "sysparm_query": base_query,
                        "sysparm_fields": REQUEST_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except httpx.HTTPStatusError as e:
            return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
        except Exception as e:
            return _error_result(f"Error fetching requests: {e}")
    requests_list = [
        {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
         "short_description": _val(r.get("short_description")),
         "description": _val(r.get("description", "")),
         "request_state": _val(r.get("request_state")), "priority": _val(r.get("priority")),
         "approval": _val(r.get("approval")),
         "requested_for": _val(r.get("requested_for", "")) or None,
         "due_date": _val(r.get("due_date", "")) or None,
         "sys_created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    cached_at = _cache_set("requests", requests_list) if use_cache else _now_iso()
    structured = {"type": "requests", "total": len(requests_list), "requests": requests_list,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No requests found." if not requests_list else f"{len(requests_list)} request(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_request_items(request_sys_id: str) -> types.CallToolResult:
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sc_req_item",
            params={"sysparm_query": f"request={request_sys_id}",
                    "sysparm_fields": REQUEST_ITEM_FIELDS, "sysparm_display_value": "true"},
        )
        records = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching request items: {e}")

    items = [
        {"sys_id": r.get("sys_id"), "number": r.get("number"),
         "short_description": r.get("short_description"), "state": r.get("state"),
         "stage": r.get("stage"), "quantity": r.get("quantity"), "price": r.get("price"),
         "cat_item": _val(r.get("cat_item"))}
        for r in records
    ]
    structured = {"type": "request_items", "request_sys_id": request_sys_id,
                  "total": len(items), "items": items}
    summary = f"No request items found for request {request_sys_id}." if not items else f"{len(items)} request item(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_change_requests(limit: int = 5, number: str = "", query: str = "", action: str = "", sys_id: str = "", short_description: str = "", state: str = "", priority: str = "", risk: str = "", category: str = "", assigned_to: str = "", planned_start_from: str = "", planned_start_to: str = "", planned_end_from: str = "", planned_end_to: str = "", created_at_from: str = "", created_at_to: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id or number:
        if sys_id:
            lookup_query = f"sys_id={sys_id}"
            label = sys_id
        else:
            num = number.strip().upper()
            lookup_query = f"number={num}"
            label = num
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/change_request",
                params={"sysparm_query": lookup_query, "sysparm_limit": 1,
                        "sysparm_fields": CHANGE_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up change request {label}: {e}")
        if not records:
            return _error_result(f"Change request {label} not found.")
        r = records[0]
        if action == "edit":
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Opening edit form for {_val(r.get('number'))}.")],
                structuredContent={"type": "form", "entity": "change_request", "mode": "edit",
                                   "recordId": _val(r.get("sys_id")),
                                   "prefill": {"short_description": _val(r.get("short_description", "")),
                                               "description": _val(r.get("description", "")),
                                               "category": _val(r.get("category", "")),
                                               "type": (_val(r.get("type", "")) or "normal").lower(),
                                               "risk": _normalize_risk(_val(r.get("risk", "4"))),
                                               "priority": _val(r.get("priority", "3")),
                                               "state": _val(r.get("state", "")),
                                               "planned_start_date": _val(r.get("start_date", "")),
                                               "planned_end_date": _val(r.get("end_date", "")),
                                               "assigned_to": _val(r.get("assigned_to", ""))}},
            )
        item = {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
                "short_description": _val(r.get("short_description")),
                "state": _val(r.get("state")), "priority": _val(r.get("priority")),
                "risk": _normalize_risk(_val(r.get("risk", ""))),
                "category": _val(r.get("category", "")),
                "type": _val(r.get("type", "")).lower(),
                "assigned_to": _val(r.get("assigned_to")) or None,
                "sys_created_on": _val(r.get("sys_created_on")),
                "planned_start": _val(r.get("start_date", "")) or None,
                "planned_end": _val(r.get("end_date", "")) or None}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Change {label} retrieved. Widget below ↓")],
            structuredContent={"type": "change_requests", "total": 1, "items": [item],
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )
    schema_fragments = _build_sn_query("change_request", {
        "short_description": short_description, "state": state, "priority": priority,
        "risk": risk, "category": category, "assigned_to": assigned_to,
        "planned_start_from": planned_start_from, "planned_start_to": planned_start_to,
        "planned_end_from": planned_end_from, "planned_end_to": planned_end_to,
        "created_at_from": created_at_from, "created_at_to": created_at_to,
    })
    has_filters = bool(query or schema_fragments) or limit != 5
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("change_requests")
        if cached_items is not None:
            summary = f"{len(cached_items)} change request(s) retrieved (cached). Widget below ↓" if cached_items else "No change requests found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "change_requests", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    if query:
        try:
            text_clause = f"short_descriptionLIKE{query}^ORdescriptionLIKE{query}"
            full_query = f"{schema_clause}^{text_clause}^ORDERBYDESCsys_created_on" if schema_clause else f"{text_clause}^ORDERBYDESCsys_created_on"
            records = await _text_search(
                "change_request", query, CHANGE_FIELDS, limit, full_query,
            )
        except Exception as e:
            return _error_result(f"Error searching change requests: {e}")
    else:
        try:
            base_query = f"{schema_clause}^ORDERBYDESCsys_created_on" if schema_clause else "ORDERBYDESCsys_created_on"
            resp = await servicenow_request(
                "GET", "/api/now/table/change_request",
                params={"sysparm_limit": limit, "sysparm_query": base_query,
                        "sysparm_fields": CHANGE_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except httpx.HTTPStatusError as e:
            return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
        except Exception as e:
            return _error_result(f"Error fetching change requests: {e}")
    items = [
        {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
         "short_description": _val(r.get("short_description")),
         "description": _val(r.get("description", "")),
         "state": _val(r.get("state")),
         "priority": _val(r.get("priority")), "risk": _normalize_risk(_val(r.get("risk"))),
         "category": _val(r.get("category")), "type": _val(r.get("type", "")).lower(),
         "assigned_to": _val(r.get("assigned_to")) or None,
         "planned_start": _val(r.get("start_date", "")) or None,
         "planned_end":   _val(r.get("end_date", "")) or None,
         "sys_created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    cached_at = _cache_set("change_requests", items) if use_cache else _now_iso()
    structured = {"type": "change_requests", "total": len(items), "items": items,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No change requests found." if not items else f"{len(items)} change request(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_problems(limit: int = 5, number: str = "", query: str = "", action: str = "", sys_id: str = "", short_description: str = "", state: str = "", priority: str = "", assigned_to: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id or number:
        if sys_id:
            lookup_query = f"sys_id={sys_id}"
            label = sys_id
        else:
            num = number.strip().upper()
            lookup_query = f"number={num}"
            label = num
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/problem",
                params={"sysparm_query": lookup_query, "sysparm_limit": 1,
                        "sysparm_fields": PROBLEM_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up problem {label}: {e}")
        if not records:
            return _error_result(f"Problem {label} not found.")
        r = records[0]
        if action == "edit":
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Opening edit form for {_val(r.get('number'))}.")],
                structuredContent={"type": "form", "entity": "problem", "mode": "edit",
                                   "recordId": _val(r.get("sys_id")),
                                   "prefill": {"short_description": _val(r.get("short_description", "")),
                                               "description": _val(r.get("description", "")),
                                               "priority": _val(r.get("priority", "3")),
                                               "state": _val(r.get("state", "")),
                                               "workaround": _val(r.get("workaround", "")),
                                               "assigned_to": _val(r.get("assigned_to", ""))}},
            )
        item = {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
                "short_description": _val(r.get("short_description")),
                "description": _val(r.get("description", "")),
                "state": _val(r.get("state")),
                "priority": _val(r.get("priority")),
                "assigned_to": _val(r.get("assigned_to")) or None,
                "workaround": _val(r.get("workaround", "")) or None,
                "sys_created_on": _val(r.get("sys_created_on"))}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Problem {label} retrieved. Widget below ↓")],
            structuredContent={"type": "problems", "total": 1, "items": [item],
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )
    schema_fragments = _build_sn_query("problem", {
        "short_description": short_description, "state": state,
        "priority": priority, "assigned_to": assigned_to,
    })
    has_filters = bool(query or schema_fragments) or limit != 5
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("problems")
        if cached_items is not None:
            summary = f"{len(cached_items)} problem(s) retrieved (cached). Widget below ↓" if cached_items else "No problems found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "problems", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    if query:
        try:
            text_clause = f"short_descriptionLIKE{query}^ORdescriptionLIKE{query}"
            full_query = f"{schema_clause}^{text_clause}^ORDERBYDESCsys_created_on" if schema_clause else f"{text_clause}^ORDERBYDESCsys_created_on"
            records = await _text_search(
                "problem", query, PROBLEM_FIELDS, limit, full_query,
            )
        except Exception as e:
            return _error_result(f"Error searching problems: {e}")
    else:
        try:
            base_query = f"{schema_clause}^ORDERBYDESCsys_created_on" if schema_clause else "ORDERBYDESCsys_created_on"
            resp = await servicenow_request(
                "GET", "/api/now/table/problem",
                params={"sysparm_limit": limit, "sysparm_query": base_query,
                        "sysparm_fields": PROBLEM_FIELDS, "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except httpx.HTTPStatusError as e:
            return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
        except Exception as e:
            return _error_result(f"Error fetching problems: {e}")
    items = [
        {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
         "short_description": _val(r.get("short_description")),
         "description": _val(r.get("description", "")),
         "state": _val(r.get("state")),
         "priority": _val(r.get("priority")), "assigned_to": _val(r.get("assigned_to")) or None,
         "workaround": _val(r.get("workaround", "")) or None,
         "sys_created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    cached_at = _cache_set("problems", items) if use_cache else _now_iso()
    structured = {"type": "problems", "total": len(items), "items": items,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No problems found." if not items else f"{len(items)} problem(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_pending_approvals(limit: int = 10, approver: str = "", due_date_from: str = "", due_date_to: str = "", document_type: str = "", document_number: str = "") -> types.CallToolResult:
    # Resolve approver name → sys_id (reference field)
    approver_id = ""
    if approver:
        if _is_sys_id(approver):
            approver_id = approver
        else:
            resolved, suggestions = await _resolve_user(approver)
            if not resolved:
                return _user_not_found_alert(approver, suggestions, field="approver")
            approver_id = resolved
    # Build query — base is state=requested; add user filters
    parts = ["state=requested"]
    if approver_id:
        parts.append(f"approver={approver_id}")
    if due_date_from and re.match(r"^\d{4}-\d{2}-\d{2}", due_date_from):
        parts.append(f"due_date>={due_date_from}")
    if due_date_to and re.match(r"^\d{4}-\d{2}-\d{2}", due_date_to):
        parts.append(f"due_date<={due_date_to}")
    if document_type:
        # Dot-walking: filter on the related sysapproval record's sys_class_name
        parts.append(f"sysapproval.sys_class_name={_sn_escape(document_type)}")
    if document_number:
        parts.append(f"sysapproval.number={_sn_escape(document_number.strip().upper())}")
    parts.append("ORDERBYDESCsys_created_on")
    base_query = "^".join(parts)
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sysapproval_approver",
            params={"sysparm_limit": limit,
                    "sysparm_query": base_query,
                    "sysparm_fields": "sys_id,approver,sysapproval,state,due_date,sys_created_on,sysapproval.sys_class_name,sysapproval.number,sysapproval.short_description",
                    "sysparm_display_value": "true"},
        )
        records = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching approvals: {e}")

    items = [
        {"sys_id": _val(r.get("sys_id")), "approver": _val(r.get("approver")),
         "document": _val(r.get("sysapproval")),
         "document_type": _val(r.get("sysapproval.sys_class_name", "")) or None,
         "document_number": _val(r.get("sysapproval.number", "")) or None,
         "short_description": _val(r.get("sysapproval.short_description", "")) or None,
         "state": _val(r.get("state")),
         "due_date": _val(r.get("due_date")), "created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    structured = {"type": "approvals", "total": len(items), "items": items}
    summary = "No pending approvals." if not items else f"{len(items)} pending approval(s). Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_service_catalog_items(limit: int = 10, sys_id: str = "", short_description: str = "", name: str = "", category: str = "", price_min: str = "", price_max: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id:
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/sc_cat_item",
                params={"sysparm_query": f"sys_id={sys_id}", "sysparm_limit": 1,
                        "sysparm_fields": "sys_id,name,short_description,category,price,delivery_time,sys_class_name",
                        "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up catalog item {sys_id}: {e}")
        if not records:
            return _error_result(f"Catalog item {sys_id} not found.")
        r = records[0]
        item = {"sys_id": _val(r.get("sys_id")), "name": _val(r.get("name")),
                "short_description": _val(r.get("short_description")),
                "category": _val(r.get("category")), "price": _val(r.get("price")),
                "delivery_time": _val(r.get("delivery_time", "")) or None}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Catalog item {_val(r.get('name'))} retrieved.")],
            structuredContent={"type": "service_catalog", "total": 1, "items": [item]},
        )
    schema_fragments = _build_sn_query("service_catalog", {
        "short_description": short_description, "name": name, "category": category,
        "price_min": price_min, "price_max": price_max,
    })
    has_filters = bool(schema_fragments) or limit != 10
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("service_catalog")
        if cached_items is not None:
            summary = f"{len(cached_items)} catalog item(s) retrieved (cached). Widget below ↓" if cached_items else "No catalog items found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "service_catalog", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    base_query = f"{schema_clause}^active=true^ORDERBYname" if schema_clause else "active=true^ORDERBYname"
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/sc_cat_item",
            params={"sysparm_limit": limit, "sysparm_query": base_query,
                    "sysparm_fields": "sys_id,name,short_description,category,price,delivery_time,sys_class_name",
                    "sysparm_display_value": "true"},
        )
        records = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching service catalog: {e}")

    items = [
        {"sys_id": _val(r.get("sys_id")), "name": _val(r.get("name")),
         "short_description": _val(r.get("short_description")),
         "category": _val(r.get("category")), "price": _val(r.get("price")),
         "delivery_time": _val(r.get("delivery_time", "")) or None}
        for r in records
    ]
    cached_at = _cache_set("service_catalog", items) if use_cache else _now_iso()
    structured = {"type": "service_catalog", "total": len(items), "items": items,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No catalog items found." if not items else f"{len(items)} catalog item(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_knowledge_articles(query: str = "", limit: int = 5, sys_id: str = "", short_description: str = "", category: str = "", author: str = "", updated_after: str = "", kb_knowledge_base: str = "", view_count_min: str = "", view_count_max: str = "", refresh: bool = False) -> types.CallToolResult:
    fields_str = "sys_id,number,short_description,text,kb_category,author,sys_updated_on,workflow_state,kb_knowledge_base,sys_view_count"
    if sys_id:
        try:
            resp = await servicenow_request(
                "GET", "/api/now/table/kb_knowledge",
                params={"sysparm_query": f"sys_id={sys_id}", "sysparm_limit": 1,
                        "sysparm_fields": fields_str,
                        "sysparm_display_value": "true"},
            )
            records = resp.json().get("result", [])
        except Exception as e:
            return _error_result(f"Error looking up knowledge article {sys_id}: {e}")
        if not records:
            return _error_result(f"Knowledge article {sys_id} not found.")
        r = records[0]
        item = {"sys_id": r.get("sys_id", ""), "number": _val(r.get("number", "")),
                "short_description": _val(r.get("short_description", "")),
                "category": _val(r.get("kb_category", "")), "author": _val(r.get("author", "")),
                "updated_on": _val(r.get("sys_updated_on", "")), "state": _val(r.get("workflow_state", "")),
                "kb_knowledge_base": _val(r.get("kb_knowledge_base", "")) or None,
                "view_count": _val(r.get("sys_view_count", "")) or None}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Knowledge article {_val(r.get('number'))} retrieved.")],
            structuredContent={"type": "knowledge_articles", "total": 1, "items": [item]},
        )
    schema_fragments = _build_sn_query("knowledge_article", {
        "short_description": short_description, "category": category, "author": author,
        "updated_after": updated_after, "kb_knowledge_base": kb_knowledge_base,
        "view_count_min": view_count_min, "view_count_max": view_count_max,
    })
    has_filters = bool(query or schema_fragments) or limit != 5
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("knowledge_articles")
        if cached_items is not None:
            summary = f"{len(cached_items)} knowledge article(s) retrieved (cached). Widget below ↓" if cached_items else "No knowledge articles found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "knowledge_articles", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    schema_clause = "^".join(schema_fragments)
    params: dict = {
        "sysparm_limit": limit, "sysparm_display_value": "true",
        "sysparm_fields": fields_str,
    }
    if query:
        safe_q = _sn_escape(query)
        text_part = f"short_descriptionLIKE{safe_q}^ORtextLIKE{safe_q}"
        params["sysparm_query"] = (
            f"{schema_clause}^{text_part}^workflow_state=published^ORDERBYDESCsys_updated_on"
            if schema_clause else
            f"{text_part}^workflow_state=published^ORDERBYDESCsys_updated_on"
        )
    else:
        params["sysparm_query"] = (
            f"{schema_clause}^workflow_state=published^ORDERBYDESCsys_updated_on"
            if schema_clause else
            "workflow_state=published^ORDERBYDESCsys_updated_on"
        )
    try:
        resp = await servicenow_request("GET", "/api/now/table/kb_knowledge", params=params)
        records = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to fetch knowledge articles: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching knowledge articles: {e}")

    items = [
        {"sys_id": r.get("sys_id", ""), "number": _val(r.get("number", "")),
         "short_description": _val(r.get("short_description", "")),
         "category": _val(r.get("kb_category", "")), "author": _val(r.get("author", "")),
         "updated_on": _val(r.get("sys_updated_on", "")), "state": _val(r.get("workflow_state", "")),
         "kb_knowledge_base": _val(r.get("kb_knowledge_base", "")) or None,
         "view_count": _val(r.get("sys_view_count", "")) or None}
        for r in records
    ]
    cached_at = _cache_set("knowledge_articles", items) if use_cache else _now_iso()
    structured = {"type": "knowledge_articles", "total": len(items), "items": items,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    summary = "No knowledge articles found." if not items else f"{len(items)} knowledge article(s) retrieved. Widget below ↓"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


# ── Write tools ───────────────────────────────────────────────────────────────

async def sn__create_incident(
    short_description: str, description: str = "", priority: str = "3", category: str = "",
    assigned_to: str = "", caller_id: str = "",
    assigned_to_name: str = "", caller_name: str = "",
    state: str = "", impact: str = "", work_note: str = "",
) -> types.CallToolResult:
    # FK name → sys_id resolution. If `<fk>_id` is set, it wins. Names are
    # batched into one sys_user query (both FKs point to the same table).
    to_resolve: dict[str, str] = {}
    if not assigned_to and assigned_to_name: to_resolve["assigned_to"] = assigned_to_name
    if not caller_id    and caller_name:     to_resolve["caller_id"]   = caller_name
    if to_resolve:
        resolved = await _resolve_users_batched(to_resolve)
        failures: list[dict] = []
        for field, (sys_id, suggestions) in resolved.items():
            if not sys_id:
                failures.append({
                    "field": f"{field}_name",   # widget-facing input key
                    "name": to_resolve[field],
                    "kind": "user",
                    "suggestions": suggestions,
                })
            else:
                if field == "assigned_to": assigned_to = sys_id
                if field == "caller_id":   caller_id   = sys_id
        if failures:
            return _multi_fk_not_found_alert(failures)

    body: dict = {"short_description": short_description, "priority": priority}
    if description: body["description"] = description
    if category: body["category"] = category
    if assigned_to: body["assigned_to"] = assigned_to
    if caller_id: body["caller_id"] = caller_id
    if state:     body["state"] = _INCIDENT_STATE_DISPLAY.get(state.lower(), state)
    if impact:    body["impact"] = impact
    if work_note: body["work_notes"] = work_note
    try:
        resp = await servicenow_request("POST", "/api/now/table/incident", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to create incident: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error creating incident: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("incidents")
    try:
        incidents = await _fetch_incidents()
        cached_at = _cache_set("incidents", incidents)
    except Exception as exc:
        log.warning("sn__create_incident_refresh_failed", error=str(exc))
        incidents = []
        cached_at = _now_iso()
    structured = {"type": "incidents", "total": len(incidents), "incidents": incidents,
                  "_createdId": record.get("sys_id"),
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Incident {number} created. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__create_request(
    short_description: str, description: str = "", priority: str = "3",
    requested_for: str = "", due_date: str = "",
    requested_for_name: str = "",
    approval: str = "", request_state: str = "", work_note: str = "",
) -> types.CallToolResult:
    if not requested_for and requested_for_name:
        sys_id, suggestions = await _resolve_user(requested_for_name)
        if not sys_id:
            return _user_not_found_alert(requested_for_name, suggestions, field="requested_for_name")
        requested_for = sys_id

    body: dict = {"short_description": short_description, "priority": priority}
    if description:   body["description"] = description
    if requested_for: body["requested_for"] = requested_for
    if due_date:      body["due_date"] = due_date
    if approval:      body["approval"] = approval
    if request_state:
        body["request_state"] = _REQUEST_STATE_DISPLAY.get(request_state.lower(), request_state)
    if work_note:     body["work_notes"] = work_note
    try:
        resp = await servicenow_request("POST", "/api/now/table/sc_request", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to create request: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error creating request: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("requests")
    try:
        requests_list = await _fetch_requests()
        cached_at = _cache_set("requests", requests_list)
    except Exception as exc:
        log.warning("sn__create_request_refresh_failed", error=str(exc))
        requests_list = []
        cached_at = _now_iso()
    structured = {"type": "requests", "total": len(requests_list), "requests": requests_list,
                  "_createdId": record.get("sys_id"),
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Request {number} created. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__create_change_request(
    short_description: str, category: str = "Other", type: str = "normal", risk: str = "4", priority: str = "3",
    state: str = "", assigned_to: str = "",
    planned_start_date: str = "", planned_end_date: str = "",
    assigned_to_name: str = "",
    description: str = "", work_note: str = "",
) -> types.CallToolResult:
    if not assigned_to and assigned_to_name:
        sys_id, suggestions = await _resolve_user(assigned_to_name)
        if not sys_id:
            return _user_not_found_alert(assigned_to_name, suggestions, field="assigned_to_name")
        assigned_to = sys_id

    body: dict = {"short_description": short_description, "category": category,
                  "type": type, "risk": risk, "priority": priority}
    if description:        body["description"] = description
    if state:
        body["state"] = _CHANGE_STATE_DISPLAY.get(state.lower(), state)
    if assigned_to:        body["assigned_to"] = assigned_to
    if planned_start_date: body["start_date"] = planned_start_date
    if planned_end_date:   body["end_date"] = planned_end_date
    if work_note:          body["work_notes"] = work_note
    try:
        resp = await servicenow_request(
            "POST", "/api/now/table/change_request",
            json_body=body,
        )
        resp.raise_for_status()
        created = resp.json().get("result", {})
        new_id = _val(created.get("number")) or created.get("sys_id", "")
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error creating change request: {e}")

    _cache_invalidate("change_requests")
    try:
        refresh_resp = await servicenow_request(
            "GET", "/api/now/table/change_request",
            params={"sysparm_limit": 5, "sysparm_query": "ORDERBYDESCsys_created_on",
                    "sysparm_fields": CHANGE_FIELDS, "sysparm_display_value": "true"},
        )
        items = [
            {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
             "short_description": _val(r.get("short_description")),
             "description": _val(r.get("description", "")),
             "state": _val(r.get("state")),
             "priority": _val(r.get("priority")), "risk": _normalize_risk(_val(r.get("risk"))),
             "category": _val(r.get("category")), "type": _val(r.get("type", "")).lower(),
             "planned_start": _val(r.get("start_date", "")) or None,
             "planned_end":   _val(r.get("end_date", "")) or None}
            for r in refresh_resp.json().get("result", [])
        ]
        cached_at = _cache_set("change_requests", items)
    except Exception as exc:
        log.warning("sn__create_change_request_list_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()

    structured = {"type": "change_requests", "total": len(items), "items": items, "_createdId": new_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Change request {new_id} created. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__update_change_request(
    sys_id: str, short_description: str | None = None, category: str | None = None,
    type: str | None = None,
    risk: str | None = None, priority: str | None = None,
    state: str | None = None, assigned_to: str | None = None,
    planned_start_date: str | None = None, planned_end_date: str | None = None,
    description: str | None = None, work_note: str | None = None,
    assigned_to_name: str | None = None,
) -> types.CallToolResult:
    # FK name → sys_id resolution (matches create path).
    if not assigned_to and assigned_to_name:
        sid, suggestions = await _resolve_user(assigned_to_name)
        if not sid:
            return _user_not_found_alert(assigned_to_name, suggestions, field="assigned_to_name")
        assigned_to = sid

    body: dict = {}
    if short_description is not None:  body["short_description"] = short_description
    if description is not None:        body["description"] = description
    if work_note is not None:          body["work_notes"] = work_note
    if category is not None:           body["category"] = category
    if type is not None:               body["type"] = type
    if risk is not None:               body["risk"] = risk
    if priority is not None:           body["priority"] = priority
    if state is not None:
        body["state"] = _CHANGE_STATE_DISPLAY.get(state.lower(), state)
    if assigned_to is not None:        body["assigned_to"] = assigned_to
    if planned_start_date is not None: body["start_date"] = planned_start_date
    if planned_end_date is not None:   body["end_date"] = planned_end_date
    if not body:
        return _error_result("No fields to update. Provide short_description, description, work_note, category, type, risk, priority, state, assigned_to, planned_start_date, or planned_end_date.")
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/change_request/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to update change request: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating change request: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("change_requests")
    try:
        refresh_resp = await servicenow_request(
            "GET", "/api/now/table/change_request",
            params={"sysparm_limit": 5, "sysparm_query": "ORDERBYDESCsys_created_on",
                    "sysparm_fields": CHANGE_FIELDS, "sysparm_display_value": "true"},
        )
        items = [
            {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
             "short_description": _val(r.get("short_description")),
             "description": _val(r.get("description", "")),
             "state": _val(r.get("state")),
             "priority": _val(r.get("priority")), "risk": _normalize_risk(_val(r.get("risk"))),
             "category": _val(r.get("category")), "type": _val(r.get("type", "")).lower(),
             "planned_start": _val(r.get("start_date", "")) or None,
             "planned_end":   _val(r.get("end_date", "")) or None}
            for r in refresh_resp.json().get("result", [])
        ]
        cached_at = _cache_set("change_requests", items)
    except Exception as exc:
        log.warning("sn__update_change_request_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()
    structured = {"type": "change_requests", "total": len(items), "items": items, "_updatedId": sys_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Change request {number} updated. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__update_incident(
    sys_id: str, description: str | None = None, priority: str | None = None,
    state: str | None = None, work_note: str | None = None,
    short_description: str | None = None, category: str | None = None,
    assigned_to: str | None = None, caller_id: str | None = None,
    impact: str | None = None,
    assigned_to_name: str | None = None, caller_name: str | None = None,
) -> types.CallToolResult:
    # FK name → sys_id resolution (matches create path). If <fk> sys_id is set,
    # it wins. Otherwise resolve <fk>_name to a sys_id.
    to_resolve: dict[str, str] = {}
    if not assigned_to and assigned_to_name: to_resolve["assigned_to"] = assigned_to_name
    if not caller_id    and caller_name:     to_resolve["caller_id"]   = caller_name
    if to_resolve:
        resolved = await _resolve_users_batched(to_resolve)
        failures: list[dict] = []
        for field, (sid, suggestions) in resolved.items():
            if not sid:
                failures.append({
                    "field": f"{field}_name",
                    "name": to_resolve[field],
                    "kind": "user",
                    "suggestions": suggestions,
                })
            else:
                if field == "assigned_to": assigned_to = sid
                if field == "caller_id":   caller_id   = sid
        if failures:
            return _multi_fk_not_found_alert(failures)

    body: dict = {}
    if description is not None:       body["description"] = description
    if priority is not None:          body["priority"] = priority
    if impact is not None:            body["impact"] = impact
    if state is not None:
        body["state"] = _INCIDENT_STATE_DISPLAY.get(state.lower(), state)
    if work_note is not None:         body["work_notes"] = work_note
    if short_description is not None: body["short_description"] = short_description
    if category is not None:          body["category"] = category
    if assigned_to is not None:       body["assigned_to"] = assigned_to
    if caller_id is not None:         body["caller_id"] = caller_id
    if not body:
        return _error_result("No fields to update. Provide description, priority, impact, state, work_note, short_description, category, assigned_to, or caller_id.")
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/incident/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to update incident: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating incident: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("incidents")
    try:
        incidents = await _fetch_incidents()
        cached_at = _cache_set("incidents", incidents)
    except Exception as exc:
        log.warning("sn__update_incident_refresh_failed", error=str(exc))
        incidents = []
        cached_at = _now_iso()
    structured = {"type": "incidents", "total": len(incidents), "incidents": incidents,
                  "_updatedId": sys_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Incident {number} updated. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__update_request(
    sys_id: str, approval: str | None = None,
    short_description: str | None = None, description: str | None = None,
    request_state: str | None = None, priority: str | None = None,
    requested_for: str | None = None, due_date: str | None = None,
    work_note: str | None = None,
    requested_for_name: str | None = None,
) -> types.CallToolResult:
    # FK name → sys_id resolution (matches create path).
    if not requested_for and requested_for_name:
        sid, suggestions = await _resolve_user(requested_for_name)
        if not sid:
            return _user_not_found_alert(requested_for_name, suggestions, field="requested_for_name")
        requested_for = sid

    body: dict = {}
    if approval is not None:          body["approval"] = approval
    if short_description is not None: body["short_description"] = short_description
    if description is not None:       body["description"] = description
    if request_state is not None:
        body["request_state"] = _REQUEST_STATE_DISPLAY.get(request_state.lower(), request_state)
    if priority is not None:          body["priority"] = priority
    if requested_for is not None:     body["requested_for"] = requested_for
    if due_date is not None:          body["due_date"] = due_date
    if work_note is not None:         body["work_notes"] = work_note
    if not body:
        return _error_result("No fields to update. Provide approval, short_description, description, request_state, priority, requested_for, due_date, or work_note.")
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/sc_request/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to update request: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating request: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("requests")
    try:
        requests_list = await _fetch_requests()
        cached_at = _cache_set("requests", requests_list)
    except Exception as exc:
        log.warning("sn__update_request_refresh_failed", error=str(exc))
        requests_list = []
        cached_at = _now_iso()
    structured = {"type": "requests", "total": len(requests_list), "requests": requests_list,
                  "_updatedId": sys_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Request {number} approval updated. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__update_request_item(sys_id: str, quantity: str | None = None) -> types.CallToolResult:
    body: dict = {}
    if quantity is not None: body["quantity"] = quantity
    if not body:
        return _error_result("No fields to update. Provide quantity.")
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/sc_req_item/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to update request item: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating request item: {e}")
    _cache_invalidate("requests")
    structured = {"type": "updated", "record_type": "request_item", "sys_id": sys_id,
                  "number": record.get("number"),
                  "message": f"Request item {record.get('number', '')} quantity updated successfully"}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=structured["message"])],
        structuredContent=structured,
    )


async def sn__update_problem(
    sys_id: str, short_description: str | None = None, priority: str | None = None,
    state: str | None = None, work_note: str | None = None,
    description: str | None = None, assigned_to: str | None = None,
    workaround: str | None = None,
    assigned_to_name: str | None = None,
) -> types.CallToolResult:
    # FK name → sys_id resolution (matches create path).
    if not assigned_to and assigned_to_name:
        sid, suggestions = await _resolve_user(assigned_to_name)
        if not sid:
            return _user_not_found_alert(assigned_to_name, suggestions, field="assigned_to_name")
        assigned_to = sid

    body: dict = {}
    if short_description is not None: body["short_description"] = short_description
    if priority is not None:          body["priority"] = priority
    if state:
        body["state"] = _PROBLEM_STATE_DISPLAY.get(state.lower(), state)
    if work_note:                     body["work_notes"] = work_note
    if description is not None:       body["description"] = description
    if assigned_to is not None:       body["assigned_to"] = assigned_to
    if workaround:                    body["workaround"] = workaround
    if not body:
        return _error_result("No fields to update. Provide short_description, description, priority, state, assigned_to, workaround, or work_note.")
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/problem/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to update problem: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating problem: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("problems")
    try:
        items = await _fetch_problems()
        cached_at = _cache_set("problems", items)
    except Exception as exc:
        log.warning("sn__update_problem_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()
    structured = {"type": "problems", "total": len(items), "items": items, "_updatedId": sys_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Problem {number} updated. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__create_problem(
    short_description: str, description: str = "", priority: str = "3",
    state: str = "", assigned_to: str = "", workaround: str = "",
    assigned_to_name: str = "", work_note: str = "",
) -> types.CallToolResult:
    if not assigned_to and assigned_to_name:
        sys_id, suggestions = await _resolve_user(assigned_to_name)
        if not sys_id:
            return _user_not_found_alert(assigned_to_name, suggestions, field="assigned_to_name")
        assigned_to = sys_id

    body: dict = {"short_description": short_description}
    if description: body["description"] = description
    if priority:    body["priority"] = priority
    if state:
        body["state"] = _PROBLEM_STATE_DISPLAY.get(state.lower(), state)
    if assigned_to: body["assigned_to"] = assigned_to
    if workaround:  body["workaround"] = workaround
    if work_note:   body["work_notes"] = work_note
    try:
        resp = await servicenow_request("POST", "/api/now/table/problem", json_body=body)
        new_id = resp.json().get("result", {}).get("sys_id", "")
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error creating problem: {e}")
    _cache_invalidate("problems")
    try:
        items = await _fetch_problems()
        cached_at = _cache_set("problems", items)
    except Exception as exc:
        log.warning("sn__create_problem_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Problem created (Id: {new_id}). Refreshed list returned.")],
        structuredContent={"type": "problems", "total": len(items), "items": items, "_createdId": new_id,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sn__resolve_incident(
    sys_id: str,
    close_code: str = "Solution provided",
    close_notes: str = "Resolved",
) -> types.CallToolResult:
    body = {"state": "6", "close_code": close_code, "close_notes": close_notes}
    try:
        resp = await servicenow_request("PATCH", f"/api/now/table/incident/{sys_id}", json_body=body)
        record = resp.json().get("result", {})
    except httpx.HTTPStatusError as e:
        return _error_result(f"Failed to resolve incident: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error resolving incident: {e}")
    number = _val(record.get("number", ""))
    _cache_invalidate("incidents")
    try:
        incidents = await _fetch_incidents()
        cached_at = _cache_set("incidents", incidents)
    except Exception as exc:
        log.warning("sn__resolve_incident_refresh_failed", error=str(exc))
        incidents = []
        cached_at = _now_iso()
    structured = {"type": "incidents", "total": len(incidents), "incidents": incidents,
                  "_resolvedId": sys_id,
                  "_cache": {"hit": False, "cached_at": cached_at}}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Incident {number} resolved ({close_code}): {close_notes}. Refreshed list returned.")],
        structuredContent=structured,
    )


# ── Form tools ────────────────────────────────────────────────────────────────
# Dumb prefill packagers (SF's sf__show_create_form pattern). No FK resolution
# happens here — names are passed through as plain strings into prefill, and
# the create tool resolves them at submit time.

def _build_prefill(**kwargs) -> dict:
    return {k: v for k, v in kwargs.items() if v}


async def sn__create_incident_form(
    short_description: str = "", description: str = "", priority: str = "",
    caller_name: str = "", assigned_to_name: str = "",
) -> types.CallToolResult:
    prefill = _build_prefill(
        short_description=short_description, description=description, priority=priority,
        caller_name=caller_name, assigned_to_name=assigned_to_name,
    )
    structured: dict = {"type": "form", "entity": "incident"}
    if prefill: structured["prefill"] = prefill
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Opening Incident creation form.")],
        structuredContent=structured,
    )


async def sn__create_request_form(
    short_description: str = "", description: str = "", priority: str = "",
    requested_for_name: str = "",
) -> types.CallToolResult:
    prefill = _build_prefill(
        short_description=short_description, description=description, priority=priority,
        requested_for_name=requested_for_name,
    )
    structured: dict = {"type": "form", "entity": "request"}
    if prefill: structured["prefill"] = prefill
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Opening Request creation form.")],
        structuredContent=structured,
    )


async def sn__create_change_request_form(
    short_description: str = "", description: str = "", priority: str = "",
    category: str = "", risk: str = "", assigned_to_name: str = "",
) -> types.CallToolResult:
    prefill = _build_prefill(
        short_description=short_description, description=description, priority=priority,
        category=category, risk=risk, assigned_to_name=assigned_to_name,
    )
    structured: dict = {"type": "form", "entity": "change_request"}
    if prefill: structured["prefill"] = prefill
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Opening Change Request creation form.")],
        structuredContent=structured,
    )


async def sn__create_problem_form(
    short_description: str = "", description: str = "", priority: str = "",
    assigned_to_name: str = "",
) -> types.CallToolResult:
    prefill = _build_prefill(
        short_description=short_description, description=description, priority=priority,
        assigned_to_name=assigned_to_name,
    )
    structured: dict = {"type": "form", "entity": "problem"}
    if prefill: structured["prefill"] = prefill
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Opening Problem creation form.")],
        structuredContent=structured,
    )


async def sn__create_hr_case_form(
    subject: str = "", description: str = "", priority: str = "",
    opened_for_name: str = "", assigned_to_name: str = "", hr_service_name: str = "",
) -> types.CallToolResult:
    prefill = _build_prefill(
        subject=subject, description=description, priority=priority,
        opened_for_name=opened_for_name, assigned_to_name=assigned_to_name,
        hr_service_name=hr_service_name,
    )
    structured: dict = {"type": "form", "entity": "hr_case"}
    if prefill: structured["prefill"] = prefill
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Opening HR Case creation form.")],
        structuredContent=structured,
    )


async def sn__get_change_tasks(change_sys_id: str) -> types.CallToolResult:
    try:
        resp = await servicenow_request(
            "GET", "/api/now/table/change_task",
            params={"sysparm_query": f"change_request={change_sys_id}^ORDERBYDESCsys_created_on",
                    "sysparm_fields": "sys_id,number,short_description,state,priority,assigned_to,planned_start_date,planned_end_date,sys_created_on",
                    "sysparm_display_value": "true"},
        )
        records = resp.json().get("result", [])
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching change tasks: {e}")

    items = [
        {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
         "short_description": _val(r.get("short_description")),
         "state": _val(r.get("state")), "priority": _val(r.get("priority")),
         "assigned_to": _val(r.get("assigned_to")) or None,
         "planned_start": _val(r.get("planned_start_date", "")) or None,
         "planned_end":   _val(r.get("planned_end_date", "")) or None,
         "sys_created_on": _val(r.get("sys_created_on"))}
        for r in records
    ]
    structured = {"type": "change_tasks", "change_sys_id": change_sys_id, "total": len(items), "items": items}
    summary = f"Found {len(items)} change task(s)." if items else "No change tasks found."
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def sn__get_hr_cases(sys_id: str = "", limit: int = 10, action: str = "", subject: str = "", state: str = "", priority: str = "", opened_for: str = "", assigned_to: str = "", hr_service: str = "", created_at_from: str = "", created_at_to: str = "", refresh: bool = False) -> types.CallToolResult:
    if sys_id:
        try:
            resp = await servicenow_request(
                "GET", f"/api/now/table/sn_hr_core_case/{sys_id}",
                params={"sysparm_fields": HR_FIELDS, "sysparm_display_value": "true"},
            )
            r = resp.json().get("result", {})
        except Exception as e:
            return _error_result(f"Error fetching HR case: {e}")
        if not r:
            return _error_result(f"HR case {sys_id} not found.")
        if action == "edit":
            prefill = {"subject": _val(r.get("short_description")), "description": _val(r.get("description")),
                       "priority": _val(r.get("priority")), "state": _val(r.get("state")),
                       "opened_for": _val(r.get("opened_for", "")), "assigned_to": _val(r.get("assigned_to", "")),
                       "hr_service": _val(r.get("hr_service", ""))}
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"HR case {sys_id} ready to edit.")],
                structuredContent={"type": "form", "entity": "hr_case", "mode": "edit",
                                   "recordId": sys_id, "prefill": prefill},
            )
        item = {"sys_id": _val(r.get("sys_id")), "number": _val(r.get("number")),
                "subject": _val(r.get("short_description")),
                "description": _val(r.get("description", "")),
                "state": _val(r.get("state")),
                "priority": _val(r.get("priority")),
                "opened_by": _val(r.get("opened_by")) or None,
                "opened_for": _val(r.get("opened_for")) or None,
                "assigned_to": _val(r.get("assigned_to")) or None,
                "hr_service": _val(r.get("hr_service")) or None,
                "sys_created_on": _val(r.get("sys_created_on"))}
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"HR case {sys_id} retrieved. Widget below ↓")],
            structuredContent={"type": "hr_cases", "total": 1, "items": [item],
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )
    schema_fragments = _build_sn_query("hr_case", {
        "subject": subject, "state": state, "priority": priority,
        "opened_for": opened_for, "assigned_to": assigned_to, "hr_service": hr_service,
        "created_at_from": created_at_from, "created_at_to": created_at_to,
    })
    has_filters = bool(schema_fragments) or limit != 10
    use_cache = not has_filters and not refresh
    if use_cache:
        cached_items, stored_at = _cache_get("hr_cases")
        if cached_items is not None:
            summary = f"Found {len(cached_items)} HR case(s) (cached)." if cached_items else "No HR cases found."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=summary)],
                structuredContent={"type": "hr_cases", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if schema_fragments:
            schema_clause = "^".join(schema_fragments)
            items = await _fetch_table("hr_case", limit=limit, query=f"{schema_clause}^ORDERBYDESCsys_created_on")
        else:
            items = await _fetch_hr_cases(limit)
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error fetching HR cases: {e}")
    cached_at = _cache_set("hr_cases", items) if use_cache else _now_iso()
    summary = f"Found {len(items)} HR case(s)." if items else "No HR cases found."
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent={"type": "hr_cases", "total": len(items), "items": items,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sn__create_hr_case(
    subject: str, description: str = "", priority: str = "3",
    state: str = "", opened_for: str = "", assigned_to: str = "", hr_service: str = "",
    opened_for_name: str = "", assigned_to_name: str = "", hr_service_name: str = "",
    work_note: str = "",
) -> types.CallToolResult:
    # FK name → sys_id resolution. Batch the two sys_user lookups into a single
    # query; run hr_service lookup concurrently via asyncio.gather. Worst case
    # 3 FK names → 2 SN queries instead of 3, wall-clock ~max(t_user, t_service).
    user_to_resolve: dict[str, str] = {}
    if not opened_for  and opened_for_name:  user_to_resolve["opened_for"]  = opened_for_name
    if not assigned_to and assigned_to_name: user_to_resolve["assigned_to"] = assigned_to_name
    need_service = (not hr_service) and bool(hr_service_name)

    if user_to_resolve or need_service:
        user_task    = _resolve_users_batched(user_to_resolve) if user_to_resolve else asyncio.sleep(0, result={})
        service_task = _resolve_hr_service(hr_service_name)    if need_service    else asyncio.sleep(0, result=(None, []))
        user_results, service_result = await asyncio.gather(user_task, service_task)

        failures: list[dict] = []
        for field, (sys_id, suggestions) in user_results.items():
            if not sys_id:
                failures.append({
                    "field": f"{field}_name",
                    "name": user_to_resolve[field],
                    "kind": "user",
                    "suggestions": suggestions,
                })
            else:
                if field == "opened_for":  opened_for  = sys_id
                if field == "assigned_to": assigned_to = sys_id

        if need_service:
            svc_sys_id, svc_suggestions = service_result
            if not svc_sys_id:
                failures.append({
                    "field": "hr_service_name",
                    "name": hr_service_name,
                    "kind": "hr_service",
                    "suggestions": svc_suggestions,
                })
            else:
                hr_service = svc_sys_id

        if failures:
            return _multi_fk_not_found_alert(failures)

    body: dict = {"short_description": subject, "description": description, "priority": priority}
    if state:
        body["state"] = _HR_STATE_DISPLAY.get(state.lower(), state)
    if opened_for:  body["opened_for"] = opened_for
    if assigned_to: body["assigned_to"] = assigned_to
    if hr_service:  body["hr_service"] = hr_service
    if work_note:   body["work_notes"] = work_note
    try:
        resp = await servicenow_request(
            "POST", "/api/now/table/sn_hr_core_case",
            json_body=body,
        )
        new_id = resp.json().get("result", {}).get("sys_id", "")
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error creating HR case: {e}")
    _cache_invalidate("hr_cases")
    try:
        items = await _fetch_hr_cases()
        cached_at = _cache_set("hr_cases", items)
    except Exception as exc:
        log.warning("sn__create_hr_case_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"HR case created: {subject}")],
        structuredContent={"type": "hr_cases", "total": len(items), "items": items, "_createdId": new_id,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sn__update_hr_case(
    sys_id: str, subject: str | None = None, priority: str | None = None,
    state: str | None = None, work_note: str | None = None,
    description: str | None = None, opened_for: str | None = None,
    assigned_to: str | None = None, hr_service: str | None = None,
    opened_for_name: str | None = None, assigned_to_name: str | None = None,
    hr_service_name: str | None = None,
) -> types.CallToolResult:
    # FK name → sys_id resolution (matches create path). Run sys_user batch
    # and hr_service lookup concurrently — same shape as sn__create_hr_case.
    user_to_resolve: dict[str, str] = {}
    if not opened_for  and opened_for_name:  user_to_resolve["opened_for"]  = opened_for_name
    if not assigned_to and assigned_to_name: user_to_resolve["assigned_to"] = assigned_to_name
    need_service = (not hr_service) and bool(hr_service_name)

    if user_to_resolve or need_service:
        user_task    = _resolve_users_batched(user_to_resolve) if user_to_resolve else asyncio.sleep(0, result={})
        service_task = _resolve_hr_service(hr_service_name)    if need_service    else asyncio.sleep(0, result=(None, []))
        user_results, service_result = await asyncio.gather(user_task, service_task)

        failures: list[dict] = []
        for field, (sid, suggestions) in user_results.items():
            if not sid:
                failures.append({
                    "field": f"{field}_name",
                    "name": user_to_resolve[field],
                    "kind": "user",
                    "suggestions": suggestions,
                })
            else:
                if field == "opened_for":  opened_for  = sid
                if field == "assigned_to": assigned_to = sid

        if need_service:
            svc_sid, svc_suggestions = service_result
            if not svc_sid:
                failures.append({
                    "field": "hr_service_name",
                    "name": hr_service_name,
                    "kind": "hr_service",
                    "suggestions": svc_suggestions,
                })
            else:
                hr_service = svc_sid

        if failures:
            return _multi_fk_not_found_alert(failures)

    body: dict = {}
    if subject is not None:     body["short_description"] = subject
    if priority is not None:    body["priority"] = priority
    if state is not None:
        body["state"] = _HR_STATE_DISPLAY.get(state.lower(), state)
    if work_note is not None:   body["work_notes"] = work_note
    if description is not None: body["description"] = description
    if opened_for is not None:  body["opened_for"] = opened_for
    if assigned_to is not None: body["assigned_to"] = assigned_to
    if hr_service is not None:  body["hr_service"] = hr_service
    if not body:
        return _error_result("No fields to update. Provide subject, description, priority, state, work_note, opened_for, assigned_to, or hr_service.")
    try:
        await servicenow_request("PATCH", f"/api/now/table/sn_hr_core_case/{sys_id}", json_body=body)
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error updating HR case: {e}")
    _cache_invalidate("hr_cases")
    try:
        items = await _fetch_hr_cases()
        cached_at = _cache_set("hr_cases", items)
    except Exception as exc:
        log.warning("sn__update_hr_case_refresh_failed", error=str(exc))
        items = []
        cached_at = _now_iso()
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="HR case updated. Refreshed list returned.")],
        structuredContent={"type": "hr_cases", "total": len(items), "items": items, "_updatedId": sys_id,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sn__approve_record(sys_id: str) -> types.CallToolResult:
    try:
        await servicenow_request(
            "PATCH", f"/api/now/table/sysapproval_approver/{sys_id}",
            json_body={"state": "approved", "comments": "Approved via M365 Copilot"},
        )
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error approving record: {e}")
    try:
        approvals = await _fetch_approvals()
    except Exception as exc:
        log.warning("sn__approve_record_refresh_failed", error=str(exc))
        approvals = []
    structured = {"type": "approvals", "total": len(approvals), "items": approvals}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Approval granted. Refreshed list returned.")],
        structuredContent=structured,
    )


async def sn__reject_record(sys_id: str, comments: str = "") -> types.CallToolResult:
    try:
        await servicenow_request(
            "PATCH", f"/api/now/table/sysapproval_approver/{sys_id}",
            json_body={"state": "rejected", "comments": comments or "Rejected via M365 Copilot"},
        )
    except httpx.HTTPStatusError as e:
        return _error_result(f"ServiceNow API error: {e.response.status_code} {e.response.text}")
    except Exception as e:
        return _error_result(f"Error rejecting record: {e}")
    try:
        approvals = await _fetch_approvals()
    except Exception as exc:
        log.warning("sn__reject_record_refresh_failed", error=str(exc))
        approvals = []
    structured = {"type": "approvals", "total": len(approvals), "items": approvals}
    return types.CallToolResult(
        content=[types.TextContent(type="text", text="Approval rejected. Refreshed list returned.")],
        structuredContent=structured,
    )


# ── Prompts ───────────────────────────────────────────────────────────────────

def prompt_show_incidents() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text",
        text="Show me the latest incidents from ServiceNow. Call get_incidents with limit=5. Present the results in the widget."))]


def prompt_show_requests() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text",
        text="Show me the latest service requests from ServiceNow. Call get_requests with limit=5. Present the results in the widget."))]


def prompt_incident_summary() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text",
        text="Give me a summary of the latest incidents from ServiceNow. Call get_incidents with limit=5. Show the widget, then provide a brief written summary: how many are critical/high priority, how many are unassigned, and any patterns in categories."))]


# ── _TOOL_SPECS_LIST registry ───────────────────────────────────────────────────────

_TOOL_SPECS_LIST = [
    {"name": "sn__get_incidents",
     "description": "Retrieve incidents from ServiceNow. No args → latest N (default 5). 'query' for free-text search across short_description+description. 'number' alone (e.g. INC0010001) → list-of-one for that record; add action='edit' to open the edit form, action='resolve' for the resolve form. Filters: short_description (LIKE), state, priority, assigned_to (sys_id), assigned_to_name (dot-walk CONTAINS on assigned_to.name — e.g. 'incidents assigned to Joe'), category, caller_id (sys_id), caller_name (dot-walk CONTAINS on caller_id.name), created_at_from/to (YYYY-MM-DD). State accepts 'new'/'in progress'/'on hold'/'resolved'/'closed'/'canceled' or numeric codes 1-8 or group aliases 'open'/'active' (= 1,2,3). Priority accepts 'P1'-'P4' / 'critical'/'high'/'moderate'/'low' / '1'-'4'. Both state and priority accept comma-separated lists (e.g. 'new,in progress' or 'P1,P2').",
     "handler": sn__get_incidents},
    {"name": "sn__get_requests",
     "description": "Retrieve service requests from ServiceNow. No args → latest N (default 5). 'query' for free-text search. 'number' alone (e.g. REQ0010001) → list-of-one for that record; add action='edit' to open the edit form. Filters: short_description (LIKE), request_state, priority, approval, requested_for (sys_id), due_date_from/to (YYYY-MM-DD), created_at_from/to (YYYY-MM-DD). request_state accepts 'pending'/'pending approval'/'approved'/'in process' or 'closed' (matches all closed_* variants) or the raw keys (requested, in_process, closed_complete, closed_incomplete, closed_rejected, closed_cancelled, closed_skipped). Priority accepts 'P1'-'P4' / 'critical'/'high'/'moderate'/'low' / '1'-'4'. Both fields accept comma-separated lists.",
     "handler": sn__get_requests},
    {"name": "sn__get_request_items",
     "description": "Retrieve request items for a specific service request. request_sys_id is the sys_id of the parent sc_request record. Called from the widget when expanding a request row.",
     "handler": sn__get_request_items},
    {"name": "sn__get_change_requests",
     "description": "Retrieve change requests from ServiceNow. No args → latest N (default 5). 'query' for free-text search. 'number' alone (e.g. CHG0010001) → list-of-one for that record; add action='edit' to open the edit form. Filters: short_description (LIKE), state, priority, risk, category, assigned_to (sys_id), planned_start_from/to (YYYY-MM-DD), planned_end_from/to (YYYY-MM-DD), created_at_from/to (YYYY-MM-DD). State accepts 'new'/'assess'/'authorize'/'scheduled'/'implement'/'review'/'closed'/'canceled' or numeric codes (-5,-4,-3,-2,-1,0,3,4) or group alias 'open' (= all non-terminal states). Priority accepts 'P1'-'P4' / 'critical'/'high'/'moderate'/'low' / '1'-'4'. Both state and priority accept comma-separated lists.",
     "handler": sn__get_change_requests},
    {"name": "sn__get_problems",
     "description": "Retrieve problem records from ServiceNow. No args → latest N (default 5). 'query' for free-text search. 'number' alone (e.g. PRB0010001) → list-of-one for that record; add action='edit' to open the edit form. Filters: short_description (LIKE), state, priority, assigned_to (sys_id). State accepts 'new'/'assess'/'root cause analysis'/'fix in progress'/'resolved'/'closed' or numeric codes (101-104, 106, 107) or group alias 'open' (= 101,102,103,104). Priority accepts 'P1'-'P4' / 'critical'/'high'/'moderate'/'low' / '1'-'4'. Both state and priority accept comma-separated lists.",
     "handler": sn__get_problems},
    {"name": "sn__get_pending_approvals",
     "description": "Get pending approval requests in ServiceNow. Returns up to 'limit' approvals (default 10) with approver, document, and state.",
     "handler": sn__get_pending_approvals},
    {"name": "sn__get_service_catalog_items",
     "description": "Get available items from the ServiceNow Service Catalog. Returns up to 'limit' catalog items (default 10).",
     "handler": sn__get_service_catalog_items},
    {"name": "sn__get_knowledge_articles",
     "description": "Search knowledge articles in ServiceNow. Returns articles from the kb_knowledge table matching the query.",
     "handler": sn__get_knowledge_articles},
    {"name": "sn__create_incident",
     "description": "Create a new incident in ServiceNow. Required: short_description. Optional: description, priority (1-4), impact (1-3), category, state ('new'/'in progress'/'on hold'/'resolved'/'closed' or numeric 1/2/3/6/7), assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), caller_id (sys_id), caller_name (resolved server-side, same alert semantics), work_note.",
     "handler": sn__create_incident},
    {"name": "sn__create_request",
     "description": "Create a new service request in ServiceNow. Required: short_description. Optional: description, priority (1-4), requested_for (sys_id), requested_for_name (resolved server-side against sys_user; on miss returns alert with suggestions), due_date (YYYY-MM-DD), approval ('approved'/'requested'/'rejected'/'not requested'), request_state ('pending approval'/'in process'/'closed_complete'/'closed_incomplete'/'closed_cancelled'/'closed_rejected'/'closed_skipped' — display strings or canonical keys both accepted), work_note.",
     "handler": sn__create_request},
    {"name": "sn__create_change_request",
     "description": "Create a new Change Request in ServiceNow. Required: short_description. Optional: description, category ('Normal'/'Standard'/'Emergency', defaults Normal), risk ('low'/'moderate'/'high', defaults moderate), priority (1-4), state ('new'/'assess'/'authorize'/'scheduled'/'implement'/'review'/'closed' or numeric -5/-4/-3/-2/-1/0/3), assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), planned_start_date (YYYY-MM-DD), planned_end_date (YYYY-MM-DD), work_note.",
     "handler": sn__create_change_request},
    {"name": "sn__update_change_request",
     "description": "Update an existing Change Request in ServiceNow. Required: sys_id. Optional editable fields: short_description, description, category ('Normal'/'Standard'/'Emergency'), risk ('low'/'moderate'/'high'), priority (1-4), state ('new'/'assess'/'authorize'/'scheduled'/'implement'/'review'/'closed' or numeric -5/-4/-3/-2/-1/0/3), assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), planned_start_date (YYYY-MM-DD), planned_end_date (YYYY-MM-DD), work_note (appended to journal).",
     "handler": sn__update_change_request},
    {"name": "sn__update_incident",
     "description": "Update an existing incident in ServiceNow. Required: sys_id. Optional editable fields: short_description, description, priority (1-4), impact (1-3), state ('new'/'in progress'/'on hold'/'resolved'/'closed' or numeric 1/2/3/6/7), category, assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), caller_id (sys_id), caller_name (resolved server-side, same alert semantics), work_note (appended to journal).",
     "handler": sn__update_incident},
    {"name": "sn__update_request",
     "description": "Update an existing service request in ServiceNow. Required: sys_id. Optional editable fields: short_description, description, priority (1-4), approval ('approved'/'requested'/'rejected'/'not requested'), request_state ('pending approval'/'in process'/'closed_complete'/'closed_incomplete'/'closed_cancelled'/'closed_rejected'/'closed_skipped'), requested_for (sys_id), requested_for_name (resolved server-side against sys_user; on miss returns alert with suggestions), due_date (YYYY-MM-DD), work_note (appended to journal).",
     "handler": sn__update_request},
    {"name": "sn__update_request_item",
     "description": "Update an existing request item in ServiceNow. Requires sys_id. Editable field: quantity.",
     "handler": sn__update_request_item},
    {"name": "sn__update_problem",
     "description": "Update an existing Problem record in ServiceNow. Required: sys_id. Optional editable fields: short_description, description, priority (1-4), state ('new'/'assess'/'rca'/'fix in progress'/'resolved'/'closed' or numeric 101/102/103/104/106/107), assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), workaround, work_note (appended to journal).",
     "handler": sn__update_problem},
    {"name": "sn__resolve_incident",
     "description": "Resolve an incident in ServiceNow by setting state to Resolved. Requires close_code (one of: Duplicate, Known error, No resolution provided, Resolved by caller, Resolved by change, Resolved by problem, Resolved by request, Solution provided, Workaround provided, User error) and close_notes.",
     "handler": sn__resolve_incident},
    {"name": "sn__create_incident_form",
     "description": "Open the Incident creation form. Optional prefill args: short_description, description, priority, caller_name, assigned_to_name. FK names are passed through as text — the create tool resolves them at submit.",
     "handler": sn__create_incident_form},
    {"name": "sn__create_request_form",
     "description": "Open the Service Request creation form. Optional prefill args: short_description, description, priority, requested_for_name.",
     "handler": sn__create_request_form},
    {"name": "sn__create_change_request_form",
     "description": "Open the Change Request creation form. Optional prefill args: short_description, description, priority, category, risk, assigned_to_name.",
     "handler": sn__create_change_request_form},
    {"name": "sn__create_problem_form",
     "description": "Open the Problem creation form. Optional prefill args: short_description, description, priority, assigned_to_name.",
     "handler": sn__create_problem_form},
    {"name": "sn__create_hr_case_form",
     "description": "Open the HR Case creation form. Optional prefill args: subject, description, priority, opened_for_name, assigned_to_name, hr_service_name.",
     "handler": sn__create_hr_case_form},
    {"name": "sn__get_change_tasks",
     "description": "Get change tasks for a specific change request. Requires change_sys_id (the sys_id of the parent change_request). Called from the widget when expanding a change request row.",
     "handler": sn__get_change_tasks},
    {"name": "sn__create_problem",
     "description": "Create a new Problem record in ServiceNow. Required: short_description. Optional: description, priority (1=Critical, 2=High, 3=Moderate, 4=Low), state ('new'/'assess'/'rca'/'fix in progress'/'resolved'/'closed' or numeric 101/102/103/104/106/107), assigned_to (sys_id), assigned_to_name (resolved server-side against sys_user; on miss returns alert with suggestions), workaround, work_note.",
     "handler": sn__create_problem},
    {"name": "sn__get_hr_cases",
     "description": "Retrieve HR cases from ServiceNow. No args → latest N (default 10). 'sys_id' alone → list-of-one for that record; add action='edit' to open the edit form. Filters: subject (LIKE on short_description), state, priority, opened_for (sys_id), assigned_to (sys_id), hr_service (sys_id), created_at_from/to (YYYY-MM-DD). State accepts 'draft'/'ready'/'awaiting approval'/'work in progress'/'awaiting acceptance'/'closed complete'/'closed incomplete'/'cancelled'/'suspended' or numeric codes (1,3,4,7,10,11,18,20,24) or group alias 'open' (= 1,10,11,18,20). Priority accepts 'P1'-'P4' / 'critical'/'high'/'moderate'/'low' / '1'-'4'. Both state and priority accept comma-separated lists.",
     "handler": sn__get_hr_cases},
    {"name": "sn__create_hr_case",
     "description": "Create a new HR case in ServiceNow. Required: subject. Optional: description, priority (1=Critical, 2=High, 3=Moderate, 4=Low), state ('draft'/'ready'/'awaiting approval'/'work in progress'/'awaiting acceptance'/'closed complete'/'closed incomplete'/'cancelled'/'suspended' or numeric 1/3/4/7/10/11/18/20/24), opened_for (sys_id), opened_for_name (resolved server-side against sys_user; on miss returns alert with suggestions), assigned_to (sys_id), assigned_to_name (resolved server-side, same alert semantics), hr_service (sys_id), hr_service_name (resolved server-side against sn_hr_core_service, same alert semantics), work_note.",
     "handler": sn__create_hr_case},
    {"name": "sn__update_hr_case",
     "description": "Update an existing HR case in ServiceNow. Required: sys_id. Optional editable fields: subject, description, priority (1-4), state ('draft'/'ready'/'awaiting approval'/'work in progress'/'awaiting acceptance'/'closed complete'/'closed incomplete'/'cancelled'/'suspended' or numeric 1/3/4/7/10/11/18/20/24), opened_for (sys_id), opened_for_name (resolved server-side against sys_user; on miss returns alert with suggestions), assigned_to (sys_id), assigned_to_name (resolved server-side, same alert semantics), hr_service (sys_id), hr_service_name (resolved server-side against sn_hr_core_service, same alert semantics), work_note (appended to journal).",
     "handler": sn__update_hr_case},
    {"name": "sn__approve_record",
     "description": "Approve a pending approval in ServiceNow. Requires sys_id of the sysapproval_approver record.",
     "handler": sn__approve_record},
    {"name": "sn__reject_record",
     "description": "Reject a pending approval in ServiceNow. Requires sys_id. Optional: comments explaining the rejection.",
     "handler": sn__reject_record},
    {"name": "sn__get_users",
     "description": "Search ServiceNow users (sys_user) by name, user_name, or email. Returns up to 10 candidates with sys_ids. Use this to find a sys_id BEFORE filtering another tool by an FK (e.g. 'incidents assigned to Joe' → call sn__get_users(name='Joe') first, then sn__get_incidents with the resolved sys_id).",
     "handler": sn__get_users},
    {"name": "sn__get_hr_services",
     "description": "Search ServiceNow HR services (sn_hr_core_service) by name. Returns up to 10 candidates with sys_ids. Use this to find an hr_service sys_id BEFORE filtering or creating HR cases by service.",
     "handler": sn__get_hr_services},
]

PROMPT_SPECS = [
    {"name": "show_incidents", "description": "Show the latest incidents from ServiceNow.", "handler": prompt_show_incidents},
    {"name": "show_requests", "description": "Show the latest service requests from ServiceNow.", "handler": prompt_show_requests},
    {"name": "incident_summary", "description": "Get a summary analysis of recent incidents.", "handler": prompt_incident_summary},
]


# ── Aliases for server.py imports ────────────────────────────────────────────
from mcp.types import PromptMessage as _PM, TextContent as _TC  # noqa: E402

TOOL_SPECS = _TOOL_SPECS_LIST

PROMPT_SPECS = [
    {
        "name": "my-incidents",
        "description": "Show the latest open incidents from ServiceNow.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Show me the latest incidents from ServiceNow. "
            "Call sn__get_incidents and display the results in the widget."
        )))],
    },
    {
        "name": "my-approvals",
        "description": "Show pending approval requests assigned to you in ServiceNow.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Show me my pending approvals from ServiceNow. "
            "Call sn__get_pending_approvals and display the results in the widget."
        )))],
    },
    {
        "name": "it-snapshot",
        "description": "Get a live summary of incidents, requests, change requests, and problems.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Give me an IT snapshot. "
            "Call sn__get_incidents, sn__get_requests, sn__get_change_requests, and sn__get_problems "
            "— these are independent. "
            "Once all four return, summarise: open incident count by priority, pending requests, "
            "in-flight change requests, and open problems."
        )))],
    },
    {
        "name": "resolve-incident",
        "description": "Pick an open incident and mark it resolved with close code and notes.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "I want to resolve an incident. Call sn__get_incidents to show the latest open incidents. "
            "Ask me which incident to resolve, then ask for the close code and resolution notes. "
            "Then call sn__resolve_incident with sys_id, close_code, and close_notes."
        )))],
    },
    {
        "name": "search-and-log",
        "description": "Search the knowledge base for a topic and add a work note to a related incident.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "I want to find a knowledge article and log it on an incident. "
            "Ask me for the search topic, then call sn__get_knowledge_articles with that query. "
            "Also call sn__get_incidents to show open incidents — these are independent. "
            "Ask me which article and which incident to link, then call sn__update_incident "
            "with the incident sys_id and a work_note referencing the article."
        )))],
    },
    {
        "name": "raise-change",
        "description": "Browse the service catalog and raise a new change request.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "I want to raise a change request. Call sn__get_service_catalog_items to show available items. "
            "Ask me what change I need to make. "
            "Then call sn__create_change_request with the short_description, category, and risk level."
        )))],
    },
]
