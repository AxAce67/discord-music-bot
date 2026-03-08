from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from errors import ResolverError
from models import HealthResponse, ResolvePlaylistRequest, ResolveRequest, SearchRequest, TracksResponse
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
