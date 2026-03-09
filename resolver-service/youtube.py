from __future__ import annotations

from copy import deepcopy
import json
import logging
import os
import subprocess
import time
from typing import Any, TypeVar
from urllib.parse import parse_qs, urlencode, urlparse

from errors import ResolverError
from models import TrackPayload
from streams import register_playback_source

logger = logging.getLogger("resolver.youtube")

DEFAULT_LIMIT = 10
MAX_PLAYLIST_TRACKS = 100
MAX_MIX_TRACKS = 25
DEFAULT_PLAYLIST_PAGE_SIZE = 50
DEFAULT_YTDLP_TIMEOUT_SECONDS = 30
DEFAULT_RESOLVER_CACHE_TTL_SECONDS = 300
_track_payload_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_playlist_entries_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
CacheValue = TypeVar("CacheValue")


def search_tracks(query: str, limit: int = DEFAULT_LIMIT) -> list[TrackPayload]:
    payload = run_yt_dlp(f"ytsearch{min(limit, DEFAULT_LIMIT)}:{query}")
    if payload.get("_type") == "playlist":
        return map_entries(payload.get("entries", []), min(limit, DEFAULT_LIMIT))

    track = map_track(payload)
    return [track] if track else []


def resolve_track(url: str) -> list[TrackPayload]:
    if is_playlist_url(url) and not has_video_id(url):
        raise ResolverError("BAD_REQUEST", "Playlist URLs are not accepted on this endpoint", 400)

    normalized_url = normalize_track_url(url)
    payload = get_cached_payload(_track_payload_cache, normalized_url)
    if payload is None:
        payload = run_yt_dlp(normalized_url)
        set_cached_payload(_track_payload_cache, normalized_url, payload)

    track = map_track(payload)
    if not track:
        raise ResolverError("TRACK_NOT_FOUND", "No playable track found", 404)

    return [track]


def resolve_playlist(url: str, *, offset: int = 0, limit: int = DEFAULT_PLAYLIST_PAGE_SIZE) -> tuple[list[TrackPayload], int, int | None]:
    if not is_playlist_url(url):
        raise ResolverError("BAD_REQUEST", "A playlist URL is required", 400)

    normalized_url = normalize_playlist_url(url)
    track_limit = get_playlist_track_limit(url)
    raw_entries = get_cached_payload(_playlist_entries_cache, normalized_url)
    if raw_entries is None:
        payload = run_yt_dlp(normalized_url, flat_playlist=True, playlist_end=track_limit)
        raw_entries = payload.get("entries", [])
        set_cached_payload(_playlist_entries_cache, normalized_url, raw_entries)

    total_count = min(len(raw_entries), track_limit)
    if offset >= total_count:
        return [], total_count, None

    page_size = max(1, min(limit, track_limit))
    page_entries = raw_entries[offset : offset + page_size]
    entries = map_entries(page_entries, page_size)
    if not entries:
        raise ResolverError("PLAYLIST_NOT_FOUND", "No playable playlist entries found", 404)

    first_track = entries[0]
    if offset == 0 and first_track and not first_track.playbackUrl:
        try:
            entries[0] = resolve_track(first_track.url)[0]
        except ResolverError as error:
            logger.info(
                "Could not enrich first playlist track %s for fast start: %s",
                first_track.url,
                error.code,
            )

    next_offset = offset + len(page_entries)
    if next_offset >= total_count:
        next_offset = None

    return entries, total_count, next_offset


def run_yt_dlp(identifier: str, *, flat_playlist: bool = False, playlist_end: int | None = None) -> dict[str, Any]:
    command = [
        *get_common_yt_dlp_command(),
        "--dump-single-json",
        "--skip-download",
    ]
    if flat_playlist:
        command.extend(["--flat-playlist", "--playlist-end", str(playlist_end or MAX_PLAYLIST_TRACKS)])
    else:
        command.extend(["--format", "bestaudio/best"])
    command.append(identifier)

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=get_yt_dlp_timeout_seconds(),
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ResolverError("TIMEOUT", "yt-dlp timed out", 504) from error
    except FileNotFoundError as error:
        raise ResolverError("UPSTREAM_FAILED", "yt-dlp is not installed", 502) from error

    if completed.returncode != 0:
        stderr = completed.stderr.lower()
        logger.warning(
            "yt-dlp failed for %s with exit code %s: %s",
            identifier,
            completed.returncode,
            completed.stderr.strip(),
        )
        if "private video" in stderr or "members-only" in stderr or "sign in" in stderr:
            raise ResolverError("TRACK_NOT_FOUND", "No playable track found", 404)
        raise ResolverError("UPSTREAM_FAILED", "yt-dlp failed to resolve the request", 502)

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ResolverError("UPSTREAM_FAILED", "yt-dlp returned invalid JSON", 502) from error


def map_entries(entries: list[dict[str, Any]], limit: int) -> list[TrackPayload]:
    tracks: list[TrackPayload] = []
    for entry in entries:
        track = map_track(entry)
        if track:
            tracks.append(track)
        if len(tracks) >= limit:
            break

    return tracks


def map_track(payload: dict[str, Any]) -> TrackPayload | None:
    video_id = payload.get("id")
    title = payload.get("title")
    if not video_id or not title:
        return None

    webpage_url = payload.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}"
    duration = int(payload.get("duration") or 0)

    playback_url, playback_headers = extract_playback_source(payload)
    proxied_playback_url = (
        register_playback_source(normalize_track_url(str(webpage_url)), playback_url, playback_headers)
        if playback_url
        else None
    )
    artwork_url = (
        str(payload.get("thumbnail"))
        if payload.get("thumbnail")
        else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    )

    return TrackPayload(
        trackId=f"youtube:{video_id}",
        title=str(title),
        url=normalize_track_url(str(webpage_url)),
        playbackUrl=proxied_playback_url,
        durationMs=max(0, duration) * 1000,
        artworkUrl=artwork_url,
    )


def is_playlist_url(url: str) -> bool:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    return "list" in query


def is_mix_playlist_url(url: str) -> bool:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    playlist_id = query.get("list", [None])[0]
    return bool(query.get("start_radio", [None])[0]) or (
        isinstance(playlist_id, str) and playlist_id.startswith("RD")
    )


def get_playlist_track_limit(url: str) -> int:
    return MAX_MIX_TRACKS if is_mix_playlist_url(url) else MAX_PLAYLIST_TRACKS


def has_video_id(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")

    if host == "youtu.be":
        return bool(parsed.path.strip("/"))

    if host in {"youtube.com", "m.youtube.com"} and parsed.path == "/watch":
        return bool(parse_qs(parsed.query).get("v", [None])[0])

    if host in {"youtube.com", "m.youtube.com"} and parsed.path.startswith("/shorts/"):
        return len([segment for segment in parsed.path.split("/") if segment]) >= 2

    return False


def normalize_track_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")

    if host == "youtu.be":
        video_id = parsed.path.strip("/")
        if video_id:
            return f"https://www.youtube.com/watch?v={video_id}"

    if host in {"youtube.com", "m.youtube.com"}:
        if parsed.path == "/watch":
            params = parse_qs(parsed.query)
            video_id = params.get("v", [None])[0]
            if video_id:
                return f"https://www.youtube.com/watch?v={video_id}"

        if parsed.path.startswith("/shorts/"):
            parts = [segment for segment in parsed.path.split("/") if segment]
            if len(parts) >= 2:
                return f"https://www.youtube.com/watch?v={parts[1]}"

        if parsed.path == "/playlist":
            params = parse_qs(parsed.query)
            playlist_id = params.get("list", [None])[0]
            if playlist_id:
                return f"https://www.youtube.com/playlist?list={playlist_id}"

    return url


def normalize_playlist_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")

    if host in {"youtube.com", "m.youtube.com"} and parsed.path == "/playlist":
        params = parse_qs(parsed.query)
        playlist_id = params.get("list", [None])[0]
        if playlist_id:
            query = [("list", playlist_id)]
            index = params.get("index", [None])[0]
            if index:
                query.append(("index", index))
            return f"https://www.youtube.com/playlist?{urlencode(query)}"

    if host in {"youtube.com", "m.youtube.com"} and parsed.path == "/watch":
        params = parse_qs(parsed.query)
        video_id = params.get("v", [None])[0]
        playlist_id = params.get("list", [None])[0]
        if video_id and playlist_id:
            query = [("v", video_id), ("list", playlist_id)]
            index = params.get("index", [None])[0]
            if index:
                query.append(("index", index))
            start_radio = params.get("start_radio", [None])[0]
            if start_radio:
                query.append(("start_radio", start_radio))
            return f"https://www.youtube.com/watch?{urlencode(query)}"
        if playlist_id:
            query = [("list", playlist_id)]
            index = params.get("index", [None])[0]
            if index:
                query.append(("index", index))
            return f"https://www.youtube.com/playlist?{urlencode(query)}"

    return normalize_track_url(url)


def extract_playback_source(payload: dict[str, Any]) -> tuple[str | None, dict[str, str]]:
    requested_downloads = payload.get("requested_downloads")
    if isinstance(requested_downloads, list):
        for entry in requested_downloads:
            if not isinstance(entry, dict):
                continue
            url = entry.get("url")
            if isinstance(url, str) and is_direct_media_url(url):
                return url, normalize_headers(entry.get("http_headers"))

    direct_url = payload.get("url")
    if isinstance(direct_url, str) and is_direct_media_url(direct_url):
        return direct_url, normalize_headers(payload.get("http_headers"))

    return None, {}


def get_stream_command(identifier: str) -> list[str]:
    return [
        *get_common_yt_dlp_command(),
        "--format",
        "bestaudio/best",
        "--output",
        "-",
        identifier,
    ]


def get_common_yt_dlp_command() -> list[str]:
    command = [
        os.getenv("YTDLP_BINARY", "yt-dlp"),
        "--no-warnings",
    ]

    cookies_file = os.getenv("YTDLP_COOKIES_FILE")
    if cookies_file:
        command.extend(["--cookies", cookies_file])

    extractor_args = os.getenv("YTDLP_EXTRACTOR_ARGS")
    if extractor_args:
        for extractor_arg in split_env_list(extractor_args):
            command.extend(["--extractor-args", extractor_arg])

    sleep_interval = os.getenv("YTDLP_SLEEP_INTERVAL_SECONDS")
    if sleep_interval:
        command.extend(["--sleep-requests", sleep_interval])

    return command


def get_yt_dlp_timeout_seconds() -> int:
    raw_value = os.getenv("YTDLP_TIMEOUT_SECONDS")
    if raw_value is None or raw_value.strip() == "":
        return DEFAULT_YTDLP_TIMEOUT_SECONDS

    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning(
            "Invalid YTDLP_TIMEOUT_SECONDS=%r, falling back to %s seconds",
            raw_value,
            DEFAULT_YTDLP_TIMEOUT_SECONDS,
        )
        return DEFAULT_YTDLP_TIMEOUT_SECONDS

    if parsed <= 0:
        logger.warning(
            "Non-positive YTDLP_TIMEOUT_SECONDS=%r, falling back to %s seconds",
            raw_value,
            DEFAULT_YTDLP_TIMEOUT_SECONDS,
        )
        return DEFAULT_YTDLP_TIMEOUT_SECONDS

    return parsed


def get_resolver_cache_ttl_seconds() -> int:
    raw_value = os.getenv("RESOLVER_CACHE_TTL_SECONDS")
    if raw_value is None or raw_value.strip() == "":
        return DEFAULT_RESOLVER_CACHE_TTL_SECONDS

    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning(
            "Invalid RESOLVER_CACHE_TTL_SECONDS=%r, falling back to %s seconds",
            raw_value,
            DEFAULT_RESOLVER_CACHE_TTL_SECONDS,
        )
        return DEFAULT_RESOLVER_CACHE_TTL_SECONDS

    if parsed <= 0:
        logger.warning(
            "Non-positive RESOLVER_CACHE_TTL_SECONDS=%r, falling back to %s seconds",
            raw_value,
            DEFAULT_RESOLVER_CACHE_TTL_SECONDS,
        )
        return DEFAULT_RESOLVER_CACHE_TTL_SECONDS

    return parsed


def split_env_list(value: str) -> list[str]:
    normalized = value.replace("||", "\n")
    return [line.strip() for line in normalized.splitlines() if line.strip()]


def normalize_headers(raw_headers: Any) -> dict[str, str]:
    if not isinstance(raw_headers, dict):
        return {}

    normalized: dict[str, str] = {}
    for key, value in raw_headers.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        normalized[key] = value

    return normalized


def is_direct_media_url(url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False

    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")
    if host in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}:
        return False

    return True


def get_cached_payload(cache: dict[str, tuple[float, CacheValue]], key: str) -> CacheValue | None:
    cleanup_expired_cache_entries(cache)
    cached = cache.get(key)
    if not cached:
        return None

    _, payload = cached
    return deepcopy(payload)


def set_cached_payload(cache: dict[str, tuple[float, CacheValue]], key: str, payload: CacheValue) -> None:
    cleanup_expired_cache_entries(cache)
    cache[key] = (time.time() + get_resolver_cache_ttl_seconds(), deepcopy(payload))


def cleanup_expired_cache_entries(cache: dict[str, tuple[float, CacheValue]]) -> None:
    now = time.time()
    expired_keys = [key for key, (expires_at, _) in cache.items() if expires_at <= now]
    for key in expired_keys:
        cache.pop(key, None)


def clear_resolver_caches() -> None:
    _track_payload_cache.clear()
    _playlist_entries_cache.clear()
