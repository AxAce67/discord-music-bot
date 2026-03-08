from __future__ import annotations

import os
import secrets
import time
from dataclasses import dataclass


@dataclass(slots=True)
class PlaybackSource:
    upstream_url: str
    headers: dict[str, str]
    expires_at: float


STREAM_TTL_SECONDS = int(os.getenv("RESOLVER_STREAM_TTL_SECONDS", "900"))
_registry: dict[str, PlaybackSource] = {}


def register_playback_source(upstream_url: str, headers: dict[str, str] | None = None) -> str:
    cleanup_expired_sources()
    token = secrets.token_urlsafe(24)
    _registry[token] = PlaybackSource(
        upstream_url=upstream_url,
        headers=sanitize_headers(headers or {}),
        expires_at=time.time() + STREAM_TTL_SECONDS,
    )
    return f"{get_public_base_url()}/v1/stream/{token}"


def get_playback_source(token: str) -> PlaybackSource | None:
    cleanup_expired_sources()
    return _registry.get(token)


def get_public_base_url() -> str:
    configured = os.getenv("RESOLVER_PUBLIC_BASE_URL")
    if configured:
        return configured.rstrip("/")

    port = os.getenv("RESOLVER_PORT", "8080")
    return f"http://127.0.0.1:{port}"


def cleanup_expired_sources() -> None:
    now = time.time()
    expired_tokens = [token for token, source in _registry.items() if source.expires_at <= now]
    for token in expired_tokens:
        _registry.pop(token, None)


def sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    allowed = {
        "accept",
        "accept-language",
        "origin",
        "referer",
        "user-agent",
    }
    return {key: value for key, value in headers.items() if key.lower() in allowed and value}
