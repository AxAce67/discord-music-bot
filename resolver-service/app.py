from __future__ import annotations

import logging
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.background import BackgroundTask
from starlette.responses import Response, StreamingResponse

from errors import ResolverError
from models import HealthResponse, ResolvePlaylistRequest, ResolveRequest, SearchRequest, TracksResponse
from streams import get_playback_source
from youtube import resolve_playlist, resolve_track, search_tracks


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


@app.post("/v1/resolve-playlist", response_model=TracksResponse)
async def resolve_playlist_endpoint(payload: ResolvePlaylistRequest) -> TracksResponse:
    return TracksResponse(tracks=resolve_playlist(str(payload.url)))


@app.api_route("/v1/stream/{token}", methods=["GET", "HEAD"])
async def stream_media(token: str, request: Request) -> Response:
    source = get_playback_source(token)
    if source is None:
        return JSONResponse(status_code=404, content={"error": {"code": "STREAM_NOT_FOUND", "message": "Stream not found"}})

    headers = dict(source.headers)
    forwarded_range = request.headers.get("range")
    if forwarded_range:
        headers["Range"] = forwarded_range

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    request_object = client.build_request(request.method, source.upstream_url, headers=headers)
    upstream = await client.send(request_object, stream=True)

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

    return StreamingResponse(
        upstream.aiter_bytes(),
        status_code=upstream.status_code,
        headers=response_headers,
        background=BackgroundTask(close_upstream_stream, upstream, client),
    )


async def close_upstream_stream(response: httpx.Response, client: httpx.AsyncClient) -> None:
    await response.aclose()
    await client.aclose()
