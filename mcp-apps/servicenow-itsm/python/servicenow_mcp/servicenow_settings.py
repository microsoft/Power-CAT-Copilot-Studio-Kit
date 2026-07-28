"""ServiceNow settings — defined locally (no longer pulled from shared lib)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class SNSettings(BaseSettings):
    """ServiceNow ITSM MCP server settings — auto-loaded from environment."""
    servicenow_instance: str = ""
    servicenow_auth_mode: str = "oauth"
    servicenow_client_id: str = ""
    servicenow_client_secret: str = ""
    servicenow_username: str = ""
    servicenow_password: str = ""
    port: int = 8081
    cors_origins: str = "*"

    model_config = {"env_prefix": "", "case_sensitive": False}


@lru_cache(maxsize=1)
def get_settings() -> SNSettings:
    return SNSettings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
