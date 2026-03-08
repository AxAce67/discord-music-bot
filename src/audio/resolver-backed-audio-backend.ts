import type pino from "pino";
import type { AudioBackend, JoinVoiceRequest, ResolvedTrack, ResolverSearchResult } from "./audio-backend.js";
import { AudioBackend as AbstractAudioBackend } from "./audio-backend.js";
import { MusicBotError } from "../errors/music-error.js";
import type { ResolverClient } from "../resolver/resolver-client.js";

export class ResolverBackedAudioBackend extends AbstractAudioBackend {
  constructor(
    private readonly resolverClient: ResolverClient,
    private readonly playbackBackend: AudioBackend,
    private readonly logger: pino.Logger
  ) {
    super();
    for (const eventName of ["trackEnd", "trackException", "voiceDisconnected"] as const) {
      this.playbackBackend.on(eventName, (...args) => this.emit(eventName, ...args));
    }
  }

  hasConnection(guildId: string): boolean {
    return this.playbackBackend.hasConnection(guildId);
  }

  getConnectedGuildIds(): string[] {
    return this.playbackBackend.getConnectedGuildIds();
  }

  async join(request: JoinVoiceRequest): Promise<void> {
    await this.playbackBackend.join(request);
  }

  async leave(guildId: string): Promise<void> {
    await this.playbackBackend.leave(guildId);
  }

  async resolve(query: string): Promise<ResolvedTrack[]> {
    if (isUrl(query)) {
      const tracks = await this.resolverClient.resolveTrack(query);
      return this.hydrateTracks(tracks, "TRACK_RESOLVE_FAILED");
    }

    const tracks = await this.resolverClient.search(query, 10);
    return this.hydrateTracks(tracks, "TRACK_NOT_FOUND", true);
  }

  async resolvePlaylist(query: string): Promise<ResolvedTrack[]> {
    const tracks = await this.resolverClient.resolvePlaylist(query);
    return this.hydrateTracks(tracks, "PLAYLIST_NOT_FOUND", true);
  }

  async play(guildId: string, encodedTrack: string): Promise<void> {
    await this.playbackBackend.play(guildId, encodedTrack);
  }

  getPlaybackPosition(guildId: string): number {
    return this.playbackBackend.getPlaybackPosition(guildId);
  }

  async pause(guildId: string): Promise<void> {
    await this.playbackBackend.pause(guildId);
  }

  async resume(guildId: string): Promise<void> {
    await this.playbackBackend.resume(guildId);
  }

  async stop(guildId: string): Promise<void> {
    await this.playbackBackend.stop(guildId);
  }

  private async hydrateTracks(
    tracks: ResolverSearchResult[],
    emptyErrorCode: "TRACK_NOT_FOUND" | "PLAYLIST_NOT_FOUND" | "TRACK_RESOLVE_FAILED",
    allowPartial = false
  ): Promise<ResolvedTrack[]> {
    if (tracks.length === 0) {
      throw new MusicBotError(
        emptyErrorCode,
        emptyErrorCode === "PLAYLIST_NOT_FOUND" ? "プレイリストを取得できませんでした" : "該当する曲が見つかりませんでした"
      );
    }

    const hydrated: ResolvedTrack[] = [];

    for (const track of tracks) {
      try {
        const resolved = await this.playbackBackend.resolve(track.url);
        const playableTrack = resolved[0];
        if (!playableTrack) {
          throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました");
        }

        hydrated.push({
          trackId: playableTrack.trackId,
          title: track.title,
          url: track.url,
          durationMs: track.durationMs,
          artworkUrl: track.artworkUrl,
          encodedTrack: playableTrack.encodedTrack,
          source: "youtube"
        });
      } catch (error) {
        this.logger.warn({ err: error, trackUrl: track.url }, "Failed to hydrate resolver track with Lavalink");
        if (!allowPartial) {
          throw error instanceof MusicBotError
            ? error
            : new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました");
        }
      }
    }

    if (hydrated.length === 0) {
      if (emptyErrorCode === "PLAYLIST_NOT_FOUND") {
        throw new MusicBotError("PLAYLIST_NOT_FOUND", "プレイリストを取得できませんでした");
      }

      throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました");
    }

    return hydrated;
  }
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
