from __future__ import annotations

from pydantic import BaseModel, Field, HttpUrl


class HealthResponse(BaseModel):
    status: str


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    limit: int = Field(default=10, ge=1, le=10)


class ResolveRequest(BaseModel):
    url: HttpUrl


class ResolvePlaylistRequest(BaseModel):
    url: HttpUrl


class TrackPayload(BaseModel):
    trackId: str
    title: str
    url: str
    playbackUrl: str | None = None
    durationMs: int
    artworkUrl: str | None = None
    source: str = "youtube"


class TracksResponse(BaseModel):
    tracks: list[TrackPayload]
