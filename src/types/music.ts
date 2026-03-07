export type GuildId = string;
export type UserId = string;
export type TextChannelId = string;
export type VoiceChannelId = string;
export type MessageId = string;
export type RepeatMode = "off" | "track";
export type LanguageCode = "ja" | "en";

export interface TrackRequest {
  query: string;
  requestedBy: UserId;
  requestedAt: number;
}

export interface QueueTrack {
  trackId: string;
  title: string;
  url: string;
  durationMs: number;
  artworkUrl?: string;
  requestedBy: UserId;
  source: "youtube";
  encodedTrack: string;
}

export interface GuildQueueState {
  guildId: GuildId;
  textChannelId: TextChannelId | null;
  voiceChannelId: VoiceChannelId | null;
  controlMessageId: MessageId | null;
  currentTrack: QueueTrack | null;
  upcomingTracks: QueueTrack[];
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  repeatMode: RepeatMode;
  updatedAt: number;
}

export interface GuildSettings {
  guildId: GuildId;
  prefix: string;
  defaultVolume: number;
  language: LanguageCode;
}

export interface QueueView {
  currentTrack: QueueTrack | null;
  upcomingTracks: QueueTrack[];
  totalCount: number;
}

export function createEmptyQueueState(guildId: GuildId): GuildQueueState {
  return {
    guildId,
    textChannelId: null,
    voiceChannelId: null,
    controlMessageId: null,
    currentTrack: null,
    upcomingTracks: [],
    isPlaying: false,
    isPaused: false,
    isStopped: true,
    repeatMode: "off",
    updatedAt: Date.now()
  };
}
