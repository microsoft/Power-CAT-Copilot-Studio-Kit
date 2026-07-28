"""Salesforce CRM settings — defined locally (no longer pulled from shared lib)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from the Copilot package root before SFSettings is instantiated.
# Looks for .env in cwd first (works when running `python -m sf_crm_mcp` from
# kit/sf-mcp-copilot/), then falls back to the parent of this file's package.
_ENV_FROM_CWD = Path.cwd() / ".env"
_ENV_FROM_PKG = Path(__file__).resolve().parent.parent / ".env"
if _ENV_FROM_CWD.exists():
    load_dotenv(_ENV_FROM_CWD, override=False)
elif _ENV_FROM_PKG.exists():
    load_dotenv(_ENV_FROM_PKG, override=False)


class SFSettings(BaseSettings):
    """Salesforce CRM MCP server settings — auto-loaded from environment."""
    sf_instance_url: str = ""
    sf_client_id: str = ""
    sf_client_secret: str = ""
    port: int = 8080
    cors_origins: str = "*"

    model_config = {"env_prefix": "", "case_sensitive": False}


@lru_cache(maxsize=1)
def get_settings() -> SFSettings:
    return SFSettings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
