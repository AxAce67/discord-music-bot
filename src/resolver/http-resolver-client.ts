import type pino from "pino";
import { MusicBotError } from "../errors/music-error.js";
import type { ResolverSearchResult } from "../audio/audio-backend.js";
import type { ResolverClient } from "./resolver-client.js";

interface ResolverErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

interface ResolverTracksPayload {
  tracks?: ResolverSearchResult[];
}

export class HttpResolverClient implements ResolverClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly logger: pino.Logger
  ) {}

  async search(query: string, limit = 10): Promise<ResolverSearchResult[]> {
    const payload = await this.postJson<ResolverTracksPayload>("/v1/search", { query, limit });
    return validateTracksPayload(payload);
  }

  async resolveTrack(url: string): Promise<ResolverSearchResult[]> {
    const payload = await this.postJson<ResolverTracksPayload>("/v1/resolve", { url });
    return validateTracksPayload(payload);
  }

  async resolvePlaylist(url: string): Promise<ResolverSearchResult[]> {
    const payload = await this.postJson<ResolverTracksPayload>("/v1/resolve-playlist", { url });
    return validateTracksPayload(payload);
  }

  private async postJson<T>(pathname: string, body: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(new URL(pathname, this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => null)) as T | ResolverErrorPayload | null;
      if (!response.ok) {
        throw mapResolverHttpError(response.status, asResolverErrorPayload(payload));
      }

      if (!payload) {
        throw new MusicBotError(
          "RESOLVER_BAD_RESPONSE",
          "曲情報の取得サービスから正しい応答を受け取れませんでした"
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof MusicBotError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new MusicBotError(
          "RESOLVER_UNAVAILABLE",
          "曲情報の取得サービスに接続できませんでした"
        );
      }

      this.logger.warn({ err: error, baseUrl: this.baseUrl, pathname }, "Resolver request failed");
      throw new MusicBotError(
        "RESOLVER_UNAVAILABLE",
        "曲情報の取得サービスに接続できませんでした"
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function validateTracksPayload(payload: ResolverTracksPayload): ResolverSearchResult[] {
  if (!Array.isArray(payload.tracks)) {
    throw new MusicBotError(
      "RESOLVER_BAD_RESPONSE",
      "曲情報の取得サービスから正しい応答を受け取れませんでした"
    );
  }

  return payload.tracks.map((track) => ({
    trackId: String(track.trackId),
    title: String(track.title),
    url: String(track.url),
    durationMs: Number(track.durationMs),
    artworkUrl: track.artworkUrl ? String(track.artworkUrl) : undefined,
    source: "youtube"
  }));
}

function mapResolverHttpError(status: number, payload: ResolverErrorPayload | null): MusicBotError {
  const code = payload?.error?.code ?? "UPSTREAM_FAILED";

  if (code === "TRACK_NOT_FOUND") {
    return new MusicBotError("TRACK_NOT_FOUND", "該当する曲が見つかりませんでした");
  }

  if (code === "PLAYLIST_NOT_FOUND") {
    return new MusicBotError("PLAYLIST_NOT_FOUND", "プレイリストを取得できませんでした");
  }

  if (code === "TIMEOUT") {
    return new MusicBotError("RESOLVER_UNAVAILABLE", "曲情報の取得サービスに接続できませんでした");
  }

  if (status === 400) {
    return new MusicBotError("BAD_REQUEST", "曲情報の取得に失敗しました");
  }

  if (status >= 500) {
    return new MusicBotError("RESOLVER_UPSTREAM_FAILED", "曲情報の取得に失敗しました");
  }

  return new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました");
}

function asResolverErrorPayload(payload: unknown): ResolverErrorPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload as ResolverErrorPayload;
}
