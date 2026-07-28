"""Salesforce CRM tool handlers, _TOOL_SPECS_LIST, PROMPT_SPECS. No MCP bootstrap here."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from cachetools import TTLCache
from mcp import types
from mcp.types import PromptMessage, TextContent

from .salesforce_client import SalesforceAPIError, SalesforceAuthError, get_client
from shared_mcp.logger import get_logger

log = get_logger("sf")


def _sq(value: str) -> str:
    """Escape a string literal for SOQL — single quotes and backslashes only."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


# ── Entity field definitions (columns + hiddenColumns used by _fetch_entity) ───

_C = lambda a, k: {"apiName": a, "key": k}  # noqa: E731

_ENTITY_SCHEMAS: dict[str, dict] = {
    "Lead": {
        "soqlObject": "Lead", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("FirstName", "first_name"), _C("LastName", "last_name"), _C("Company", "company"),
            _C("Email", "email"), _C("Phone", "phone"), _C("Status", "status"), _C("LeadSource", "lead_source"),
            _C("Title", "title"), _C("AnnualRevenue", "annual_revenue"),
        ],
        "hiddenColumns": [
            _C("IsConverted", "is_converted"),
            _C("ConvertedAccount.Name", "converted_account_name"),
            _C("ConvertedOpportunity.Name", "converted_opportunity_name"),
        ],
        # name + campaign_id handled inline (multi-field LIKE + subquery)
        "filters": {
            "company":     ("Company", "like"),
            "email":       ("Email", "like"),
            "phone":       ("Phone", "like"),
            "status":      ("Status", "eq"),
            "lead_source": ("LeadSource", "eq"),
        },
    },
    "Opportunity": {
        "soqlObject": "Opportunity", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("Name", "name"), _C("Account.Name", "account_name"), _C("StageName", "stage"),
            _C("Amount", "amount"), _C("CloseDate", "close_date"), _C("Probability", "probability"),
            _C("Type", "type"), _C("LeadSource", "lead_source"),
        ],
        "hiddenColumns": [_C("AccountId", "account_id")],
        "filters": {
            "account_id":       ("AccountId", "eq"),
            "account_name":     ("Account.Name", "like"),
            "name":             ("Name", "like"),
            "stage":            ("StageName", "eq"),
            "amount_min":       ("Amount", "gte"),
            "amount_max":       ("Amount", "lte"),
            "close_date_from":  ("CloseDate", "gte"),
            "close_date_to":    ("CloseDate", "lte"),
            "probability_min":  ("Probability", "gte"),
            "probability_max":  ("Probability", "lte"),
            "type":             ("Type", "eq"),
            "lead_source":      ("LeadSource", "eq"),
        },
    },
    "Account": {
        "soqlObject": "Account", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("Name", "name"), _C("Industry", "industry"), _C("Phone", "phone"),
            _C("Website", "website"), _C("BillingCity", "billing_city"),
            _C("Type", "type"), _C("NumberOfEmployees", "number_of_employees"),
            _C("AccountNumber", "account_number"), _C("AnnualRevenue", "annual_revenue"),
        ],
        "hiddenColumns": [],
        "filters": {
            "name":                ("Name", "like"),
            "industry":            ("Industry", "eq"),
            "sic":                 ("Sic", "eq"),
            "account_number":      ("AccountNumber", "eq"),
            "ticker_symbol":       ("TickerSymbol", "eq"),
            "annual_revenue_min":  ("AnnualRevenue", "gte"),
            "annual_revenue_max":  ("AnnualRevenue", "lte"),
            "type":                ("Type", "eq"),
        },
    },
    "Contact": {
        "soqlObject": "Contact", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("FirstName", "first_name"), _C("LastName", "last_name"), _C("Email", "email"),
            _C("Phone", "phone"), _C("Title", "title"), _C("Account.Name", "account_name"),
            _C("Department", "department"), _C("LeadSource", "lead_source"),
        ],
        "hiddenColumns": [_C("AccountId", "account_id")],
        # name handled inline (multi-field LIKE on FirstName/LastName)
        "filters": {
            "name":         (None, "inline"),  # declared so _schema exposes it; handled in function body
            "account_id":   ("AccountId", "eq"),
            "account_name": ("Account.Name", "like"),
            "title":        ("Title", "like"),
            "department":   ("Department", "eq"),
            "lead_source":  ("LeadSource", "eq"),
        },
    },
    "Case": {
        "soqlObject": "Case", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("CaseNumber", "case_number"), _C("Subject", "subject"), _C("Status", "status"),
            _C("Priority", "priority"), _C("Account.Name", "account_name"),
            _C("Type", "type"),
        ],
        "hiddenColumns": [_C("CreatedDate", "created_date"), _C("AccountId", "account_id")],
        "filters": {
            "account_id":   ("AccountId", "eq"),
            "account_name": ("Account.Name", "like"),
            "subject":      ("Subject", "like"),
            "case_number":  ("CaseNumber", "eq"),
            "priority":     ("Priority", "eq"),
            "status":       ("Status", "eq"),
            "type":         ("Type", "eq"),
        },
    },
    "Task": {
        "soqlObject": "Task", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("Subject", "subject"), _C("Status", "status"), _C("Priority", "priority"),
            _C("ActivityDate", "activity_date"),
            _C("WhoId", "who_id"), _C("Who.Name", "who_name"),
            _C("WhatId", "what_id"), _C("What.Name", "what_name"),
            _C("Description", "description"),
        ],
        "hiddenColumns": [],
        # related_name handled inline (polymorphic dot-walk on What.Name OR
        # Who.Name — covers Account/Opportunity/Contact/Lead/etc. via the
        # universal Name accessor exposed on polymorphic relationships)
        "filters": {
            "subject":             ("Subject", "like"),
            "status":              ("Status", "eq"),
            "priority":            ("Priority", "eq"),
            "activity_date_from":  ("ActivityDate", "gte"),
            "activity_date_to":    ("ActivityDate", "lte"),
        },
    },
    "Campaign": {
        "soqlObject": "Campaign", "orderBy": "CreatedDate DESC", "limit": 5,
        "columns": [
            _C("Name", "name"), _C("Status", "status"), _C("Type", "type"),
            _C("StartDate", "start_date"), _C("EndDate", "end_date"),
            _C("NumberOfLeads", "num_leads"),
            _C("BudgetedCost", "budgeted_cost"), _C("ActualCost", "actual_cost"),
            _C("NumberOfResponses", "num_responses"),
        ],
        "hiddenColumns": [],
        "filters": {
            "name":   ("Name", "like"),
            "status": ("Status", "eq"),
            "type":   ("Type", "eq"),
        },
    },
}


def _get_schema(entity_type: str) -> dict:
    return _ENTITY_SCHEMAS.get(entity_type, {})


def _build_where_clauses(entity_type: str, params: dict) -> list[str]:
    """Convert a {param_name: value} dict into SOQL WHERE clauses using
    the entity's `filters` spec in _ENTITY_SCHEMAS.

    Caller joins the returned list with ' AND '. Empty/None values are skipped.
    Params not present in the spec are ignored (forward-compatible).

    Ops:  'like' → Field LIKE '%val%'   (string, _sq escaped)
          'eq'   → Field = 'val'        (string, _sq escaped)
          'gte'  → Field >= val         (date literal YYYY-MM-DD unquoted,
                                         else numeric float-cast; ignored on parse error)
          'lte'  → Field <= val         (same)
    """
    spec = _get_schema(entity_type).get("filters", {})
    clauses: list[str] = []
    for pname, val in params.items():
        if val is None or val == "":
            continue
        if pname not in spec:
            continue
        field, op = spec[pname]
        if op == "inline":
            continue  # handled by caller, not here
        if op == "like":
            clauses.append(f"{field} LIKE '%{_sq(str(val))}%'")
        elif op == "eq":
            clauses.append(f"{field} = '{_sq(str(val))}'")
        elif op in ("gte", "lte"):
            sym = ">=" if op == "gte" else "<="
            val_str = str(val).strip()
            # SOQL date literal: ISO YYYY-MM-DD, no quotes
            if re.match(r"^\d{4}-\d{2}-\d{2}$", val_str):
                clauses.append(f"{field} {sym} {val_str}")
                continue
            # Numeric fallback (amount, revenue, probability)
            try:
                num = float(val_str)
            except (TypeError, ValueError):
                continue
            clauses.append(f"{field} {sym} {num}")
    return clauses


# ── TTL cache (120 s, invalidated on write) ───────────────────────────────────
# Flat keyed cache: any string key. Used for:
#   - bare list calls: key = "leads"
#   - filtered list calls: key = "leads:company=Microsoft|status=Open"
#   - drill-down by id: key = "opportunity_products:006xxx..."
# All entries share one TTLCache so the LRU eviction is global.

_CACHE: TTLCache = TTLCache(maxsize=200, ttl=120)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _time_ago(iso: str) -> str:
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        secs = int((datetime.now(timezone.utc) - dt).total_seconds())
        if secs < 5:    return "just now"
        if secs < 60:   return f"{secs}s ago"
        if secs < 3600: return f"{secs // 60}m ago"
        return f"{secs // 3600}h ago"
    except Exception:
        return iso


def _filter_signature(params: dict) -> str:
    """Stable signature for a filter dict. Empty/None values skipped.
    Returns '' when no active filters."""
    parts = []
    for k in sorted(params.keys()):
        v = params[k]
        if v is None or v == "" or v is False:
            continue
        parts.append(f"{k}={v}")
    return "|".join(parts)


def _cache_get(key: str) -> tuple[list | None, str | None]:
    entry = _CACHE.get(key)
    if entry:
        return entry["items"], entry["at"]
    return None, None


def _cache_set(key: str, items: list) -> str:
    at = _now_iso()
    _CACHE[key] = {"items": items, "at": at}
    return at


def _cache_invalidate(entity: str) -> None:
    """Wipe every cache entry whose key starts with this entity (covers
    the bare entry plus every filter-signature variant)."""
    for k in list(_CACHE.keys()):
        if k == entity or k.startswith(entity + ":"):
            del _CACHE[k]


# ── Shared helpers ────────────────────────────────────────────────────────────

def _error_result(message: str) -> types.CallToolResult:
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=message)],
        isError=True,
    )


def _sf_api_alert(action: str, entity: str, exc: Exception) -> types.CallToolResult:
    """Return a user-visible alert for Salesforce API errors (4xx).

    Unlike _error_result (which sets isError=True and gets mangled by MOS3
    into 'Method Not Found'), this returns a structured alert that the widget
    can display gracefully while keeping the form open.
    """
    msg = f"{entity} was NOT {action}d. Salesforce rejected the request: {exc}"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={"type": "alert", "message": msg},
    )


def _flatten_record(r: dict, columns: list[dict]) -> dict:
    result: dict[str, Any] = {"id": r.get("Id", "")}
    for col in columns:
        api = col["apiName"]
        key = col.get("key", api)
        if api == "Id":
            continue
        if "." in api:
            parts = api.split(".", 1)
            val = ((r.get(parts[0]) or {}).get(parts[1])) or ""
        else:
            val = r.get(api)
            if val is None:
                val = ""
        result[key] = val
    return result


async def _fetch_entity(entity_type: str) -> list[dict]:
    cfg = _get_schema(entity_type)
    columns = cfg.get("columns", [])
    hidden = cfg.get("hiddenColumns", [])
    all_cols = columns + hidden
    limit = cfg.get("limit", 5)
    order_by = cfg.get("orderBy", "CreatedDate DESC")
    soql_object = cfg.get("soqlObject", entity_type)
    api_names = ["Id"] + [c["apiName"] for c in all_cols if c["apiName"] != "Id"]
    soql = f"SELECT {', '.join(api_names)} FROM {soql_object} ORDER BY {order_by} LIMIT {limit}"
    sf = get_client()
    records = await sf.query(soql)
    return [_flatten_record(r, all_cols) for r in records]


def _list_summary(entity_label: str, items: list[dict], entity_type: str,
                  cache_hit: bool = False, cached_at: str = "") -> str:
    if not items:
        return f"No {entity_label} found."
    source = f"cached ({_time_ago(cached_at)})" if cache_hit else "live"
    return f"{len(items)} {entity_label} [{source}]."


async def _fetch_leads()         -> list[dict]: return await _fetch_entity("Lead")
async def _fetch_opportunities() -> list[dict]: return await _fetch_entity("Opportunity")
async def _fetch_accounts()      -> list[dict]: return await _fetch_entity("Account")
async def _fetch_contacts()      -> list[dict]: return await _fetch_entity("Contact")
async def _fetch_cases()         -> list[dict]: return await _fetch_entity("Case")
async def _fetch_tasks()         -> list[dict]: return await _fetch_entity("Task")

async def _fetch_campaigns()     -> list[dict]: return await _fetch_entity("Campaign")


# ── Tool handlers ─────────────────────────────────────────────────────────────

async def sf__get_leads(
    lead_id: str = "",
    name: str = "",
    company: str = "",
    campaign_id: str = "",
    email: str = "",
    phone: str = "",
    status: str = "",
    lead_source: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_leads", lead_id=lead_id, action=action, name=name,
             company=company, campaign_id=campaign_id, email=email, phone=phone,
             status=status, lead_source=lead_source, refresh=refresh)

    cfg = _get_schema("Lead")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if lead_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, FirstName, LastName, Company, Email, Phone, Status, LeadSource, "
                           "Title, Website, Description, AnnualRevenue, NumberOfEmployees")
            records = await sf.query(f"SELECT {form_fields} FROM Lead WHERE Id = '{_sq(lead_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up lead: {exc}")
        if not records:
            return _error_result(f"Lead {lead_id} not found.")
        r = records[0]
        full_name = f"{r.get('FirstName') or ''} {r.get('LastName') or ''}".strip()
        prefill = {
            "first_name": r.get("FirstName") or "", "last_name": r.get("LastName") or "",
            "company": r.get("Company") or "", "email": r.get("Email") or "",
            "phone": r.get("Phone") or "", "status": r.get("Status") or "",
            "lead_source": r.get("LeadSource") or "",
            "title": r.get("Title") or "",
            "annual_revenue": r.get("AnnualRevenue") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for lead: {full_name or lead_id}.")],
            structuredContent={"type": "form", "entity": "lead", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list-of-one
    if lead_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Lead WHERE Id = '{_sq(lead_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch lead: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("lead(s)", items, "Lead"))],
            structuredContent={"type": "leads", "total": len(items), "items": items,
                               "_schema": _get_schema("Lead"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    # `name` is multi-field LIKE (FirstName/LastName) → inline.
    # `campaign_id` is a CampaignMember subquery → inline.
    # `company` goes through the generic helper.
    where_clauses = _build_where_clauses("Lead", {
        "company": company, "email": email, "phone": phone,
        "status": status, "lead_source": lead_source,
    })
    if name:
        where_clauses.append(
            f"(Name LIKE '%{_sq(name)}%' OR FirstName LIKE '%{_sq(name)}%' OR LastName LIKE '%{_sq(name)}%')"
        )
    if campaign_id:
        where_clauses.append(
            f"Id IN (SELECT LeadId FROM CampaignMember WHERE CampaignId = '{_sq(campaign_id)}')"
        )
    has_filters = bool(where_clauses)

    # Cache key — bare or filtered, both go through the same flat cache
    filter_sig = _filter_signature({
        "company": company, "email": email, "phone": phone,
        "status": status, "lead_source": lead_source,
        "name": name, "campaign_id": campaign_id,
    })
    cache_key = f"leads:{filter_sig}" if filter_sig else "leads"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("lead(s)", cached_items, "Lead", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "leads", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Lead"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Lead "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_leads()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching leads: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("lead(s)", items, "Lead"))],
        structuredContent={"type": "leads", "total": len(items), "items": items,
                           "_schema": _get_schema("Lead"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_lead(
    last_name: str = "", company: str = "", first_name: str = "", email: str = "",
    phone: str = "", status: str = "Open - Not Contacted", lead_source: str = "",
    title: str = "", annual_revenue: str = "",
) -> types.CallToolResult:
    missing = [lbl for val, lbl in ((last_name, "last name"), (company, "company")) if not val]
    if missing:
        return _error_result(f"To create a lead I need: {', '.join(missing)}. Or say 'create lead' to open the form.")
    try:
        sf = get_client()
        data: dict = {"LastName": last_name, "Company": company}
        if first_name:     data["FirstName"] = first_name
        if email:          data["Email"] = email
        if phone:          data["Phone"] = phone
        if status:         data["Status"] = status
        if lead_source:    data["LeadSource"] = lead_source
        if title:          data["Title"] = title
        if annual_revenue: data["AnnualRevenue"] = annual_revenue
        new_id = await sf.create("Lead", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Lead", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating lead: {exc}")
    _cache_invalidate("leads")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Lead created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "lead", "record_id": new_id, "message": "Lead created"},
    )


async def sf__update_lead(
    lead_id: str, first_name: str = "", last_name: str = "", company: str = "",
    email: str = "", phone: str = "", status: str = "", lead_source: str = "",
    title: str = "", annual_revenue: str = "",
) -> types.CallToolResult:
    try:
        sf = get_client()
        data: dict = {}
        if first_name:     data["FirstName"] = first_name
        if last_name:      data["LastName"] = last_name
        if company:        data["Company"] = company
        if email:          data["Email"] = email
        if phone:          data["Phone"] = phone
        if status:         data["Status"] = status
        if lead_source:    data["LeadSource"] = lead_source
        if title:          data["Title"] = title
        if annual_revenue: data["AnnualRevenue"] = annual_revenue
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Lead", lead_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Lead", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating lead: {exc}")
    _cache_invalidate("leads")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Lead {lead_id} updated.")],
        structuredContent={"type": "success", "entity": "lead", "record_id": lead_id, "message": "Lead updated"},
    )


async def sf__get_opportunities(
    opportunity_id: str = "",
    account_id: str = "",
    account_name: str = "",
    name: str = "",
    stage: str = "",
    amount_min: str = "",
    amount_max: str = "",
    close_date_from: str = "",
    close_date_to: str = "",
    probability_min: str = "",
    probability_max: str = "",
    type: str = "",
    lead_source: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_opportunities", opportunity_id=opportunity_id, action=action,
             account_id=account_id, account_name=account_name, name=name, stage=stage,
             amount_min=amount_min, amount_max=amount_max,
             close_date_from=close_date_from, close_date_to=close_date_to,
             probability_min=probability_min, probability_max=probability_max,
             type=type, lead_source=lead_source, refresh=refresh)

    cfg = _get_schema("Opportunity")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if opportunity_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, Name, AccountId, Account.Name, StageName, Amount, "
                           "CloseDate, Probability, Type, LeadSource")
            records = await sf.query(f"SELECT {form_fields} FROM Opportunity WHERE Id = '{_sq(opportunity_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up opportunity: {exc}")
        if not records:
            return _error_result(f"Opportunity {opportunity_id} not found.")
        r = records[0]
        prefill = {
            "name": r.get("Name") or "",
            "account_id": r.get("AccountId") or "",
            "account_name": (r.get("Account") or {}).get("Name") or "",
            "stage": r.get("StageName") or "",
            "amount": r.get("Amount") or "",
            "close_date": r.get("CloseDate") or "",
            "probability": r.get("Probability") or "",
            "type": r.get("Type") or "",
            "lead_source": r.get("LeadSource") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for opportunity: {r.get('Name') or opportunity_id}.")],
            structuredContent={"type": "form", "entity": "opportunity", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list view of one
    if opportunity_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Opportunity WHERE Id = '{_sq(opportunity_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch opportunity: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("opportunity(ies)", items, "Opportunity"))],
            structuredContent={"type": "opportunities", "total": len(items), "items": items,
                               "_schema": _get_schema("Opportunity"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    filter_params = {
        "account_id": account_id, "account_name": account_name,
        "name": name, "stage": stage,
        "amount_min": amount_min, "amount_max": amount_max,
        "close_date_from": close_date_from, "close_date_to": close_date_to,
        "probability_min": probability_min, "probability_max": probability_max,
        "type": type, "lead_source": lead_source,
    }
    where_clauses = _build_where_clauses("Opportunity", filter_params)
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature(filter_params)
    cache_key = f"opportunities:{filter_sig}" if filter_sig else "opportunities"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("opportunity(ies)", cached_items, "Opportunity", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "opportunities", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Opportunity"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Opportunity "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_opportunities()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching opportunities: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("opportunity(ies)", items, "Opportunity"))],
        structuredContent={"type": "opportunities", "total": len(items), "items": items,
                           "_schema": _get_schema("Opportunity"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_opportunity(
    name: str = "", stage: str = "", close_date: str = "", amount: float = 0.0,
    probability: int = 0, account_name: str = "",
    type: str = "", lead_source: str = "",
) -> types.CallToolResult:
    missing = [lbl for val, lbl in ((name, "name"), (stage, "stage"), (close_date, "close date")) if not val]
    if missing:
        return _error_result(f"To create an opportunity I need: {', '.join(missing)}. Or say 'create opportunity' to open the form.")
    try:
        sf = get_client()
        data: dict = {"Name": name, "StageName": stage, "CloseDate": close_date}
        if amount:      data["Amount"] = amount
        if probability: data["Probability"] = probability
        if type:        data["Type"] = type
        if lead_source: data["LeadSource"] = lead_source
        if account_name:
            resolved_id, sugg = await _resolve_account(sf, account_name)
            if not resolved_id:
                return _account_not_found_alert(account_name, sugg)
            data["AccountId"] = resolved_id
        new_id = await sf.create("Opportunity", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Opportunity", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating opportunity: {exc}")
    _cache_invalidate("opportunities")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Opportunity created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "opportunity", "record_id": new_id, "message": "Opportunity created"},
    )


async def sf__update_opportunity(
    opportunity_id: str, name: str = "", stage: str = "",
    amount: float = 0.0, close_date: str = "", probability: int = 0,
    type: str = "", lead_source: str = "",
) -> types.CallToolResult:
    try:
        sf = get_client()
        data: dict = {}
        if name:        data["Name"] = name
        if stage:       data["StageName"] = stage
        if amount:      data["Amount"] = amount
        if close_date:  data["CloseDate"] = close_date
        if probability: data["Probability"] = probability
        if type:        data["Type"] = type
        if lead_source: data["LeadSource"] = lead_source
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Opportunity", opportunity_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Opportunity", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating opportunity: {exc}")
    _cache_invalidate("opportunities")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Opportunity {opportunity_id} updated.")],
        structuredContent={"type": "success", "entity": "opportunity", "record_id": opportunity_id, "message": "Opportunity updated"},
    )


async def sf__get_opportunity_products(
    opportunity_id: str,
    refresh: bool = False,
) -> types.CallToolResult:
    """Line items (OpportunityLineItem) on an opportunity."""
    log.info("sf__get_opportunity_products", opportunity_id=opportunity_id, refresh=refresh)
    if not opportunity_id:
        return _error_result("opportunity_id is required.")
    cache_key = f"opportunity_products:{opportunity_id}"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Showing {len(cached_items)} product(s).")],
                structuredContent={"type": "opportunity_products", "opportunity_id": opportunity_id,
                                   "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    soql = (
        f"SELECT Id, Product2.Name, Product2.ProductCode, Quantity, UnitPrice, TotalPrice, "
        f"Description, ServiceDate "
        f"FROM OpportunityLineItem WHERE OpportunityId = '{_sq(opportunity_id)}' "
        f"ORDER BY CreatedDate DESC"
    )
    try:
        sf = get_client()
        records = await sf.query(soql)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Failed to fetch opportunity products: {exc}")
    items = [
        {
            "id":           r.get("Id", ""),
            "name":         (r.get("Product2") or {}).get("Name") or "",
            "code":         (r.get("Product2") or {}).get("ProductCode") or "",
            "quantity":     r.get("Quantity"),
            "unit_price":   r.get("UnitPrice"),
            "total_price":  r.get("TotalPrice"),
            "description":  r.get("Description") or "",
            "service_date": (r.get("ServiceDate") or "")[:10],
        }
        for r in records
    ]
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Showing {len(items)} product(s).")],
        structuredContent={"type": "opportunity_products", "opportunity_id": opportunity_id,
                           "total": len(items), "items": items,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__get_opportunity_contact_roles(
    opportunity_id: str,
    refresh: bool = False,
) -> types.CallToolResult:
    """Contact roles (OpportunityContactRole) on an opportunity — the people on this deal with their roles."""
    log.info("sf__get_opportunity_contact_roles", opportunity_id=opportunity_id, refresh=refresh)
    if not opportunity_id:
        return _error_result("opportunity_id is required.")
    cache_key = f"opportunity_contact_roles:{opportunity_id}"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Showing {len(cached_items)} contact role(s).")],
                structuredContent={"type": "opportunity_contact_roles", "opportunity_id": opportunity_id,
                                   "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    soql = (
        f"SELECT Id, ContactId, Contact.FirstName, Contact.LastName, "
        f"Contact.Email, Contact.Phone, Contact.Title, Role, IsPrimary "
        f"FROM OpportunityContactRole WHERE OpportunityId = '{_sq(opportunity_id)}' "
        f"ORDER BY IsPrimary DESC, CreatedDate DESC"
    )
    try:
        sf = get_client()
        records = await sf.query(soql)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Failed to fetch opportunity contact roles: {exc}")
    items = [
        {
            "id":         r.get("Id", ""),
            "contact_id": r.get("ContactId") or "",
            "first_name": (r.get("Contact") or {}).get("FirstName") or "",
            "last_name":  (r.get("Contact") or {}).get("LastName") or "",
            "email":      (r.get("Contact") or {}).get("Email") or "",
            "phone":      (r.get("Contact") or {}).get("Phone") or "",
            "title":      (r.get("Contact") or {}).get("Title") or "",
            "role":       r.get("Role") or "",
            "is_primary": bool(r.get("IsPrimary")),
        }
        for r in records
    ]
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Showing {len(items)} contact role(s).")],
        structuredContent={"type": "opportunity_contact_roles", "opportunity_id": opportunity_id,
                           "total": len(items), "items": items,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__get_accounts(
    account_id: str = "",
    name: str = "",
    industry: str = "",
    sic: str = "",
    account_number: str = "",
    ticker_symbol: str = "",
    annual_revenue_min: str = "",
    annual_revenue_max: str = "",
    type: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_accounts", account_id=account_id, action=action,
             name=name, industry=industry, sic=sic, account_number=account_number,
             ticker_symbol=ticker_symbol, annual_revenue_min=annual_revenue_min, type=type,
             annual_revenue_max=annual_revenue_max, refresh=refresh)

    cfg = _get_schema("Account")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — explicit id + edit/change intent → return prefilled edit form
    if account_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, Name, Industry, Phone, Website, BillingCity, Type, "
                           "AccountNumber, AnnualRevenue, Sic, TickerSymbol, NumberOfEmployees")
            records = await sf.query(f"SELECT {form_fields} FROM Account WHERE Id = '{_sq(account_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up account: {exc}")
        if not records:
            return _error_result(f"Account {account_id} not found.")
        r = records[0]
        prefill = {
            "name": r.get("Name") or "", "industry": r.get("Industry") or "",
            "phone": r.get("Phone") or "", "website": r.get("Website") or "",
            "billing_city": r.get("BillingCity") or "", "type": r.get("Type") or "",
            "account_number": r.get("AccountNumber") or "",
            "annual_revenue": r.get("AnnualRevenue") or "",
            "sic": r.get("Sic") or "", "ticker_symbol": r.get("TickerSymbol") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for account: {r.get('Name') or account_id}.")],
            structuredContent={"type": "form", "entity": "account", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list view of that single record
    if account_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Account WHERE Id = '{_sq(account_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch account: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("account(s)", items, "Account"))],
            structuredContent={"type": "accounts", "total": len(items), "items": items,
                               "_schema": _get_schema("Account"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    filter_params = {
        "name": name, "industry": industry, "sic": sic,
        "account_number": account_number, "ticker_symbol": ticker_symbol,
        "annual_revenue_min": annual_revenue_min, "annual_revenue_max": annual_revenue_max,
        "type": type,
    }
    where_clauses = _build_where_clauses("Account", filter_params)
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature(filter_params)
    cache_key = f"accounts:{filter_sig}" if filter_sig else "accounts"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("account(s)", cached_items, "Account", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "accounts", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Account"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Account "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_accounts()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except Exception as exc:
        return _error_result(f"Failed to fetch accounts: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("account(s)", items, "Account"))],
        structuredContent={"type": "accounts", "total": len(items), "items": items,
                           "_schema": _get_schema("Account"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


# ── Shared FK lookup helpers (used by create_* tools that accept account_name) ──

async def _resolve_account(sf, name: str) -> tuple[str | None, list[str]]:
    """Single-round FK lookup: find the Account.Id for `name`, or return
    suggestions if it doesn't exist.

    Cost on the happy path is ONE SOQL query (LIKE + exact match are folded
    together — the LIKE result is scanned for an exact name match in
    Python). Failure path is 1 query (when LIKE finds candidates) or 2
    queries (when LIKE finds nothing and we fall back to 5 most recent).

    Returns (account_id, suggestions):
      - account_id is a non-empty string when an exact name match was
        found in the LIKE results; suggestions is empty in that case.
      - account_id is None when no exact match was found; suggestions is
        up to 5 candidate Account names to show in the error message.
    """
    q = _sq(name)
    # LIMIT 6 so an exact match plus up to 5 suggestions can come back in
    # one query; we'd take at most 5 names for the error message regardless.
    results = await sf.query(
        f"SELECT Id, Name FROM Account "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 6"
    )
    for r in results:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    if results:
        return None, [r.get("Name") or "" for r in results if r.get("Name")][:5]
    # No fuzzy hits at all — last-resort fallback to recent accounts so the
    # error still says something useful.
    recent = await sf.query("SELECT Name FROM Account ORDER BY CreatedDate DESC LIMIT 5")
    return None, [r.get("Name") or "" for r in recent if r.get("Name")]


def _account_not_found_msg(name: str, suggestions: list[str]) -> str:
    msg = f"Account '{name}' not found."
    if suggestions:
        msg += f" Did you mean: {', '.join(suggestions)}?"
    return msg


def _account_not_found_alert(name: str, suggestions: list[str]) -> types.CallToolResult:
    """Return account-not-found as an ALERT (non-isError) so Copilot's planner
    doesn't retry the tool call on a fresh session. The widget reads
    structuredContent.type='alert' and renders the suggestion list inline
    without dismissing the form."""
    msg = _account_not_found_msg(name, suggestions)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,                    # widget-facing error flag (NOT the
                                                # top-level CallToolResult.isError —
                                                # that triggers Copilot's retry)
            "title": f"Account '{name}' not found",
            "message": msg,
            "suggestions": suggestions,
            "field": "account_name",
        },
    )


# ── Task polymorphic FK resolution ────────────────────────────────────────────
# Task.WhoId is polymorphic over Contact + Lead (a person).
# Task.WhatId is polymorphic over Account + Opportunity + Campaign (the "thing"
# the task relates to). Case is excluded — it has Subject not Name, so it can't
# share the resolver's exact-name match shape.

async def _resolve_who(sf, name: str) -> tuple[str | None, list[str]]:
    """Find a Contact or Lead by exact Name. Contact takes precedence on tie.
    Returns (id, suggestions) — id non-empty on exact match, suggestions is
    up to 5 fuzzy candidates labelled with their entity type on miss."""
    q = _sq(name)
    contacts = await sf.query(
        f"SELECT Id, Name FROM Contact "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 6"
    )
    for r in contacts:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    leads = await sf.query(
        f"SELECT Id, Name FROM Lead "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 6"
    )
    for r in leads:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    suggestions: list[str] = []
    for r in contacts:
        if r.get("Name"):
            suggestions.append(f"{r['Name']} (Contact)")
    for r in leads:
        if r.get("Name"):
            suggestions.append(f"{r['Name']} (Lead)")
    return None, suggestions[:5]


async def _resolve_what(sf, name: str) -> tuple[str | None, list[str]]:
    """Find an Account, Opportunity, or Campaign by exact Name.
    Account takes precedence on tie. Returns (id, suggestions)."""
    q = _sq(name)
    accts = await sf.query(
        f"SELECT Id, Name FROM Account "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 4"
    )
    for r in accts:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    opps = await sf.query(
        f"SELECT Id, Name FROM Opportunity "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 4"
    )
    for r in opps:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    camps = await sf.query(
        f"SELECT Id, Name FROM Campaign "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 4"
    )
    for r in camps:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    suggestions: list[str] = []
    for r in accts:
        if r.get("Name"):
            suggestions.append(f"{r['Name']} (Account)")
    for r in opps:
        if r.get("Name"):
            suggestions.append(f"{r['Name']} (Opportunity)")
    for r in camps:
        if r.get("Name"):
            suggestions.append(f"{r['Name']} (Campaign)")
    return None, suggestions[:5]


def _who_not_found_alert(name: str, suggestions: list[str]) -> types.CallToolResult:
    """Alert when Task.WhoId can't be resolved from a person's name (Contact
    or Lead). Same shape as _account_not_found_alert — no top-level isError,
    structuredContent.type='alert' for the widget."""
    msg = f"No Contact or Lead named '{name}' found."
    if suggestions:
        msg += f" Did you mean: {', '.join(suggestions)}?"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,
            "title": f"Person '{name}' not found",
            "message": msg,
            "suggestions": suggestions,
            "field": "who_name",
        },
    )


async def _resolve_contact(sf, name: str) -> tuple[str | None, list[str]]:
    """Find a Contact by exact Name. Returns (id, suggestions). Distinct from
    _resolve_who which also searches Lead — Case.ContactId only points at
    Contact records, not Leads."""
    q = _sq(name)
    results = await sf.query(
        f"SELECT Id, Name FROM Contact "
        f"WHERE Name LIKE '%{q}%' OR Name LIKE '{q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 6"
    )
    for r in results:
        if (r.get("Name") or "") == name:
            return r["Id"], []
    if results:
        return None, [r.get("Name") or "" for r in results if r.get("Name")][:5]
    recent = await sf.query("SELECT Name FROM Contact ORDER BY CreatedDate DESC LIMIT 5")
    return None, [r.get("Name") or "" for r in recent if r.get("Name")]


def _contact_not_found_alert(name: str, suggestions: list[str]) -> types.CallToolResult:
    """Alert when a Contact reference (e.g. Case.ContactId, Opportunity primary
    contact) can't be resolved from a name."""
    msg = f"Contact '{name}' not found."
    if suggestions:
        msg += f" Did you mean: {', '.join(suggestions)}?"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,
            "title": f"Contact '{name}' not found",
            "message": msg,
            "suggestions": suggestions,
            "field": "contact_name",
        },
    )


def _what_not_found_alert(name: str, suggestions: list[str]) -> types.CallToolResult:
    """Alert when Task.WhatId can't be resolved from a related-record name
    (Account / Opportunity / Campaign)."""
    msg = f"No Account, Opportunity, or Campaign named '{name}' found."
    if suggestions:
        msg += f" Did you mean: {', '.join(suggestions)}?"
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=msg)],
        structuredContent={
            "type": "alert",
            "level": "warning",
            "isError": True,
            "title": f"Related record '{name}' not found",
            "message": msg,
            "suggestions": suggestions,
            "field": "what_name",
        },
    )


async def sf__create_account(
    name: str = "", industry: str = "", phone: str = "",
    website: str = "", billing_city: str = "", type: str = "",
    account_number: str = "", annual_revenue: str = "",
    sic: str = "", ticker_symbol: str = "",
) -> types.CallToolResult:
    if not name:
        return _error_result("To create an account I need: name. Or say 'create account' to open the form.")
    try:
        sf = get_client()
        data: dict = {"Name": name}
        if industry:        data["Industry"] = industry
        if phone:           data["Phone"] = phone
        if website:         data["Website"] = website
        if billing_city:    data["BillingCity"] = billing_city
        if type:            data["Type"] = type
        if account_number:  data["AccountNumber"] = account_number
        if annual_revenue:  data["AnnualRevenue"] = annual_revenue
        if sic:             data["Sic"] = sic
        if ticker_symbol:   data["TickerSymbol"] = ticker_symbol
        new_id = await sf.create("Account", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Account", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating account: {exc}")
    _cache_invalidate("accounts")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Account '{name}' created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "account", "record_id": new_id, "message": "Account created"},
    )


async def sf__update_account(
    account_id: str, name: str = "", industry: str = "", phone: str = "",
    website: str = "", billing_city: str = "", type: str = "",
    account_number: str = "", annual_revenue: str = "",
    sic: str = "", ticker_symbol: str = "",
) -> types.CallToolResult:
    try:
        sf = get_client()
        data: dict = {}
        if name:            data["Name"] = name
        if industry:        data["Industry"] = industry
        if phone:           data["Phone"] = phone
        if website:         data["Website"] = website
        if billing_city:    data["BillingCity"] = billing_city
        if type:            data["Type"] = type
        if account_number:  data["AccountNumber"] = account_number
        if annual_revenue:  data["AnnualRevenue"] = annual_revenue
        if sic:             data["Sic"] = sic
        if ticker_symbol:   data["TickerSymbol"] = ticker_symbol
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Account", account_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Account", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating account: {exc}")
    _cache_invalidate("accounts")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Account {account_id} updated.")],
        structuredContent={"type": "success", "entity": "account", "record_id": account_id, "message": "Account updated"},
    )


async def sf__get_contacts(
    contact_id: str = "",
    account_id: str = "",
    account_name: str = "",
    name: str = "",
    title: str = "",
    department: str = "",
    lead_source: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_contacts", contact_id=contact_id, action=action,
             account_id=account_id, account_name=account_name, name=name,
             title=title, department=department, lead_source=lead_source, refresh=refresh)

    cfg = _get_schema("Contact")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if contact_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, FirstName, LastName, Email, Phone, Title, "
                           "AccountId, Account.Name, Department, LeadSource")
            records = await sf.query(f"SELECT {form_fields} FROM Contact WHERE Id = '{_sq(contact_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up contact: {exc}")
        if not records:
            return _error_result(f"Contact {contact_id} not found.")
        r = records[0]
        prefill = {
            "first_name": r.get("FirstName") or "",
            "last_name": r.get("LastName") or "",
            "email": r.get("Email") or "",
            "phone": r.get("Phone") or "",
            "title": r.get("Title") or "",
            "account_id": r.get("AccountId") or "",
            "account_name": (r.get("Account") or {}).get("Name") or "",
            "department": r.get("Department") or "",
            "lead_source": r.get("LeadSource") or "",
        }
        full_name = f"{r.get('FirstName') or ''} {r.get('LastName') or ''}".strip()
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for contact: {full_name or contact_id}.")],
            structuredContent={"type": "form", "entity": "contact", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list-of-one
    if contact_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Contact WHERE Id = '{_sq(contact_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch contact: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("contact(s)", items, "Contact"))],
            structuredContent={"type": "contacts", "total": len(items), "items": items,
                               "_schema": _get_schema("Contact"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    # `name` is multi-field LIKE (FirstName/LastName) → handled inline.
    # `account_id` goes through the generic helper.
    where_clauses = _build_where_clauses("Contact", {
        "account_id": account_id, "account_name": account_name,
        "title": title, "department": department, "lead_source": lead_source,
    })
    if name:
        where_clauses.append(
            f"(Name LIKE '%{_sq(name)}%' OR FirstName LIKE '%{_sq(name)}%' OR LastName LIKE '%{_sq(name)}%')"
        )
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature({
        "account_id": account_id, "account_name": account_name,
        "title": title, "department": department, "lead_source": lead_source, "name": name,
    })
    cache_key = f"contacts:{filter_sig}" if filter_sig else "contacts"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("contact(s)", cached_items, "Contact", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "contacts", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Contact"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Contact "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_contacts()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except Exception as exc:
        return _error_result(f"Failed to fetch contacts: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("contact(s)", items, "Contact"))],
        structuredContent={"type": "contacts", "total": len(items), "items": items,
                           "_schema": _get_schema("Contact"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_contact(
    last_name: str = "", first_name: str = "", email: str = "",
    phone: str = "", title: str = "", account_id: str = "",
    account_name: str = "",
    department: str = "", lead_source: str = "",
) -> types.CallToolResult:
    if not last_name:
        return _error_result("To create a contact I need: last name. Or say 'create contact' to open the form.")
    try:
        sf = get_client()
        data: dict = {"LastName": last_name}
        if first_name:  data["FirstName"] = first_name
        if email:       data["Email"] = email
        if phone:       data["Phone"] = phone
        if title:       data["Title"] = title
        if account_id:  data["AccountId"] = account_id
        if department:  data["Department"] = department
        if lead_source: data["LeadSource"] = lead_source
        if account_name and not account_id:
            resolved_id, sugg = await _resolve_account(sf, account_name)
            if not resolved_id:
                return _account_not_found_alert(account_name, sugg)
            data["AccountId"] = resolved_id
        new_id = await sf.create("Contact", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Contact", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating contact: {exc}")
    _cache_invalidate("contacts")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Contact '{first_name} {last_name}' created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "contact", "record_id": new_id, "message": "Contact created"},
    )


async def sf__update_contact(
    contact_id: str, first_name: str = "", last_name: str = "", email: str = "",
    phone: str = "", title: str = "", account_id: str = "",
    department: str = "", lead_source: str = "",
) -> types.CallToolResult:
    try:
        sf = get_client()
        data: dict = {}
        if first_name:  data["FirstName"] = first_name
        if last_name:   data["LastName"] = last_name
        if email:       data["Email"] = email
        if phone:       data["Phone"] = phone
        if title:       data["Title"] = title
        if account_id:  data["AccountId"] = account_id
        if department:  data["Department"] = department
        if lead_source: data["LeadSource"] = lead_source
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Contact", contact_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Contact", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating contact: {exc}")
    _cache_invalidate("contacts")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Contact {contact_id} updated.")],
        structuredContent={"type": "success", "entity": "contact", "record_id": contact_id, "message": "Contact updated"},
    )


async def sf__get_cases(
    case_id: str = "",
    account_id: str = "",
    account_name: str = "",
    subject: str = "",
    case_number: str = "",
    priority: str = "",
    status: str = "",
    type: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_cases", case_id=case_id, action=action, account_id=account_id,
             account_name=account_name, subject=subject, case_number=case_number,
             priority=priority, status=status, type=type, refresh=refresh)

    cfg = _get_schema("Case")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if case_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, CaseNumber, Subject, Status, Priority, Type, "
                           "AccountId, Account.Name, Description")
            records = await sf.query(f"SELECT {form_fields} FROM Case WHERE Id = '{_sq(case_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up case: {exc}")
        if not records:
            return _error_result(f"Case {case_id} not found.")
        r = records[0]
        account = r.get("Account") or {}
        prefill = {
            "subject": r.get("Subject") or "",
            "status": r.get("Status") or "",
            "priority": r.get("Priority") or "",
            "type": r.get("Type") or "",
            "account_id": r.get("AccountId") or "",
            "account_name": account.get("Name") or "",
            "description": r.get("Description") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for case: {r.get('CaseNumber') or case_id}.")],
            structuredContent={"type": "form", "entity": "case", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list-of-one
    if case_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Case WHERE Id = '{_sq(case_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch case: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("case(s)", items, "Case"))],
            structuredContent={"type": "cases", "total": len(items), "items": items,
                               "_schema": _get_schema("Case"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    filter_params = {
        "account_id": account_id, "account_name": account_name,
        "subject": subject, "case_number": case_number,
        "priority": priority, "status": status, "type": type,
    }
    where_clauses = _build_where_clauses("Case", filter_params)
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature(filter_params)
    cache_key = f"cases:{filter_sig}" if filter_sig else "cases"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("case(s)", cached_items, "Case", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "cases", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Case"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Case "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_cases()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching cases: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("case(s)", items, "Case"))],
        structuredContent={"type": "cases", "total": len(items), "items": items,
                           "_schema": _get_schema("Case"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_case(
    subject: str = "", priority: str = "Medium", status: str = "",
    account_id: str = "", account_name: str = "",
    contact_id: str = "", contact_name: str = "",
    description: str = "", type: str = "",
) -> types.CallToolResult:
    if not subject:
        return _error_result("To create a case I need: subject. Or say 'create case' to open the form.")
    log.info("sf__create_case", subject=subject, account_name=account_name, contact_name=contact_name)
    try:
        sf = get_client()
        data: dict = {"Subject": subject, "Priority": priority}
        if status:      data["Status"] = status
        if account_id:  data["AccountId"] = account_id
        if contact_id:  data["ContactId"] = contact_id
        if description: data["Description"] = description
        if type:        data["Type"] = type
        if account_name and not account_id:
            resolved_id, sugg = await _resolve_account(sf, account_name)
            if not resolved_id:
                return _account_not_found_alert(account_name, sugg)
            data["AccountId"] = resolved_id
        if contact_name and not contact_id:
            resolved_id, sugg = await _resolve_contact(sf, contact_name)
            if not resolved_id:
                return _contact_not_found_alert(contact_name, sugg)
            data["ContactId"] = resolved_id
        new_id = await sf.create("Case", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Case", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating case: {exc}")
    _cache_invalidate("cases")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Case created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "case", "record_id": new_id, "message": "Case created"},
    )


async def sf__update_case(
    case_id: str, status: str = "", priority: str = "",
    subject: str = "", description: str = "", resolution: str = "",
    type: str = "",
) -> types.CallToolResult:
    log.info("sf__update_case", case_id=case_id)
    try:
        sf = get_client()
        data: dict = {}
        if status:      data["Status"] = status
        if priority:    data["Priority"] = priority
        if subject:     data["Subject"] = subject
        if description: data["Description"] = description
        if resolution:  data["Comments"] = resolution
        if type:        data["Type"] = type
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Case", case_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Case", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating case: {exc}")
    _cache_invalidate("cases")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Case {case_id} updated.")],
        structuredContent={"type": "success", "entity": "case", "record_id": case_id, "message": "Case updated"},
    )


async def sf__get_case_activity(case_id: str) -> types.CallToolResult:
    """Activity on a case = comments + related tasks, fetched in parallel."""
    import asyncio
    log.info("sf__get_case_activity", case_id=case_id)
    case_id_esc = _sq(case_id)
    comments_soql = (
        f"SELECT Id, CommentBody, CreatedDate, CreatedBy.Name "
        f"FROM CaseComment WHERE ParentId = '{case_id_esc}' "
        f"ORDER BY CreatedDate DESC LIMIT 20"
    )
    tasks_soql = (
        f"SELECT Id, Subject, Status, Priority, ActivityDate, Owner.Name "
        f"FROM Task WHERE WhatId = '{case_id_esc}' "
        f"ORDER BY CreatedDate DESC LIMIT 20"
    )
    try:
        sf = get_client()
        comments_recs, tasks_recs = await asyncio.gather(
            sf.query(comments_soql),
            sf.query(tasks_soql),
        )
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except Exception as exc:
        return _error_result(f"Failed to fetch case activity: {exc}")
    comments = [
        {"id": r.get("Id", ""), "body": r.get("CommentBody") or "",
         "author": (r.get("CreatedBy") or {}).get("Name") or "",
         "created_date": (r.get("CreatedDate") or "")[:10]}
        for r in comments_recs
    ]
    tasks = [
        {"id": r.get("Id", ""), "subject": r.get("Subject") or "",
         "status": r.get("Status") or "", "priority": r.get("Priority") or "",
         "activity_date": r.get("ActivityDate") or "",
         "owner": (r.get("Owner") or {}).get("Name") or ""}
        for r in tasks_recs
    ]
    summary = f"{len(comments)} comment(s), {len(tasks)} task(s) on case {case_id}."
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent={
            "type": "case_activity", "case_id": case_id,
            "comments": comments, "tasks": tasks,
        },
    )


async def sf__get_tasks(
    task_id: str = "",
    subject: str = "",
    status: str = "",
    priority: str = "",
    activity_date_from: str = "",
    activity_date_to: str = "",
    related_name: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_tasks", task_id=task_id, action=action, subject=subject,
             status=status, priority=priority,
             activity_date_from=activity_date_from, activity_date_to=activity_date_to,
             related_name=related_name, refresh=refresh)

    cfg = _get_schema("Task")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if task_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = ("Id, Subject, Status, Priority, ActivityDate, Description, "
                           "WhoId, Who.Name, WhatId, What.Name")
            records = await sf.query(f"SELECT {form_fields} FROM Task WHERE Id = '{_sq(task_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error looking up task: {exc}")
        if not records:
            return _error_result(f"Task {task_id} not found.")
        r = records[0]
        who = r.get("Who") or {}
        what = r.get("What") or {}
        prefill = {
            "subject": r.get("Subject") or "",
            "status": r.get("Status") or "",
            "priority": r.get("Priority") or "",
            "activity_date": (r.get("ActivityDate") or "")[:10],
            "description": r.get("Description") or "",
            "who_id": r.get("WhoId") or "",
            "who_name": who.get("Name") or "",
            "what_id": r.get("WhatId") or "",
            "what_name": what.get("Name") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for task: {r.get('Subject') or task_id}.")],
            structuredContent={"type": "form", "entity": "task", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list-of-one
    if task_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Task WHERE Id = '{_sq(task_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch task: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("task(s)", items, "Task"))],
            structuredContent={"type": "tasks", "total": len(items), "items": items,
                               "_schema": _get_schema("Task"), "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list
    # `related_name` is a polymorphic dot-walk on Who/What → handled inline.
    # SOQL exposes only Id/Name/Type through a polymorphic FK, but Name is
    # what we want here, and dot-walk clauses (unlike semi-join subqueries)
    # CAN be combined with OR. Targets without a Name field (e.g. Case)
    # return null and simply don't match — no error.
    task_filters = {
        "subject": subject, "status": status, "priority": priority,
        "activity_date_from": activity_date_from, "activity_date_to": activity_date_to,
    }
    where_clauses = _build_where_clauses("Task", task_filters)
    if related_name:
        n = _sq(related_name)
        where_clauses.append(
            f"(What.Name LIKE '%{n}%' OR Who.Name LIKE '%{n}%')"
        )
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature({**task_filters, "related_name": related_name})
    cache_key = f"tasks:{filter_sig}" if filter_sig else "tasks"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("task(s)", cached_items, "Task", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "tasks", "total": len(cached_items), "items": cached_items,
                                   "_schema": _get_schema("Task"), "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Task "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_tasks()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching tasks: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("task(s)", items, "Task"))],
        structuredContent={"type": "tasks", "total": len(items), "items": items,
                           "_schema": _get_schema("Task"), "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_task(
    subject: str = "", priority: str = "Normal", status: str = "Not Started",
    activity_date: str = "", description: str = "",
    who_name: str = "", what_name: str = "",
) -> types.CallToolResult:
    if not subject:
        return _error_result("To create a task I need: subject. Or say 'create task' to open the form.")
    log.info("sf__create_task", subject=subject, who_name=who_name, what_name=what_name)
    try:
        sf = get_client()
        data: dict = {"Subject": subject, "Priority": priority, "Status": status}
        if activity_date: data["ActivityDate"] = activity_date
        if description:   data["Description"] = description
        # Polymorphic FK resolution by name. Either or both may be supplied.
        if who_name:
            resolved_id, sugg = await _resolve_who(sf, who_name)
            if not resolved_id:
                return _who_not_found_alert(who_name, sugg)
            data["WhoId"] = resolved_id
        if what_name:
            resolved_id, sugg = await _resolve_what(sf, what_name)
            if not resolved_id:
                return _what_not_found_alert(what_name, sugg)
            data["WhatId"] = resolved_id
        new_id = await sf.create("Task", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Task", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating task: {exc}")
    _cache_invalidate("tasks")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Task created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "task", "record_id": new_id, "message": "Task created"},
    )


async def sf__update_task(
    task_id: str, subject: str = "", priority: str = "", status: str = "",
    activity_date: str = "", description: str = "",
) -> types.CallToolResult:
    log.info("sf__update_task", task_id=task_id)
    try:
        sf = get_client()
        data: dict = {}
        if subject:       data["Subject"] = subject
        if priority:      data["Priority"] = priority
        if status:        data["Status"] = status
        if activity_date: data["ActivityDate"] = activity_date
        if description:   data["Description"] = description
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Task", task_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Task", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating task: {exc}")
    _cache_invalidate("tasks")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Task {task_id} updated.")],
        structuredContent={"type": "success", "entity": "task", "record_id": task_id, "message": "Task updated"},
    )


async def sf__convert_lead(
    lead_id: str,
    account_id: str = "",
    contact_id: str = "",
    do_not_create_opportunity: bool = False,
    opportunity_name: str = "",
    converted_status: str = "",
) -> types.CallToolResult:
    """Atomic Lead → Account + Contact (+ Opportunity) via SOAP convertLead.
    On success, pivots to the new Opportunity widget (single-row list view).
    """
    log.info("sf__convert_lead", lead_id=lead_id, account_id=account_id,
             contact_id=contact_id, do_not_create_opportunity=do_not_create_opportunity)
    if not lead_id:
        return _error_result("lead_id is required.")
    try:
        sf = get_client()
        # Auto-resolve a converted status if caller didn't supply one
        if not converted_status:
            status_recs = await sf.query(
                "SELECT MasterLabel FROM LeadStatus "
                "WHERE IsConverted=true ORDER BY SortOrder ASC NULLS LAST LIMIT 1"
            )
            if not status_recs:
                return _error_result("No LeadStatus with IsConverted=true found in this org.")
            converted_status = status_recs[0]["MasterLabel"]

        result = await sf.convert_lead_soap(
            lead_id=lead_id,
            converted_status=converted_status,
            account_id=account_id,
            contact_id=contact_id,
            do_not_create_opportunity=do_not_create_opportunity,
            opportunity_name=opportunity_name,
        )
        if not result["success"]:
            errors = result.get("errors") or ["unknown error"]
            return _error_result("Lead convert failed: " + "; ".join(errors))

        new_account_id = result["accountId"]
        new_contact_id = result["contactId"]
        new_opp_id     = result["opportunityId"]
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Failed to convert lead: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error converting lead: {exc}")

    _cache_invalidate("leads")
    _cache_invalidate("opportunities")

    # Pivot to the new opportunity widget if one was created
    if new_opp_id:
        try:
            opp_result = await sf__get_opportunities(opportunity_id=new_opp_id)
        except Exception:
            opp_result = None
        sc = getattr(opp_result, "structuredContent", None) if opp_result else None
        if sc and sc.get("type") == "opportunities":
            return types.CallToolResult(
                content=[types.TextContent(type="text",
                    text=f"Lead converted. New Account {new_account_id}, Contact {new_contact_id}. "
                         f"Showing the new opportunity below.")],
                structuredContent=sc,
            )

    # No opportunity (do_not_create_opportunity=True) or pivot fetch failed —
    # fall back to a textual success card
    return types.CallToolResult(
        content=[types.TextContent(type="text",
            text=f"Lead converted. Account {new_account_id}, Contact {new_contact_id}. "
                 f"Opportunity: {new_opp_id or 'not created'}.")],
        structuredContent={"type": "success", "entity": "lead", "record_id": lead_id,
                           "message": "Lead converted",
                           "converted": {"account_id": new_account_id,
                                         "contact_id": new_contact_id,
                                         "opportunity_id": new_opp_id}},
    )


async def sf__get_pipeline_dashboard() -> types.CallToolResult:
    log.info("sf__get_pipeline_dashboard")
    try:
        sf = get_client()
        stage_records = await sf.query(
            "SELECT StageName, COUNT(Id) cnt, SUM(Amount) amount "
            "FROM Opportunity WHERE IsClosed = false "
            "GROUP BY StageName ORDER BY StageName"
        )
        won_records = await sf.query(
            "SELECT SUM(Amount) total FROM Opportunity "
            "WHERE StageName = 'Closed Won' AND CloseDate = THIS_MONTH"
        )
        lost_records = await sf.query(
            "SELECT SUM(Amount) total FROM Opportunity "
            "WHERE StageName = 'Closed Lost' AND CloseDate = THIS_MONTH"
        )
        top_id_records = await sf.query(
            "SELECT AccountId, SUM(Amount) amount "
            "FROM Opportunity WHERE IsClosed = false AND AccountId != null "
            "GROUP BY AccountId ORDER BY SUM(Amount) DESC LIMIT 5"
        )
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching pipeline: {exc}")

    # Resolve account names in a second query
    top_accounts = []
    if top_id_records:
        try:
            acct_ids = [r["AccountId"] for r in top_id_records if r.get("AccountId")]
            ids_clause = "', '".join(acct_ids)
            name_records = await sf.query(f"SELECT Id, Name FROM Account WHERE Id IN ('{ids_clause}')")
            name_map = {r["Id"]: r.get("Name", "") for r in name_records}
            top_accounts = [
                {"id": r.get("AccountId") or "", "name": name_map.get(r.get("AccountId"), ""), "amount": r.get("amount") or 0.0}
                for r in top_id_records
            ]
        except Exception:
            top_accounts = [{"id": r.get("AccountId") or "", "name": "", "amount": r.get("amount") or 0.0} for r in top_id_records]

    stages = [{"stage": r.get("StageName") or "", "count": r.get("cnt") or 0, "amount": r.get("amount") or 0.0} for r in stage_records]
    total_amount = sum(s["amount"] for s in stages)
    closed_won  = (won_records[0].get("total")  or 0.0) if won_records  else 0.0
    closed_lost = (lost_records[0].get("total") or 0.0) if lost_records else 0.0
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Pipeline: {len(stages)} stage(s), ${total_amount:,.0f} total.")],
        structuredContent={
            "type": "sales_dashboard",
            "pipeline_by_stage": stages,
            "closed_won_this_month": closed_won,
            "closed_lost_this_month": closed_lost,
            "top_accounts": top_accounts,
            "total_amount": total_amount,
        },
    )


async def sf__get_campaigns(
    campaign_id: str = "",
    name: str = "",
    status: str = "",
    type: str = "",
    action: str = "",
    refresh: bool = False,
) -> types.CallToolResult:
    log.info("sf__get_campaigns", campaign_id=campaign_id, name=name,
             status=status, type=type, action=action, refresh=refresh)

    cfg = _get_schema("Campaign")
    columns = cfg.get("columns", []) + cfg.get("hiddenColumns", [])
    api_names = ["Id"] + [c["apiName"] for c in columns if c["apiName"] != "Id"]

    # Branch 1 — id + action="edit"/"change" → form
    if campaign_id and action in ("edit", "change"):
        try:
            sf = get_client()
            form_fields = "Id, Name, Status, Type, StartDate, EndDate, BudgetedCost, ActualCost"
            records = await sf.query(f"SELECT {form_fields} FROM Campaign WHERE Id = '{_sq(campaign_id)}' LIMIT 1")
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Error fetching campaign: {exc}")
        if not records:
            return _error_result(f"Campaign {campaign_id} not found.")
        r = records[0]
        prefill = {
            "name": r.get("Name") or "",
            "status": r.get("Status") or "",
            "type": r.get("Type") or "",
            "start_date": r.get("StartDate") or "",
            "end_date": r.get("EndDate") or "",
            "budgeted_cost": r.get("BudgetedCost") or "",
            "actual_cost": r.get("ActualCost") or "",
        }
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=f"Opening edit form for campaign: {r.get('Name') or campaign_id}.")],
            structuredContent={"type": "form", "entity": "campaign", "mode": "edit",
                               "recordId": r.get("Id", ""), "prefill": prefill},
        )

    # Branch 2 — id alone → list-of-one
    if campaign_id:
        try:
            sf = get_client()
            soql = f"SELECT {', '.join(api_names)} FROM Campaign WHERE Id = '{_sq(campaign_id)}' LIMIT 1"
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        except SalesforceAuthError as exc:
            return _error_result(f"Salesforce authentication failed: {exc}")
        except Exception as exc:
            return _error_result(f"Failed to fetch campaign: {exc}")
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_list_summary("campaign(s)", items, "Campaign"))],
            structuredContent={"type": "campaigns", "total": len(items), "items": items,
                               "_cache": {"hit": False, "cached_at": _now_iso()}},
        )

    # Branch 3 — filter-based list (name LIKE)
    campaign_filters = {"name": name, "status": status, "type": type}
    where_clauses = _build_where_clauses("Campaign", campaign_filters)
    has_filters = bool(where_clauses)

    filter_sig = _filter_signature(campaign_filters)
    cache_key = f"campaigns:{filter_sig}" if filter_sig else "campaigns"
    if not refresh:
        cached_items, stored_at = _cache_get(cache_key)
        if cached_items is not None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=_list_summary("campaign(s)", cached_items, "Campaign", cache_hit=True, cached_at=stored_at))],
                structuredContent={"type": "campaigns", "total": len(cached_items), "items": cached_items,
                                   "_cache": {"hit": True, "cached_at": stored_at}},
            )
    try:
        if has_filters:
            soql = (f"SELECT {', '.join(api_names)} FROM Campaign "
                    f"WHERE {' AND '.join(where_clauses)} ORDER BY CreatedDate DESC LIMIT 20")
            sf = get_client()
            records = await sf.query(soql)
            items = [_flatten_record(r, columns) for r in records]
        else:
            items = await _fetch_campaigns()
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching campaigns: {exc}")
    cached_at = _cache_set(cache_key, items)
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=_list_summary("campaign(s)", items, "Campaign"))],
        structuredContent={"type": "campaigns", "total": len(items), "items": items,
                           "_cache": {"hit": False, "cached_at": cached_at}},
    )


async def sf__create_campaign(
    name: str = "", status: str = "Planned", type: str = "",
    start_date: str = "", end_date: str = "",
    budgeted_cost: str = "", actual_cost: str = "",
) -> types.CallToolResult:
    if not name:
        return _error_result("To create a campaign I need: name. Or say 'create campaign' to open the form.")
    try:
        sf = get_client()
        data: dict = {"Name": name}
        if status:        data["Status"] = status
        if type:          data["Type"] = type
        if start_date:    data["StartDate"] = start_date
        if end_date:      data["EndDate"] = end_date
        if budgeted_cost: data["BudgetedCost"] = budgeted_cost
        if actual_cost:   data["ActualCost"] = actual_cost
        new_id = await sf.create("Campaign", data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("create", "Campaign", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error creating campaign: {exc}")
    _cache_invalidate("campaigns")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Campaign created (Id: {new_id}).")],
        structuredContent={"type": "success", "entity": "campaign", "record_id": new_id, "message": "Campaign created"},
    )


async def sf__update_campaign(
    campaign_id: str, name: str = "", status: str = "", type: str = "",
    start_date: str = "", end_date: str = "",
    budgeted_cost: str = "", actual_cost: str = "",
) -> types.CallToolResult:
    try:
        sf = get_client()
        data: dict = {}
        if name:          data["Name"] = name
        if status:        data["Status"] = status
        if type:          data["Type"] = type
        if start_date:    data["StartDate"] = start_date
        if end_date:      data["EndDate"] = end_date
        if budgeted_cost: data["BudgetedCost"] = budgeted_cost
        if actual_cost:   data["ActualCost"] = actual_cost
        if not data: return _error_result("No fields provided to update.")
        await sf.update("Campaign", campaign_id, data)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _sf_api_alert("update", "Campaign", exc)
    except Exception as exc:
        return _error_result(f"Unexpected error updating campaign: {exc}")
    _cache_invalidate("campaigns")
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Campaign {campaign_id} updated.")],
        structuredContent={"type": "success", "entity": "campaign", "record_id": campaign_id, "message": "Campaign updated"},
    )


async def sf__get_pending_approvals(
    submitted_by: str = "",
    target_type: str = "",
) -> types.CallToolResult:
    log.info("sf__get_pending_approvals", submitted_by=submitted_by, target_type=target_type)
    try:
        sf = get_client()
        soql = (
            "SELECT Id, ProcessInstance.TargetObjectId, "
            "ProcessInstance.Status, ProcessInstance.TargetObject.Name, "
            "ProcessInstance.CreatedBy.Name, CreatedDate "
            "FROM ProcessInstanceWorkitem "
            "WHERE ProcessInstance.Status = 'Pending' "
            "ORDER BY CreatedDate DESC LIMIT 20"
        )
        records = await sf.query(soql)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Salesforce API error: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error fetching approvals: {exc}")

    # Derive object type from TargetObjectId prefix
    _PREFIX_TYPE = {"001": "Account", "003": "Contact", "006": "Opportunity",
                    "500": "Case", "00Q": "Lead", "00T": "Task", "701": "Campaign"}

    items = []
    for r in records:
        pi = r.get("ProcessInstance") or {}
        target_id = pi.get("TargetObjectId") or ""
        obj_type = _PREFIX_TYPE.get(target_id[:3], "Record")
        submitter = (pi.get("CreatedBy") or {}).get("Name") or ""
        item = {
            "id": r.get("Id"),
            "target_id": target_id,
            "target_name": (pi.get("TargetObject") or {}).get("Name") or "",
            "target_type": obj_type,
            "submitted_by": submitter,
            "status": pi.get("Status") or "",
            "created_date": r.get("CreatedDate") or "",
        }
        items.append(item)

    # Apply client-side filters
    if submitted_by:
        items = [i for i in items if submitted_by.lower() in i["submitted_by"].lower()]
    if target_type:
        items = [i for i in items if target_type.lower() in i["target_type"].lower()]

    structured = {"type": "approvals", "total": len(items), "items": items}
    if not items:
        summary = "No pending approvals."
    else:
        summary = f"{len(items)} pending approval(s) [salesforce]."
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=summary)],
        structuredContent=structured,
    )


async def _approval_action(approval_id: str, action: str, comments: str) -> dict:
    """Shared POST to /process/approvals with one workitem context."""
    sf = get_client()
    body = {"requests": [{
        "actionType": action,
        "contextId": approval_id,
        "comments": comments or "",
    }]}
    resp = await sf._request("POST", "/process/approvals/", json_body=body)
    sf._raise_for_error(resp, f"approval {action} {approval_id}")
    data = resp.json()
    return data[0] if isinstance(data, list) and data else (data or {})


async def sf__approve_record(
    approval_id: str,
    comments: str = "",
) -> types.CallToolResult:
    """Approve a pending ProcessInstanceWorkitem. approval_id is the workitem
    Id returned by sf__get_pending_approvals as items[].id."""
    log.info("sf__approve_record", approval_id=approval_id)
    if not approval_id:
        return _error_result("approval_id is required.")
    try:
        result = await _approval_action(approval_id, "Approve", comments)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Failed to approve: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error approving: {exc}")
    if not result.get("success", False):
        errs = result.get("errors") or []
        msg = "; ".join(e.get("message", str(e)) for e in errs) or "Unknown approval error"
        return _error_result(f"Approval rejected by Salesforce: {msg}")
    # Re-fetch the pending list so the widget refreshes
    return await sf__get_pending_approvals()


async def sf__reject_record(
    approval_id: str,
    comments: str = "",
) -> types.CallToolResult:
    """Reject a pending ProcessInstanceWorkitem. approval_id is the workitem
    Id returned by sf__get_pending_approvals as items[].id."""
    log.info("sf__reject_record", approval_id=approval_id)
    if not approval_id:
        return _error_result("approval_id is required.")
    try:
        result = await _approval_action(approval_id, "Reject", comments)
    except SalesforceAuthError as exc:
        return _error_result(f"Salesforce authentication failed: {exc}")
    except SalesforceAPIError as exc:
        return _error_result(f"Failed to reject: {exc}")
    except Exception as exc:
        return _error_result(f"Unexpected error rejecting: {exc}")
    if not result.get("success", False):
        errs = result.get("errors") or []
        msg = "; ".join(e.get("message", str(e)) for e in errs) or "Unknown rejection error"
        return _error_result(f"Rejection failed: {msg}")
    return await sf__get_pending_approvals()


async def sf__show_create_form(entity: str, prefill: dict = None, fk_options: dict = None) -> types.CallToolResult:
    structured: dict = {"type": "form", "entity": entity}
    if prefill:
        structured["prefill"] = prefill
    if fk_options:
        structured["fkSelections"] = fk_options
    label = entity.replace("_", " ").title()
    return types.CallToolResult(
        content=[types.TextContent(type="text", text=f"Opening {label} creation form.")],
        structuredContent=structured,
    )


# ── Prompt handlers ───────────────────────────────────────────────────────────

def show_leads_prompt() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text", text=(
        "Show me the latest 5 leads from Salesforce. Call get_leads and display the results in the widget."
    )))]


def show_opportunities_prompt() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text", text=(
        "Show me the latest 5 opportunities from Salesforce. Call get_opportunities and display the results in the widget."
    )))]


def manage_crm_prompt() -> list[PromptMessage]:
    return [PromptMessage(role="user", content=TextContent(type="text", text=(
        "I want to manage my Salesforce CRM data. "
        "Start by showing me the latest 5 leads with get_leads. "
        "I may want to create new leads, edit existing ones, "
        "or switch to viewing opportunities, accounts, or contacts."
    )))]


# ── Registries ────────────────────────────────────────────────────────────────

_TOOL_SPECS_LIST = [
    {"name": "sf__get_leads",             "description": "Get Salesforce Leads (5 most recent). Pass lead_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: name, company, campaign_id, email, phone, status, lead_source.", "handler": sf__get_leads},
    {"name": "sf__create_lead",           "description": "Create a new Lead in Salesforce. Requires last_name and company. Optional: first_name, email, phone, status, lead_source, title, annual_revenue.", "handler": sf__create_lead},
    {"name": "sf__update_lead",           "description": "Update an existing Lead in Salesforce by its record Id. Only fields provided will be updated. Fields: first_name, last_name, company, email, phone, status, lead_source, title, annual_revenue.", "handler": sf__update_lead},
    {"name": "sf__get_opportunities",     "description": "Get Salesforce Opportunities (5 most recent). Pass opportunity_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: account_id, account_name (parent-traversal LIKE on Account.Name — e.g. 'opps for Acme'), name, stage, amount_min, amount_max, close_date_from, close_date_to, probability_min, probability_max, type, lead_source.", "handler": sf__get_opportunities},
    {"name": "sf__create_opportunity",    "description": "Create a new Opportunity in Salesforce. Requires name, stage, close_date. Optional: amount, probability, account_name (server resolves to AccountId; errors with suggestions if not found), type, lead_source.", "handler": sf__create_opportunity},
    {"name": "sf__update_opportunity",    "description": "Update an existing Opportunity in Salesforce by its record Id. Only fields provided will be updated. Fields: name, stage, amount, close_date, probability, type, lead_source. (Account is not reassignable from this tool — it is read-only on the edit form.)", "handler": sf__update_opportunity},
    {"name": "sf__get_opportunity_products",      "description": "Get line items (products) on an opportunity. Required: opportunity_id. Returns Product Name, Code, Quantity, Unit Price, Total Price.", "handler": sf__get_opportunity_products},
    {"name": "sf__get_opportunity_contact_roles", "description": "Get contact roles on an opportunity — the people directly attached to this deal with their roles (Decision Maker, Influencer, etc.) and primary flag. Required: opportunity_id.", "handler": sf__get_opportunity_contact_roles},
    {"name": "sf__get_accounts",          "description": "Get Salesforce Accounts (5 most recent). Pass account_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: name, industry, sic, account_number, ticker_symbol, annual_revenue_min, annual_revenue_max, type.", "handler": sf__get_accounts},
    {"name": "sf__create_account",        "description": "Create a new Account in Salesforce. Requires name. Optional: industry, phone, website, billing_city, type, account_number, annual_revenue, sic, ticker_symbol.", "handler": sf__create_account},
    {"name": "sf__update_account",        "description": "Update an existing Account in Salesforce by its record Id. Only fields provided will be updated. Fields: name, industry, phone, website, billing_city, type, account_number, annual_revenue, sic, ticker_symbol.", "handler": sf__update_account},
    {"name": "sf__get_contacts",          "description": "Get Salesforce Contacts (5 most recent). Pass contact_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: account_id, account_name (parent-traversal LIKE on Account.Name — e.g. 'contacts at Acme'), name (first/last LIKE), title (LIKE — e.g. 'contacts with title Manager'), department, lead_source.", "handler": sf__get_contacts},
    {"name": "sf__create_contact",        "description": "Create a new Contact in Salesforce. Requires last_name. Optional: first_name, email, phone, title, account_id, account_name (server resolves to AccountId; errors with suggestions if not found), department, lead_source.", "handler": sf__create_contact},
    {"name": "sf__update_contact",        "description": "Update an existing Contact in Salesforce by its record Id. Only fields provided will be updated. Fields: first_name, last_name, email, phone, title, account_id, department, lead_source. (Reassigning Account by name is not supported here — pass account_id explicitly if you must change it.)", "handler": sf__update_contact},
    {"name": "sf__get_cases",             "description": "Get Salesforce Cases (5 most recent). Pass case_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: account_id, account_name (parent-traversal LIKE on Account.Name — e.g. 'cases for Acme'), subject (search by subject), case_number, priority, status, type.", "handler": sf__get_cases},
    {"name": "sf__create_case",           "description": "Create a new Salesforce Case. Required: subject. Optional: priority (High/Medium/Low), status (New/Working/Escalated/Closed), account_id, account_name (server resolves to AccountId; alert with suggestions if not found), contact_id, contact_name (server resolves to ContactId; alert with suggestions if not found), description, type.", "handler": sf__create_case},
    {"name": "sf__update_case",           "description": "Update a Salesforce Case. Required: case_id. Optional: status, priority, subject, description, resolution (Internal Comments), type. (Account is read-only on the edit form — not reassignable from this tool.)", "handler": sf__update_case},
    {"name": "sf__get_case_activity",     "description": "Get activity for a Salesforce Case by Id — runs parallel queries for case comments and related tasks. Returns both sections (comments above, tasks below).", "handler": sf__get_case_activity},
    {"name": "sf__get_tasks",             "description": "Get Salesforce Tasks (5 most recent). Pass task_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: subject, status, priority, activity_date_from, activity_date_to, related_name (matches tasks linked to an Account/Opportunity/Contact/Lead whose name contains the string — e.g. related_name='Acme').", "handler": sf__get_tasks},
    {"name": "sf__create_task",           "description": "Create a new Salesforce Task (activity). Required: subject. Optional: priority, status, activity_date (YYYY-MM-DD), description, who_name (Contact/Lead person — server resolves to WhoId; alert with suggestions if not found), what_name (Account/Opportunity/Campaign — server resolves to WhatId; alert with suggestions if not found).", "handler": sf__create_task},
    {"name": "sf__update_task",           "description": "Update a Salesforce Task. Required: task_id. Optional: subject, priority, status, activity_date, description.", "handler": sf__update_task},
    {"name": "sf__convert_lead",          "description": "Convert a Salesforce Lead atomically into Account + Contact (and optionally Opportunity) via the native SOAP convertLead operation. Required: lead_id. Optional: account_id (reuse existing Account), contact_id (reuse existing Contact), do_not_create_opportunity (default false), opportunity_name, converted_status (auto-resolved from active IsConverted status if blank). On success, returns the new Opportunity as a single-row list view; falls back to a textual success card if no opportunity was created.", "handler": sf__convert_lead},
    {"name": "sf__get_pipeline_dashboard","description": "Get the Salesforce opportunity pipeline grouped by stage. Returns deal count and total amount per stage.", "handler": sf__get_pipeline_dashboard},
    {"name": "sf__get_campaigns",         "description": "Get Salesforce Campaigns (5 most recent). Pass campaign_id to view one record; add action='edit' (or 'change') to open the edit form. Filters: name, status, type.", "handler": sf__get_campaigns},
    {"name": "sf__create_campaign",       "description": "Create a new Salesforce Campaign. Required: name. Optional: status (Planned/Active/Completed/Aborted), type, start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), budgeted_cost, actual_cost.", "handler": sf__create_campaign},
    {"name": "sf__update_campaign",       "description": "Update a Salesforce Campaign. Required: campaign_id. Optional: name, status, type, start_date, end_date, budgeted_cost, actual_cost.", "handler": sf__update_campaign},
    {"name": "sf__get_pending_approvals", "description": "Get pending Salesforce approval requests assigned to the current user. Returns pending ProcessInstance workitems requiring action. Filters: submitted_by (LIKE on submitter name), target_type (Account/Contact/Opportunity/Case/Lead/Task/Campaign).", "handler": sf__get_pending_approvals},
    {"name": "sf__approve_record",        "description": "Approve a pending Salesforce approval. Required: approval_id (the ProcessInstanceWorkitem Id from sf__get_pending_approvals items[].id). Optional: comments. Returns the refreshed pending approvals list.", "handler": sf__approve_record},
    {"name": "sf__reject_record",         "description": "Reject a pending Salesforce approval. Required: approval_id. Optional: comments. Returns the refreshed pending approvals list.", "handler": sf__reject_record},
    {"name": "sf__show_create_form",      "description": "Use this when the user asks to create a new Salesforce lead, account, contact, opportunity, case, task, or campaign. Opens the interactive creation form — do NOT call sf__create_lead or other direct create tools. Pass entity name (lead/account/contact/opportunity/case/task/campaign). Pass prefill dict to pre-populate fields (e.g. {\"account_name\": \"GlobalFizz\", \"amount\": \"2000000\", \"stage\": \"Qualification\"}).", "handler": sf__show_create_form},
]

PROMPT_SPECS = [
    {"name": "show_leads",        "description": "Show the latest 5 leads from Salesforce.",                                              "handler": show_leads_prompt},
    {"name": "show_opportunities","description": "Show the latest 5 opportunities from Salesforce.",                                      "handler": show_opportunities_prompt},
    {"name": "manage_crm",        "description": "Help manage Salesforce CRM data — leads, opportunities, accounts, and contacts.",       "handler": manage_crm_prompt},
]


# ── Aliases for server.py imports ────────────────────────────────────────────
from mcp.types import PromptMessage as _PM, TextContent as _TC  # noqa: E402

TOOL_SPECS = _TOOL_SPECS_LIST

PROMPT_SPECS = [
    {
        "name": "my-leads",
        "description": "Show the latest leads in your Salesforce CRM.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Show me the latest leads from Salesforce. "
            "Call sf__get_leads and display the results in the widget."
        )))],
    },
    {
        "name": "my-cases",
        "description": "Show the latest open cases from Salesforce.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Show me the latest cases from Salesforce. "
            "Call sf__get_cases and display the results in the widget."
        )))],
    },
    {
        "name": "pipeline",
        "description": "See your opportunity pipeline broken down by stage.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Show me the opportunity pipeline. "
            "Call sf__get_pipeline_dashboard and sf__get_opportunities — these are independent. "
            "Once both return, show the stage breakdown and list deals at Proposal or Negotiation stage."
        )))],
    },
    {
        "name": "morning-briefing",
        "description": "Start your day with a summary of open cases, overdue tasks, and pending approvals.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "Give me my daily CRM briefing. "
            "Call sf__get_cases, sf__get_tasks, and sf__get_pending_approvals — these are independent. "
            "Once all three return, summarise: open cases by priority, overdue tasks, and approval count."
        )))],
    },
    {
        "name": "convert-lead",
        "description": "Convert a lead into an account, contact, and opportunity.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "I want to convert a lead. Call sf__get_leads to show me the latest leads. "
            "Ask me which lead to convert and whether to create an opportunity. "
            "Then call sf__convert_lead with that lead_id (and do_not_create_opportunity=true if I said skip the opportunity)."
        )))],
    },
    {
        "name": "account-view",
        "description": "See all cases, contacts, and open deals for a single account.",
        "handler": lambda: [_PM(role="user", content=_TC(type="text", text=(
            "I want a full view of an account. Call sf__get_accounts to show available accounts. "
            "Ask me which account to inspect. "
            "Then call sf__get_cases, sf__get_contacts, and sf__get_opportunities each with that "
            "account_id — these are independent. "
            "Once all three return, show cases, contacts, and open deals for that account."
        )))],
    },
]