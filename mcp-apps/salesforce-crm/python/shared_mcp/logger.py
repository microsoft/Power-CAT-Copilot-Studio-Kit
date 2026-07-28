"""Structured logger factory backed by structlog."""
from __future__ import annotations

import structlog


def get_logger(name: str):
    return structlog.get_logger(name)
