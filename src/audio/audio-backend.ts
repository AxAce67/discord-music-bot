import { EventEmitter } from "node:events";
import type { GuildId, TextChannelId, VoiceChannelId } from "../types/music.js";

export interface ResolvedTrack {
  trackId: string;
  title: string;
  url: string;
  durationMs: number;
  artworkUrl?: string;
  source: "youtube";
  encodedTrack?: string;
  playbackIdentifier?: string;
}

export interface ResolverSearchResult {
  trackId: string;
  title: string;
  url: string;
  playbackUrl?: string;
  durationMs: number;
  artworkUrl?: string;
  source: "youtube";
}

export interface PlaylistResolveOptions {
  offset?: number;
  limit?: number;
}

export interface ResolvedPlaylist {
  tracks: ResolvedTrack[];
  totalCount: number;
  nextOffset?: number;
}

export interface JoinVoiceRequest {
  guildId: GuildId;
  voiceChannelId: VoiceChannelId;
  textChannelId: TextChannelId;
  shardId: number;
}

export abstract class AudioBackend extends EventEmitter {
  abstract hasConnection(guildId: GuildId): boolean;
  abstract getConnectedGuildIds(): GuildId[];
  abstract join(request: JoinVoiceRequest): Promise<void>;
  abstract leave(guildId: GuildId): Promise<void>;
  abstract resolve(query: string): Promise<ResolvedTrack[]>;
  abstract resolvePlaylist(query: string, options?: PlaylistResolveOptions): Promise<ResolvedPlaylist>;
  abstract play(
    guildId: GuildId,
    track: {
      encodedTrack?: string;
      playbackIdentifier?: string;
    }
  ): Promise<void>;
  abstract getPlaybackPosition(guildId: GuildId): number;
  abstract pause(guildId: GuildId): Promise<void>;
  abstract resume(guildId: GuildId): Promise<void>;
  abstract stop(guildId: GuildId): Promise<void>;
}
