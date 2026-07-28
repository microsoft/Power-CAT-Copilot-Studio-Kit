"""ServiceNow ITSM MCP Server — bootstrap only. Tools in tools.py, client in client.py."""
import sys
from pathlib import Path

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.middleware.cors import CORSMiddleware

from .servicenow_settings import get_settings
from .servicenow_tools import PROMPT_SPECS, TOOL_SPECS
from shared_mcp.logger import get_logger
from shared_mcp.telemetry import wrap_specs
from shared_mcp.file_logger import wrap_specs_logging
TOOL_SPECS = wrap_specs_logging(wrap_specs(TOOL_SPECS))

log = get_logger("sn")
settings = get_settings()

WIDGET_URI = "ui://widget/servicenow.html"
WIDGET_HTML = (Path(__file__).parent / "web" / "widget.html").read_text(encoding="utf-8")

mcp = FastMCP(
    "gtc-servicenow-post",
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@mcp.resource(WIDGET_URI, mime_type="text/html;profile=mcp-app")
async def servicenow_widget() -> str:
    return WIDGET_HTML


# Backstage-lookup tools that should NOT render a widget. The LLM uses these
# to resolve names → sys_ids before chaining into a real filter tool; surfacing
# a widget for them pollutes the chat. regen_manifests.py honors this set in
# its _meta.ui.resourceUri drift validation.
NO_WIDGET_TOOLS = {"sn__get_users", "sn__get_hr_services"}

for _spec in TOOL_SPECS:
    kwargs: dict = {
        "name": _spec["name"],
        "description": _spec["description"],
    }
    if _spec["name"] not in NO_WIDGET_TOOLS:
        kwargs["meta"] = {"ui": {"resourceUri": WIDGET_URI}}
    mcp.tool(**kwargs)(_spec["handler"])

for _spec in PROMPT_SPECS:
    mcp.prompt(name=_spec["name"], description=_spec["description"])(_spec["handler"])


def _validate_env() -> None:
    inst = settings.servicenow_instance
    mode = settings.servicenow_auth_mode.lower()
    print("  ┌─ Environment ─────────────────────────────────")
    print(f"  │ SERVICENOW_INSTANCE  {'✓ ' + inst if inst else '✗ MISSING'}")
    print(f"  │ AUTH_MODE            ✓ {mode}")
    if mode == "oauth":
        print(f"  │ CLIENT_ID           {'✓ set' if settings.servicenow_client_id else '✗ MISSING'}")
        print(f"  │ CLIENT_SECRET       {'✓ set' if settings.servicenow_client_secret else '✗ MISSING'}")
    else:
        print(f"  │ USERNAME            {'✓ ' + settings.servicenow_username if settings.servicenow_username else '✗ MISSING'}")
        print(f"  │ PASSWORD            {'✓ set' if settings.servicenow_password else '✗ MISSING'}")
    print("  └────────────────────────────────────────────────")
    missing = []
    if not inst: missing.append("SERVICENOW_INSTANCE")
    if mode == "oauth":
        if not settings.servicenow_client_id: missing.append("SERVICENOW_CLIENT_ID")
        if not settings.servicenow_client_secret: missing.append("SERVICENOW_CLIENT_SECRET")
    else:
        if not settings.servicenow_username: missing.append("SERVICENOW_USERNAME")
        if not settings.servicenow_password: missing.append("SERVICENOW_PASSWORD")
    if missing:
        log.error("missing_env_vars", vars=missing)
        print(f"\n  ❌ Missing required env vars: {', '.join(missing)}")
        sys.exit(1)


def main() -> None:
    _validate_env()
    log.info("starting", port=settings.port)
    print(f"⚓ GTC — ServiceNow Trading Post starting on port {settings.port}")
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
