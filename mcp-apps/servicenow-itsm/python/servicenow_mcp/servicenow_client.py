"""ServiceNow API client — auth, HTTP, field helpers. No MCP imports."""
import base64
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .servicenow_settings import get_settings
from shared_mcp.logger import get_logger

log = get_logger("sn")


def _load_env() -> None:
    explicit = os.environ.get("MCP_SERVERS_ENV_FILE")
    if explicit:
        load_dotenv(explicit, override=True)
        return
    project_env = Path.cwd() / "env" / ".env.sn"
    if project_env.exists():
        load_dotenv(project_env, override=True)
        return
    load_dotenv()


_load_env()
_settings = get_settings()
BASE_URL = f"https://{_settings.servicenow_instance}.service-now.com"

# ── Field lists ───────────────────────────────────────────────────────────────

INCIDENT_FIELDS = (
    "sys_id,number,short_description,description,state,priority,impact,"
    "urgency,category,caller_id,assigned_to,sys_created_on,sys_updated_on"
)
REQUEST_FIELDS = (
    "sys_id,number,short_description,description,request_state,"
    "priority,approval,requested_for,due_date,sys_created_on,sys_updated_on"
)
REQUEST_ITEM_FIELDS = (
    "sys_id,number,short_description,description,state,stage,"
    "quantity,price,cat_item,request,sys_created_on"
)
CHANGE_FIELDS = (
    "sys_id,number,short_description,description,state,priority,risk,category,type,assigned_to,"
    "start_date,end_date,sys_created_on"
)
PROBLEM_FIELDS = (
    "sys_id,number,short_description,description,state,priority,assigned_to,"
    "workaround,sys_created_on"
)
HR_FIELDS = (
    "sys_id,number,short_description,description,state,priority,opened_by,"
    "opened_for,assigned_to,hr_service,sys_created_on"
)

# ── Token cache ───────────────────────────────────────────────────────────────

_token_cache: dict = {"token": None, "expires_at": 0.0}


def clear_token_cache() -> None:
    _token_cache["token"] = None
    _token_cache["expires_at"] = 0.0


def _val(v):
    """Extract display_value from ServiceNow reference objects."""
    if isinstance(v, dict) and "display_value" in v:
        return v["display_value"]
    return v


async def get_servicenow_token() -> str:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/oauth_token.do",
            data={
                "grant_type": "client_credentials",
                "client_id": _settings.servicenow_client_id,
                "client_secret": _settings.servicenow_client_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["token"] = data["access_token"]
        _token_cache["expires_at"] = now + data.get("expires_in", 1800)
        return _token_cache["token"]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(httpx.RequestError),
    reraise=True,
)
async def servicenow_request(
    method: str,
    path: str,
    params: dict | None = None,
    json_body: dict | None = None,
) -> httpx.Response:
    """Authenticated request to ServiceNow Table API. Handles OAuth and Basic auth."""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    if _settings.servicenow_auth_mode.lower() == "oauth":
        token = await get_servicenow_token()
        headers["Authorization"] = f"Bearer {token}"
    else:
        creds = base64.b64encode(
            f"{_settings.servicenow_username}:{_settings.servicenow_password}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {creds}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method,
            f"{BASE_URL}{path}",
            headers=headers,
            params=params,
            json=json_body,
        )
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError:
            _log_sn_http(method, path, params, resp)
            raise
        _log_sn_http(method, path, params, resp)
        return resp


def _log_sn_http(method: str, path: str, params: dict | None, resp: "httpx.Response") -> None:
    """Record the outbound ServiceNow call — endpoint + the exact query fired —
    and the data that came back (rows on success, error body on failure) so you
    can verify what was returned. Never raises."""
    try:
        from shared_mcp.file_logger import log_event, cap_rows
        status = resp.status_code
        ok = status < 400
        response: dict = {"status": status}
        if ok:
            try:
                rows = resp.json().get("result", [])
                if isinstance(rows, list):
                    response["count"] = len(rows)
                    response["result"] = cap_rows(rows)
                else:
                    response["result"] = rows
            except Exception:
                pass
        else:
            try:
                response["error"] = resp.json().get("error") or resp.text[:1000]
            except Exception:
                response["error"] = resp.text[:1000]
        log_event(
            "sn_http",
            severity="INFO" if ok else "ERROR",
            request={
                "method": method,
                "path": path,
                "query": (params or {}).get("sysparm_query"),
                "params": params,
            },
            response=response,
        )
    except Exception:
        pass
