from __future__ import annotations

import asyncio
import logging
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.background import BackgroundTask
from starlette.responses import Response, StreamingResponse

from errors import ResolverError
from models import HealthResponse, PlaylistTracksResponse, ResolvePlaylistRequest, ResolveRequest, SearchRequest, TracksResponse
from streams import get_playback_source
from youtube import get_stream_command, resolve_playlist, resolve_track, search_tracks


def configure_logging() -> None:
    level_name = os.getenv("RESOLVER_LOG_LEVEL", "info").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


configure_logging()

app = FastAPI(title="Kanade Resolver Service", version="0.1.0")


@app.exception_handler(ResolverError)
async def handle_resolver_error(_request: Request, error: ResolverError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content=error.to_payload())


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/v1/search", response_model=TracksResponse)
async def search(payload: SearchRequest) -> TracksResponse:
    return TracksResponse(tracks=search_tracks(payload.query, payload.limit))


@app.post("/v1/resolve", response_model=TracksResponse)
async def resolve(payload: ResolveRequest) -> TracksResponse:
    return TracksResponse(tracks=resolve_track(str(payload.url)))


@app.post("/v1/resolve-playlist", response_model=PlaylistTracksResponse)
async def resolve_playlist_endpoint(payload: ResolvePlaylistRequest) -> PlaylistTracksResponse:
    tracks, total_count, next_offset = resolve_playlist(str(payload.url), offset=payload.offset, limit=payload.limit)
    return PlaylistTracksResponse(tracks=tracks, totalCount=total_count, nextOffset=next_offset)


@app.api_route("/v1/stream/{token}", methods=["GET", "HEAD"])
async def stream_media(token: str, request: Request) -> Response:
    source = get_playback_source(token)
    if source is None:
        return JSONResponse(status_code=404, content={"error": {"code": "STREAM_NOT_FOUND", "message": "Stream not found"}})

    direct_response = await try_open_upstream_stream(source, request)
    if direct_response is not None:
        return direct_response

    return await stream_via_yt_dlp(source.source_url, request)


async def try_open_upstream_stream(source, request: Request) -> Response | None:
    if not source.upstream_url:
        return None

    headers = dict(source.headers)
    forwarded_range = request.headers.get("range")
    if forwarded_range:
        headers["Range"] = forwarded_range

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    request_object = client.build_request(request.method, source.upstream_url, headers=headers)
    upstream = await client.send(request_object, stream=True)
    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        return None

    response_headers = {
        header: value
        for header, value in upstream.headers.items()
        if header.lower()
        in {"accept-ranges", "cache-control", "content-length", "content-range", "content-type", "etag", "last-modified"}
    }

    if request.method == "HEAD":
        await upstream.aclose()
        await client.aclose()
        return Response(status_code=upstream.status_code, headers=response_headers)

    byte_iterator = upstream.aiter_raw(chunk_size=65536)
    try:
        first_chunk = await asyncio.wait_for(anext(byte_iterator), timeout=5)
    except StopAsyncIteration:
        await upstream.aclose()
        await client.aclose()
        return Response(status_code=upstream.status_code, headers=response_headers)
    except Exception:
        await upstream.aclose()
        await client.aclose()
        return None

    return StreamingResponse(
        chain_stream_chunks(first_chunk, byte_iterator),
        status_code=upstream.status_code,
        headers=response_headers,
        background=BackgroundTask(close_upstream_stream, upstream, client),
    )


async def stream_via_yt_dlp(source_url: str, request: Request) -> Response:
    if request.method == "HEAD":
        return Response(status_code=200, headers={"content-type": "application/octet-stream"})

    process = await asyncio.create_subprocess_exec(
        *get_stream_command(source_url),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    if process.stdout is None or process.stderr is None:
        raise ResolverError("UPSTREAM_FAILED", "yt-dlp stream could not be opened", 502)

    return StreamingResponse(
        iter_process_stdout(process),
        status_code=200,
        media_type="application/octet-stream",
        background=BackgroundTask(close_process_stream, process),
    )


async def close_upstream_stream(response: httpx.Response, client: httpx.AsyncClient) -> None:
    await response.aclose()
    await client.aclose()


async def chain_stream_chunks(first_chunk: bytes, iterator):
    if first_chunk:
        yield first_chunk

    async for chunk in iterator:
        yield chunk


async def iter_process_stdout(process: asyncio.subprocess.Process):
    if process.stdout is None:
        return

    while True:
        chunk = await process.stdout.read(65536)
        if not chunk:
            break
        yield chunk


async def close_process_stream(process: asyncio.subprocess.Process) -> None:
    stderr_output = b""
    if process.stderr is not None:
        try:
            stderr_output = await asyncio.wait_for(process.stderr.read(), timeout=1)
        except TimeoutError:
            stderr_output = b""

    if process.returncode is None:
        process.kill()
        await process.wait()

    if process.returncode not in (0, None):
        logging.getLogger("resolver.stream").warning(
            "yt-dlp stream process exited with code %s: %s",
            process.returncode,
            stderr_output.decode("utf-8", errors="ignore").strip(),
        )
