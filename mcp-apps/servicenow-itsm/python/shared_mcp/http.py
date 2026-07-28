"""Shared async HTTP client factory."""
from __future__ import annotations

import httpx


def create_async_client(**kwargs) -> httpx.AsyncClient:
    """Return an httpx.AsyncClient with a 30-second timeout."""
    kwargs.setdefault("timeout", 30.0)
    return httpx.AsyncClient(**kwargs)
