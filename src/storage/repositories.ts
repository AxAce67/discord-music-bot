import type { SqliteDatabase } from "./database.js";
import type { GuildQueueState, GuildSettings, LanguageCode, QueueTrack, RepeatMode } from "../types/music.js";
import { createEmptyQueueState } from "../types/music.js";

export interface QueueRepository {
  loadQueue(guildId: string): Promise<GuildQueueState | null>;
  saveQueue(state: GuildQueueState): Promise<void>;
  deleteQueue(guildId: string): Promise<void>;
  listRecoverableQueues(): Promise<GuildQueueState[]>;
}

export interface SettingsRepository {
  loadSettings(guildId: string): Promise<GuildSettings>;
  saveSettings(settings: GuildSettings): Promise<void>;
}

function mapTrack(row: Record<string, unknown>): QueueTrack {
  return {
    trackId: String(row.track_id),
    title: String(row.title),
    url: String(row.url),
    durationMs: Number(row.duration_ms),
    artworkUrl: row.artwork_url ? String(row.artwork_url) : undefined,
    requestedBy: String(row.requested_by),
    source: "youtube",
    encodedTrack: String(row.encoded_track)
  };
}

function mapRepeatMode(value: unknown): RepeatMode {
  return value === "track" ? "track" : "off";
}

function mapLanguage(value: unknown): LanguageCode {
  return value === "en" ? "en" : "ja";
}

export class SqliteQueueRepository implements QueueRepository {
  constructor(private readonly db: SqliteDatabase) {}

  async loadQueue(guildId: string): Promise<GuildQueueState | null> {
    const stateRow = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM guild_queue_state WHERE guild_id = ?`,
      guildId
    );

    if (!stateRow) {
      return null;
    }

    const trackRows = await this.db.all<Record<string, unknown>[]>(
      `SELECT * FROM guild_queue_tracks WHERE guild_id = ? ORDER BY is_current DESC, position ASC`,
      guildId
    );

    const currentTrack = trackRows.find((row) => Number(row.is_current) === 1);
    const upcomingTracks = trackRows
      .filter((row) => Number(row.is_current) === 0)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map(mapTrack);

    return {
      guildId,
      textChannelId: stateRow.text_channel_id ? String(stateRow.text_channel_id) : null,
      voiceChannelId: stateRow.voice_channel_id ? String(stateRow.voice_channel_id) : null,
      controlMessageId: stateRow.control_message_id ? String(stateRow.control_message_id) : null,
      currentTrack: currentTrack ? mapTrack(currentTrack) : null,
      upcomingTracks,
      isPlaying: Number(stateRow.is_playing) === 1,
      isPaused: Number(stateRow.is_paused ?? 0) === 1,
      isStopped: Number(stateRow.is_stopped) === 1,
      repeatMode: mapRepeatMode(stateRow.repeat_mode),
      updatedAt: Number(stateRow.updated_at)
    };
  }

  async saveQueue(state: GuildQueueState): Promise<void> {
    await this.db.exec("BEGIN");

    try {
      await this.db.run(
        `INSERT INTO guild_queue_state (
          guild_id, text_channel_id, voice_channel_id, control_message_id, is_playing, is_paused, is_stopped, repeat_mode, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          text_channel_id = excluded.text_channel_id,
          voice_channel_id = excluded.voice_channel_id,
          control_message_id = excluded.control_message_id,
          is_playing = excluded.is_playing,
          is_paused = excluded.is_paused,
          is_stopped = excluded.is_stopped,
          repeat_mode = excluded.repeat_mode,
          updated_at = excluded.updated_at`,
        state.guildId,
        state.textChannelId,
        state.voiceChannelId,
        state.controlMessageId,
        state.isPlaying ? 1 : 0,
        state.isPaused ? 1 : 0,
        state.isStopped ? 1 : 0,
        state.repeatMode,
        state.updatedAt
      );

      await this.db.run(`DELETE FROM guild_queue_tracks WHERE guild_id = ?`, state.guildId);

      if (state.currentTrack) {
        await this.insertTrack(state.guildId, 0, true, state.currentTrack);
      }

      for (const [index, track] of state.upcomingTracks.entries()) {
        await this.insertTrack(state.guildId, index, false, track);
      }

      await this.db.exec("COMMIT");
    } catch (error) {
      await this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteQueue(guildId: string): Promise<void> {
    await this.db.exec("BEGIN");

    try {
      await this.db.run(`DELETE FROM guild_queue_tracks WHERE guild_id = ?`, guildId);
      await this.db.run(`DELETE FROM guild_queue_state WHERE guild_id = ?`, guildId);
      await this.db.exec("COMMIT");
    } catch (error) {
      await this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async listRecoverableQueues(): Promise<GuildQueueState[]> {
    const rows = await this.db.all<{ guild_id: string }[]>(`SELECT guild_id FROM guild_queue_state`);
    const states = await Promise.all(rows.map((row) => this.loadQueue(row.guild_id)));
    return states.filter((state): state is GuildQueueState => state !== null);
  }

  private async insertTrack(
    guildId: string,
    position: number,
    isCurrent: boolean,
    track: QueueTrack
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO guild_queue_tracks (
        guild_id, position, is_current, track_id, title, url, duration_ms, artwork_url, requested_by, source, encoded_track
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      guildId,
      position,
      isCurrent ? 1 : 0,
      track.trackId,
      track.title,
      track.url,
      track.durationMs,
      track.artworkUrl ?? null,
      track.requestedBy,
      track.source,
      track.encodedTrack
    );
  }
}

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: SqliteDatabase, private readonly defaultPrefix: string) {}

  async loadSettings(guildId: string): Promise<GuildSettings> {
    const row = await this.db.get<Record<string, unknown>>(
      `SELECT * FROM guild_settings WHERE guild_id = ?`,
      guildId
    );

    if (!row) {
      const settings = { guildId, prefix: this.defaultPrefix, defaultVolume: 100, language: "ja" as const };
      await this.saveSettings(settings);
      return settings;
    }

    return {
      guildId,
      prefix: String(row.prefix),
      defaultVolume: Number(row.default_volume),
      language: mapLanguage(row.language)
    };
  }

  async saveSettings(settings: GuildSettings): Promise<void> {
    await this.db.run(
      `INSERT INTO guild_settings (guild_id, prefix, default_volume, language)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        prefix = excluded.prefix,
        default_volume = excluded.default_volume,
        language = excluded.language`,
      settings.guildId,
      settings.prefix,
      settings.defaultVolume,
      settings.language
    );
  }
}

export class InMemoryQueueRepository implements QueueRepository {
  private readonly queues = new Map<string, GuildQueueState>();

  async loadQueue(guildId: string): Promise<GuildQueueState | null> {
    return this.queues.get(guildId) ?? null;
  }

  async saveQueue(state: GuildQueueState): Promise<void> {
    this.queues.set(state.guildId, structuredClone(state));
  }

  async deleteQueue(guildId: string): Promise<void> {
    this.queues.delete(guildId);
  }

  async listRecoverableQueues(): Promise<GuildQueueState[]> {
    return [...this.queues.values()].map((state) => structuredClone(state));
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly settings = new Map<string, GuildSettings>();

  constructor(private readonly defaultPrefix: string) {}

  async loadSettings(guildId: string): Promise<GuildSettings> {
    const settings = this.settings.get(guildId) ?? {
      guildId,
      prefix: this.defaultPrefix,
      defaultVolume: 100,
      language: "ja" as const
    };
    this.settings.set(guildId, settings);
    return settings;
  }

  async saveSettings(settings: GuildSettings): Promise<void> {
    this.settings.set(settings.guildId, settings);
  }
}

export async function loadOrCreateQueueState(
  repository: QueueRepository,
  guildId: string
): Promise<GuildQueueState> {
  return (await repository.loadQueue(guildId)) ?? createEmptyQueueState(guildId);
}
