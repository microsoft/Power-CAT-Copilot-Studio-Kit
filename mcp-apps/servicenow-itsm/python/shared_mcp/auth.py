"""Bearer token extraction from FastMCP request context."""
from __future__ import annotations

from typing import Optional

from mcp.server.fastmcp import Context

from .logger import get_logger

LOGGER = get_logger(__name__)


class TokenValidationError(Exception):
    """Raised when no valid bearer token is found."""


def get_bearer_token(ctx: Optional[Context]) -> str:
    """Extract the OAuth 2.0 Bearer token from the Authorization request header.

    The token is NOT validated here — it will be validated by the downstream SaaS API.
    Returns empty string when not available (tools fall back to mock data).
    """
    if ctx is None:
        return ""
    try:
        request = ctx.request_context.request  # type: ignore[union-attr]
        auth_header = request.headers.get("authorization", "") if request else ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            if token:
                LOGGER.debug("bearer_token_extracted")
                return token
    except (ValueError, AttributeError):
        pass
    return ""
