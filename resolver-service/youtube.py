from __future__ import annotations

import json
import os
import subprocess
from typing import Any
from urllib.parse import parse_qs, urlparse

from errors import ResolverError
from models import TrackPayload

DEFAULT_LIMIT = 10
MAX_PLAYLIST_TRACKS = 100
SUBPROCESS_TIMEOUT_SECONDS = 12


def search_tracks(query: str, limit: int = DEFAULT_LIMIT) -> list[TrackPayload]:
    payload = run_yt_dlp(f"ytsearch{min(limit, DEFAULT_LIMIT)}:{query}")
    if payload.get("_type") == "playlist":
        return map_entries(payload.get("entries", []), min(limit, DEFAULT_LIMIT))

    track = map_track(payload)
    return [track] if track else []


def resolve_track(url: str) -> list[TrackPayload]:
    if is_playlist_url(url) and not has_video_id(url):
        raise ResolverError("BAD_REQUEST", "Playlist URLs are not accepted on this endpoint", 400)

    payload = run_yt_dlp(normalize_track_url(url))
    track = map_track(payload)
    if not track:
        raise ResolverError("TRACK_NOT_FOUND", "No playable track found", 404)

    return [track]


def resolve_playlist(url: str) -> list[TrackPayload]:
    if not is_playlist_url(url):
        raise ResolverError("BAD_REQUEST", "A playlist URL is required", 400)

    payload = run_yt_dlp(normalize_playlist_url(url))
    entries = map_entries(payload.get("entries", []), MAX_PLAYLIST_TRACKS)
    if not entries:
        raise ResolverError("PLAYLIST_NOT_FOUND", "No playable playlist entries found", 404)

    return entries


def run_yt_dlp(identifier: str) -> dict[str, Any]:
    command = [
        os.getenv("YTDLP_BINARY", "yt-dlp"),
        "--dump-single-json",
        "--skip-download",
        "--format",
        "bestaudio/best",
        "--no-warnings",
        "--no-call-home",
    ]

    cookies_file = os.getenv("YTDLP_COOKIES_FILE")
    if cookies_file:
        command.extend(["--cookies", cookies_file])

    command.append(identifier)

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ResolverError("TIMEOUT", "yt-dlp timed out", 504) from error
    except FileNotFoundError as error:
        raise ResolverError("UPSTREAM_FAILED", "yt-dlp is not installed", 502) from error

    if completed.returncode != 0:
        stderr = completed.stderr.lower()
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

    return TrackPayload(
        trackId=f"youtube:{video_id}",
        title=str(title),
        url=normalize_track_url(str(webpage_url)),
        playbackUrl=extract_playback_url(payload),
        durationMs=max(0, duration) * 1000,
        artworkUrl=str(payload.get("thumbnail")) if payload.get("thumbnail") else None,
    )


def is_playlist_url(url: str) -> bool:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    return "list" in query


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
            return f"https://www.youtube.com/playlist?list={playlist_id}"

    if host in {"youtube.com", "m.youtube.com"} and parsed.path == "/watch":
        params = parse_qs(parsed.query)
        video_id = params.get("v", [None])[0]
        playlist_id = params.get("list", [None])[0]
        if video_id and playlist_id:
            return f"https://www.youtube.com/watch?v={video_id}&list={playlist_id}"
        if playlist_id:
            return f"https://www.youtube.com/playlist?list={playlist_id}"

    return normalize_track_url(url)


def extract_playback_url(payload: dict[str, Any]) -> str | None:
    requested_downloads = payload.get("requested_downloads")
    if isinstance(requested_downloads, list):
        for entry in requested_downloads:
            if not isinstance(entry, dict):
                continue
            url = entry.get("url")
            if isinstance(url, str) and url.startswith(("http://", "https://")):
                return url

    direct_url = payload.get("url")
    if isinstance(direct_url, str) and direct_url.startswith(("http://", "https://")):
        return direct_url

    return None
