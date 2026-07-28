"""Salesforce CRM MCP server — bootstrap only. Tools in tools.py, client in salesforce.py."""
import sys
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.cors import CORSMiddleware

from .salesforce_settings import get_settings
from .salesforce_tools import PROMPT_SPECS, TOOL_SPECS
from shared_mcp.logger import get_logger
from shared_mcp.telemetry import wrap_specs
from shared_mcp.file_logger import wrap_specs_logging
TOOL_SPECS = wrap_specs_logging(wrap_specs(TOOL_SPECS))

log = get_logger("sf")
settings = get_settings()

WIDGET_URI = "ui://widget/crm.html"
WIDGET_HTML = (Path(__file__).parent / "web" / "widget.html").read_text(encoding="utf-8")

# When `host` is unset (defaults to "127.0.0.1") FastMCP auto-enables DNS
# rebinding protection that only allows Host headers matching localhost.
# Behind Azure Container Apps the Host header is the public FQDN, so it
# returns HTTP 421 "Invalid Host header". Disable that protection because
# Container Apps' own ingress already enforces TLS + routing — this MCP
# server isn't directly internet-exposed without it.
mcp = FastMCP(
    "gtc-sf-trading-post",
    host="0.0.0.0",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@mcp.resource(WIDGET_URI, mime_type="text/html;profile=mcp-app")
async def crm_widget() -> str:
    return WIDGET_HTML


for _spec in TOOL_SPECS:
    mcp.tool(
        name=_spec["name"],
        description=_spec["description"],
        meta={"ui": {"resourceUri": WIDGET_URI}},
    )(_spec["handler"])

for _spec in PROMPT_SPECS:
    mcp.prompt(name=_spec["name"], description=_spec["description"])(_spec["handler"])


def _validate_env() -> None:
    print("  ┌─ Environment ─────────────────────────────────")
    print(f"  │ SF_INSTANCE_URL   {'✓ ' + settings.sf_instance_url[:40] if settings.sf_instance_url else '✗ MISSING'}")
    print(f"  │ SF_CLIENT_ID      {'✓ ' + settings.sf_client_id[:8] + '...' if settings.sf_client_id else '✗ MISSING'}")
    print(f"  │ SF_CLIENT_SECRET  {'✓ (set)' if settings.sf_client_secret else '✗ MISSING'}")
    print("  └────────────────────────────────────────────────")
    missing = []
    if not settings.sf_instance_url: missing.append("SF_INSTANCE_URL")
    if not settings.sf_client_id:    missing.append("SF_CLIENT_ID")
    if not settings.sf_client_secret:missing.append("SF_CLIENT_SECRET")
    if missing:
        log.error("missing_env_vars", vars=missing)
        print(f"\n  ❌ Missing required env vars: {', '.join(missing)}")
        sys.exit(1)


def main() -> None:
    _validate_env()
    log.info("starting", port=settings.port)
    print(f"⚓ GTC — Salesforce Trading Post starting on port {settings.port}")
    app = mcp.streamable_http_app()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins.split(","),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "mcp-session-id"],
    )
    uvicorn.run(app, host="0.0.0.0", port=settings.port)


if __name__ == "__main__":
    main()
