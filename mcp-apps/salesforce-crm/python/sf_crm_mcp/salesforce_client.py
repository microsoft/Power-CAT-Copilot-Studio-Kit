"""
Salesforce REST API client using OAuth2 client_credentials flow.

All Salesforce interactions are encapsulated here — the MCP server
delegates to this module for authentication, queries, and mutations.
"""

import time
import xml.etree.ElementTree as ET
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from shared_mcp.logger import get_logger

from .salesforce_settings import get_settings

log = get_logger("sf.client")

# Salesforce REST API version
SF_API_VERSION = "v62.0"
# Salesforce SOAP API version (Enterprise WSDL); kept aligned with REST.
SF_SOAP_VERSION = "62.0"


def _xml_escape(s: str) -> str:
    """Escape a value for inclusion in a SOAP element body."""
    return (
        s.replace("&", "&amp;")
         .replace("<", "&lt;")
         .replace(">", "&gt;")
         .replace('"', "&quot;")
         .replace("'", "&apos;")
    )


def _log_sf_http(method: str, path: str, params: dict | None, resp: "httpx.Response") -> None:
    """Record the outbound Salesforce call — endpoint + the SOQL query fired —
    and the data that came back (records on success, error body on failure) so
    you can verify what was returned. Never raises."""
    try:
        from shared_mcp.file_logger import log_event, cap_rows
        status = resp.status_code
        ok = 200 <= status < 400
        response: dict = {"status": status}
        try:
            body = resp.json()
        except Exception:
            body = None
        if ok and isinstance(body, dict) and isinstance(body.get("records"), list):
            response["totalSize"] = body.get("totalSize", len(body["records"]))
            response["records"] = cap_rows(body["records"])
        elif ok:
            response["result"] = body
        else:
            response["error"] = body if body is not None else resp.text[:1000]
        log_event(
            "sf_http",
            severity="INFO" if ok else "ERROR",
            request={
                "method": method,
                "path": path,
                "query": (params or {}).get("q"),
                "params": params,
            },
            response=response,
        )
    except Exception:
        pass


class SalesforceAuthError(Exception):
    """Raised when Salesforce authentication fails."""


class SalesforceAPIError(Exception):
    """Raised when a Salesforce API call fails."""

    def __init__(self, message: str, status_code: int | None = None, sf_errors: list | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.sf_errors = sf_errors or []


class SalesforceClient:
    """Async Salesforce REST API client with token caching."""

    def __init__(self) -> None:
        settings = get_settings()
        self.instance_url = settings.sf_instance_url.rstrip("/")
        self.client_id = settings.sf_client_id
        self.client_secret = settings.sf_client_secret

        if not all([self.instance_url, self.client_id, self.client_secret]):
            raise SalesforceAuthError(
                "Missing Salesforce credentials. Set SF_INSTANCE_URL, SF_CLIENT_ID, "
                "and SF_CLIENT_SECRET in your .env file."
            )

        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    @property
    def _base_url(self) -> str:
        return f"{self.instance_url}/services/data/{SF_API_VERSION}"

    async def _authenticate(self) -> str:
        """
        Obtain an access token via OAuth2 client_credentials grant.
        Caches the token until 5 minutes before expiry.
        """
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        token_url = f"{self.instance_url}/services/oauth2/token"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                )
        except httpx.RequestError as exc:
            raise SalesforceAuthError(
                f"Network error connecting to Salesforce token endpoint: {exc}"
            ) from exc

        if resp.status_code != 200:
            detail = resp.text[:500]
            raise SalesforceAuthError(
                f"Salesforce auth failed (HTTP {resp.status_code}): {detail}"
            )

        data = resp.json()
        self._access_token = data["access_token"]
        # Default session timeout is 2 hours; refresh 5 minutes early
        self._token_expires_at = time.time() + 7200 - 300
        return self._access_token

    async def _headers(self) -> dict[str, str]:
        token = await self._authenticate()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type(httpx.RequestError),
        reraise=True,
    )
    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json_body: dict | None = None,
    ) -> httpx.Response:
        """Execute an authenticated request to Salesforce REST API."""
        headers = await self._headers()
        url = f"{self._base_url}{path}"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(
                    method,
                    url,
                    headers=headers,
                    params=params,
                    json=json_body,
                )
        except httpx.RequestError as exc:
            raise SalesforceAPIError(
                f"Network error calling Salesforce API ({method} {path}): {exc}"
            ) from exc

        # Handle 401 (expired token) — retry once with fresh token
        if resp.status_code == 401:
            self._access_token = None
            headers = await self._headers()
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.request(
                        method,
                        url,
                        headers=headers,
                        params=params,
                        json=json_body,
                    )
            except httpx.RequestError as exc:
                raise SalesforceAPIError(
                    f"Network error on retry ({method} {path}): {exc}"
                ) from exc

        _log_sf_http(method, path, params, resp)
        return resp

    def _raise_for_error(self, resp: httpx.Response, context: str) -> None:
        """Raise SalesforceAPIError if the response indicates failure."""
        if resp.is_success:
            return

        try:
            errors = resp.json()
            if isinstance(errors, list):
                messages = [e.get("message", str(e)) for e in errors]
            else:
                messages = [errors.get("message", str(errors))]
        except Exception:
            messages = [resp.text[:500]]

        raise SalesforceAPIError(
            f"Salesforce API error ({context}, HTTP {resp.status_code}): "
            + "; ".join(messages),
            status_code=resp.status_code,
            sf_errors=messages,
        )

    # ── SOQL Query ────────────────────────────────────────────────────────────

    async def query(self, soql: str) -> list[dict[str, Any]]:
        """Execute a SOQL query and return the records."""
        resp = await self._request("GET", "/query", params={"q": soql})
        self._raise_for_error(resp, f"query: {soql[:80]}")

        data = resp.json()
        records = data.get("records", [])

        # Strip Salesforce metadata from each record
        for record in records:
            record.pop("attributes", None)
            # Flatten nested relationship objects (e.g., Account.Name)
            for key, value in list(record.items()):
                if isinstance(value, dict) and "attributes" in value:
                    value.pop("attributes", None)

        return records

    # ── Create ────────────────────────────────────────────────────────────────

    async def create(self, sobject: str, data: dict[str, Any]) -> str:
        """
        Create a new Salesforce record.
        Returns the new record's Id.
        """
        resp = await self._request("POST", f"/sobjects/{sobject}", json_body=data)
        self._raise_for_error(resp, f"create {sobject}")

        result = resp.json()
        if not result.get("success"):
            errors = result.get("errors", [])
            raise SalesforceAPIError(
                f"Create {sobject} failed: {errors}",
                sf_errors=[str(e) for e in errors],
            )

        return result["id"]

    # ── Update ────────────────────────────────────────────────────────────────

    async def update(self, sobject: str, record_id: str, data: dict[str, Any]) -> None:
        """Update an existing Salesforce record by Id."""
        resp = await self._request(
            "PATCH",
            f"/sobjects/{sobject}/{record_id}",
            json_body=data,
        )
        self._raise_for_error(resp, f"update {sobject}/{record_id}")

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete(self, sobject: str, record_id: str) -> None:
        """Delete a Salesforce record by Id (HTTP 204 on success)."""
        resp = await self._request("DELETE", f"/sobjects/{sobject}/{record_id}")
        self._raise_for_error(resp, f"delete {sobject}/{record_id}")

    # ── Invocable Actions ──────────────────────────────────────────────────────

    async def invoke_action(self, action_name: str, inputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Invoke a standard Salesforce invocable action (e.g. convertLead)."""
        resp = await self._request(
            "POST",
            f"/actions/standard/{action_name}",
            json_body={"inputs": inputs},
        )
        self._raise_for_error(resp, f"invoke_action {action_name}")
        data = resp.json()
        return data if isinstance(data, list) else data.get("results", [])

    # ── SOAP convertLead ──────────────────────────────────────────────────────
    # The native REST sObject endpoint for Lead Convert is not available in
    # this org; use the Enterprise SOAP API instead. OAuth access_token is
    # accepted as the SOAP sessionId.

    async def convert_lead_soap(
        self,
        *,
        lead_id: str,
        converted_status: str,
        account_id: str = "",
        contact_id: str = "",
        do_not_create_opportunity: bool = False,
        opportunity_name: str = "",
    ) -> dict[str, Any]:
        """Convert a Lead atomically via the SOAP convertLead operation.

        Returns a dict with: success (bool), leadId, accountId, contactId,
        opportunityId (empty if doNotCreateOpportunity=True or none created),
        errors (list of message strings).
        """
        token = await self._authenticate()
        url = f"{self.instance_url}/services/Soap/c/{SF_SOAP_VERSION}"

        optional = ""
        if account_id:
            optional += f"<urn:accountId>{_xml_escape(account_id)}</urn:accountId>"
        if contact_id:
            optional += f"<urn:contactId>{_xml_escape(contact_id)}</urn:contactId>"
        if opportunity_name:
            optional += f"<urn:opportunityName>{_xml_escape(opportunity_name)}</urn:opportunityName>"

        envelope = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
            ' xmlns:urn="urn:enterprise.soap.sforce.com">'
            f'<soapenv:Header><urn:SessionHeader><urn:sessionId>{token}</urn:sessionId></urn:SessionHeader></soapenv:Header>'
            '<soapenv:Body><urn:convertLead>'
            '<urn:leadConverts>'
            f'<urn:leadId>{_xml_escape(lead_id)}</urn:leadId>'
            f'<urn:convertedStatus>{_xml_escape(converted_status)}</urn:convertedStatus>'
            f'<urn:doNotCreateOpportunity>{str(do_not_create_opportunity).lower()}</urn:doNotCreateOpportunity>'
            f'{optional}'
            '</urn:leadConverts>'
            '</urn:convertLead></soapenv:Body>'
            '</soapenv:Envelope>'
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Content-Type": "text/xml; charset=UTF-8",
                        "SOAPAction": '""',
                    },
                    content=envelope.encode("utf-8"),
                )
        except httpx.RequestError as exc:
            raise SalesforceAPIError(f"Network error on SOAP convertLead: {exc}") from exc

        if not resp.is_success:
            raise SalesforceAPIError(
                f"SOAP convertLead failed (HTTP {resp.status_code}): {resp.text[:500]}",
                status_code=resp.status_code,
            )

        ns = {
            "s": "http://schemas.xmlsoap.org/soap/envelope/",
            "e": "urn:enterprise.soap.sforce.com",
        }
        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError as exc:
            raise SalesforceAPIError(f"SOAP convertLead returned invalid XML: {exc}") from exc

        result = root.find(".//e:result", ns)
        if result is None:
            # SOAP Fault — surface the faultstring
            fault = root.find(".//{http://schemas.xmlsoap.org/soap/envelope/}Fault")
            msg = "Unknown SOAP fault"
            if fault is not None:
                fs = fault.find("faultstring")
                if fs is not None and fs.text:
                    msg = fs.text
            raise SalesforceAPIError(f"SOAP convertLead fault: {msg}")

        def _txt(tag: str) -> str:
            el = result.find(f"e:{tag}", ns)
            return (el.text or "") if (el is not None and el.text is not None) else ""

        success = _txt("success").lower() == "true"
        errors = []
        for err in result.findall("e:errors", ns):
            mel = err.find("e:message", ns)
            if mel is not None and mel.text:
                errors.append(mel.text)

        return {
            "success":       success,
            "leadId":        _txt("leadId"),
            "accountId":     _txt("accountId"),
            "contactId":     _txt("contactId"),
            "opportunityId": _txt("opportunityId"),
            "errors":        errors,
        }


# ── Module-level singleton ────────────────────────────────────────────────────
# Lazily initialised so the module can be imported before env vars are loaded.

_client: SalesforceClient | None = None


def get_client() -> SalesforceClient:
    """Return the shared SalesforceClient instance, creating it on first call."""
    global _client
    if _client is None:
        _client = SalesforceClient()
    return _client


def clear_token_cache() -> None:
    """Force re-authentication on the next API call."""
    global _client
    if _client is not None:
        _client._access_token = None
        _client._token_expires_at = 0.0
