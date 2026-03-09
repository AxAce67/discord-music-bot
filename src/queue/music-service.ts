import { EventEmitter } from "node:events";
import type pino from "pino";
import type { AudioBackend, ResolvedTrack } from "../audio/audio-backend.js";
import type { QueueRepository } from "../storage/repositories.js";
import { loadOrCreateQueueState } from "../storage/repositories.js";
import type { BotStatsService } from "../stats/bot-stats-service.js";
import { MusicBotError } from "../errors/music-error.js";
import type {
  GuildQueueState,
  QueueTrack,
  QueueView,
  TextChannelId,
  TrackRequest,
  VoiceChannelId
} from "../types/music.js";

export interface JoinContext {
  guildId: string;
  voiceChannelId: VoiceChannelId;
  textChannelId: TextChannelId;
  shardId: number;
}

export interface MusicService {
  join(context: JoinContext): Promise<void>;
  enqueue(context: JoinContext, request: TrackRequest): Promise<QueueTrack>;
  enqueuePlaylist(context: JoinContext, request: TrackRequest): Promise<QueueTrack[]>;
  search(query: string): Promise<ResolvedTrack[]>;
  enqueueResolvedTrack(context: JoinContext, track: ResolvedTrack, requestedBy: string): Promise<QueueTrack>;
  togglePause(guildId: string): Promise<GuildQueueState>;
  resumeFromQueue(context: JoinContext): Promise<GuildQueueState>;
  skip(guildId: string): Promise<QueueTrack | null>;
  stop(guildId: string): Promise<void>;
  leave(guildId: string): Promise<void>;
  disconnectKeepingQueue(guildId: string): Promise<GuildQueueState>;
  resume(guildId: string, shardId: number): Promise<void>;
  normalizeRecoveredQueue(guildId: string): Promise<GuildQueueState>;
  getQueue(guildId: string): Promise<GuildQueueState>;
  getQueueView(guildId: string): Promise<QueueView>;
  getPlaybackPosition(guildId: string): number;
  removeUpcomingTrack(guildId: string, queueIndex: number): Promise<QueueTrack>;
  toggleRepeat(guildId: string): Promise<GuildQueueState>;
  shuffleUpcoming(guildId: string): Promise<GuildQueueState>;
  setControlMessageId(guildId: string, messageId: string | null): Promise<void>;
  recoverQueues(): Promise<GuildQueueState[]>;
  disconnectAllVoiceConnections(): Promise<void>;
  prepareForShutdown(): Promise<GuildQueueState[]>;
}

export class DefaultMusicService extends EventEmitter implements MusicService {
  private readonly suppressedTrackEndGuilds = new Set<string>();
  private readonly suppressedVoiceDisconnectGuilds = new Set<string>();
  private readonly trackFailureRecoveryTimers = new Map<string, NodeJS.Timeout>();
  private readonly trackEndHandler = async (guildId: string) => {
    this.clearTrackFailureRecovery(guildId);
    if (this.suppressedTrackEndGuilds.delete(guildId)) {
      this.logger.info({ guildId }, "Ignoring track end triggered by manual stop");
      return;
    }

    try {
      await this.advanceQueue(guildId);
    } catch (error) {
      this.logger.error({ err: error, guildId }, "Failed to advance queue");
    }
  };

  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly audioBackend: AudioBackend,
    private readonly botStatsService: BotStatsService,
    private readonly logger: pino.Logger
  ) {
    super();
    this.audioBackend.on("trackEnd", this.trackEndHandler);
    this.audioBackend.on("trackException", async (guildId: string) => {
      try {
        await this.scheduleTrackFailureRecovery(guildId);
      } catch (error) {
        this.logger.error({ err: error, guildId }, "Failed to schedule track failure recovery");
      }
    });
    this.audioBackend.on("voiceDisconnected", async (guildId: string) => {
      try {
        if (this.suppressedVoiceDisconnectGuilds.delete(guildId)) {
          this.logger.info({ guildId }, "Ignoring voice disconnect triggered by manual leave");
          return;
        }
        await this.handleVoiceDisconnected(guildId);
      } catch (error) {
        this.logger.error({ err: error, guildId }, "Failed to normalize queue after voice disconnect");
      }
    });
  }

  async join(context: JoinContext): Promise<void> {
    this.logger.info(
      {
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        textChannelId: context.textChannelId
      },
      "Joining voice channel"
    );
    const state = await loadOrCreateQueueState(this.queueRepository, context.guildId);
    state.voiceChannelId = context.voiceChannelId;
    state.textChannelId = context.textChannelId;
    state.updatedAt = Date.now();

    await this.audioBackend.join({
      guildId: context.guildId,
      voiceChannelId: context.voiceChannelId,
      textChannelId: context.textChannelId,
      shardId: context.shardId
    });

    await this.queueRepository.saveQueue(state);
  }

  async enqueue(context: JoinContext, request: TrackRequest): Promise<QueueTrack> {
    this.logger.info(
      {
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        query: request.query,
        requestedBy: request.requestedBy
      },
      "Queueing track request"
    );
    const state = await loadOrCreateQueueState(this.queueRepository, context.guildId);
    state.voiceChannelId = context.voiceChannelId;
    state.textChannelId = context.textChannelId;

    const joinPromise = this.startJoinIfNeeded(context, "No active Lavalink connection, joining before playback");
    const resolved = await this.audioBackend.resolve(request.query);
    await joinPromise;
    const selectedTrack = resolved[0];

    if (!selectedTrack) {
      throw new MusicBotError("TRACK_NOT_FOUND", "該当する曲が見つかりませんでした。");
    }

    return this.enqueueResolved(context, state, selectedTrack, request.requestedBy);
  }

  async enqueuePlaylist(context: JoinContext, request: TrackRequest): Promise<QueueTrack[]> {
    this.logger.info(
      {
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        query: request.query,
        requestedBy: request.requestedBy
      },
      "Queueing playlist request"
    );
    const state = await loadOrCreateQueueState(this.queueRepository, context.guildId);
    state.voiceChannelId = context.voiceChannelId;
    state.textChannelId = context.textChannelId;

    const joinPromise = this.startJoinIfNeeded(
      context,
      "No active Lavalink connection, joining before playlist playback"
    );
    const resolved = await this.audioBackend.resolvePlaylist(request.query);
    await joinPromise;
    if (resolved.length === 0) {
      throw new MusicBotError("TRACK_NOT_FOUND", "プレイリストの曲が見つかりませんでした。");
    }

    const queuedTracks = resolved.map((track) => createQueueTrack(track, request.requestedBy));
    const startedImmediately = state.currentTrack === null;
    if (!startedImmediately) {
      state.upcomingTracks.push(...queuedTracks);
      state.updatedAt = Date.now();
      await this.queueRepository.saveQueue(state);
      return queuedTracks;
    }

    const [firstTrack, ...upcomingTracks] = queuedTracks;
    if (!firstTrack) {
      throw new MusicBotError("PLAYLIST_NOT_FOUND", "プレイリストを取得できませんでした。");
    }

    state.currentTrack = firstTrack;
    state.upcomingTracks.push(...upcomingTracks);
    state.isPlaying = true;
    state.isPaused = false;
    state.isStopped = false;
    state.updatedAt = Date.now();

    this.logger.info({ guildId: context.guildId, trackTitle: firstTrack.title }, "Playing track immediately");
    const startedTrack = await this.startPlaybackFromCurrent(context.guildId, state, true);
    if (!startedTrack) {
      throw new MusicBotError("PLAYLIST_NOT_FOUND", "プレイリストを取得できませんでした。");
    }

    return [startedTrack, ...state.upcomingTracks];
  }

  async search(query: string): Promise<ResolvedTrack[]> {
    return this.audioBackend.resolve(query);
  }

  async enqueueResolvedTrack(context: JoinContext, track: ResolvedTrack, requestedBy: string): Promise<QueueTrack> {
    const state = await loadOrCreateQueueState(this.queueRepository, context.guildId);
    state.voiceChannelId = context.voiceChannelId;
    state.textChannelId = context.textChannelId;

    await this.startJoinIfNeeded(context, "No active Lavalink connection, joining before playback");

    return this.enqueueResolved(context, state, track, requestedBy);
  }

  async skip(guildId: string): Promise<QueueTrack | null> {
    this.logger.info({ guildId }, "Skipping current track");
    const state = await this.getQueue(guildId);
    if (!state.currentTrack) {
      throw new MusicBotError("QUEUE_EMPTY", "現在再生中の曲はありません。");
    }

    const upcoming = state.upcomingTracks[0] ?? null;
    state.repeatMode = "off";
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    this.suppressedTrackEndGuilds.add(guildId);
    await this.audioBackend.stop(guildId);
    await this.advanceQueue(guildId);
    return upcoming;
  }

  async togglePause(guildId: string): Promise<GuildQueueState> {
    const state = await this.getQueue(guildId);
    if (!state.currentTrack) {
      throw new MusicBotError("QUEUE_EMPTY", "現在再生中の曲はありません。");
    }

    if (state.isPaused) {
      await this.audioBackend.resume(guildId);
      state.isPaused = false;
      state.isPlaying = true;
    } else {
      await this.audioBackend.pause(guildId);
      state.isPaused = true;
      state.isPlaying = false;
    }

    state.isStopped = false;
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return state;
  }

  async resumeFromQueue(context: JoinContext): Promise<GuildQueueState> {
    const state = await this.getQueue(context.guildId);
    if (state.currentTrack) {
      return state;
    }

    const nextTrack = state.upcomingTracks.shift() ?? null;
    if (!nextTrack) {
      throw new MusicBotError("QUEUE_EMPTY", "再開できる曲がありません。");
    }

    state.voiceChannelId = context.voiceChannelId;
    state.textChannelId = context.textChannelId;
    state.currentTrack = nextTrack;
    state.isPlaying = true;
    state.isPaused = false;
    state.isStopped = false;
    state.updatedAt = Date.now();

    if (!this.audioBackend.hasConnection(context.guildId)) {
      await this.audioBackend.join({
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        textChannelId: context.textChannelId,
        shardId: context.shardId
      });
    }

    const startedTrack = await this.startPlaybackFromCurrent(context.guildId, state, true);
    if (!startedTrack) {
      throw new MusicBotError("QUEUE_EMPTY", "再開できる曲がありません。");
    }
    return state;
  }

  async stop(guildId: string): Promise<void> {
    this.logger.info({ guildId }, "Stopping playback and clearing queue");
    this.clearTrackFailureRecovery(guildId);
    const state = await this.getQueue(guildId);
    if (state.currentTrack) {
      this.suppressedTrackEndGuilds.add(guildId);
      await this.audioBackend.stop(guildId);
    }

    state.currentTrack = null;
    state.upcomingTracks = [];
    state.isPlaying = false;
    state.isPaused = false;
    state.isStopped = true;
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
  }

  async leave(guildId: string): Promise<void> {
    this.logger.info({ guildId }, "Leaving voice channel and clearing queue");
    this.clearTrackFailureRecovery(guildId);
    this.suppressedVoiceDisconnectGuilds.add(guildId);
    await this.audioBackend.leave(guildId);
    await this.queueRepository.deleteQueue(guildId);
  }

  async disconnectKeepingQueue(guildId: string): Promise<GuildQueueState> {
    this.logger.info({ guildId }, "Leaving voice channel and keeping queue");
    this.clearTrackFailureRecovery(guildId);
    this.suppressedVoiceDisconnectGuilds.add(guildId);
    await this.audioBackend.leave(guildId);
    const state = await this.getQueue(guildId);
    return this.normalizeDisconnectedState(state);
  }

  async resume(guildId: string, shardId: number): Promise<void> {
    const state = await this.getQueue(guildId);
    if (!state.voiceChannelId || !state.textChannelId) {
      return;
    }

    await this.audioBackend.join({
      guildId,
      voiceChannelId: state.voiceChannelId,
      textChannelId: state.textChannelId,
      shardId
    });

    if (state.currentTrack) {
      await this.startPlaybackFromCurrent(guildId, state, true);
    }
  }

  async normalizeRecoveredQueue(guildId: string): Promise<GuildQueueState> {
    const state = await this.getQueue(guildId);
    return this.normalizeDisconnectedState(state);
  }

  async getQueue(guildId: string): Promise<GuildQueueState> {
    return loadOrCreateQueueState(this.queueRepository, guildId);
  }

  async getQueueView(guildId: string): Promise<QueueView> {
    const state = await this.getQueue(guildId);
    return {
      currentTrack: state.currentTrack,
      upcomingTracks: state.upcomingTracks,
      totalCount: (state.currentTrack ? 1 : 0) + state.upcomingTracks.length
    };
  }

  getPlaybackPosition(guildId: string): number {
    return this.audioBackend.getPlaybackPosition(guildId);
  }

  async removeUpcomingTrack(guildId: string, queueIndex: number): Promise<QueueTrack> {
    const state = await this.getQueue(guildId);
    if (queueIndex < 0 || queueIndex >= state.upcomingTracks.length) {
      throw new MusicBotError("QUEUE_INDEX_INVALID", "削除対象の曲が見つかりません。");
    }

    const [removedTrack] = state.upcomingTracks.splice(queueIndex, 1);
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return removedTrack;
  }

  async toggleRepeat(guildId: string): Promise<GuildQueueState> {
    const state = await this.getQueue(guildId);
    state.repeatMode = state.repeatMode === "track" ? "off" : "track";
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return state;
  }

  async shuffleUpcoming(guildId: string): Promise<GuildQueueState> {
    const state = await this.getQueue(guildId);
    if (state.upcomingTracks.length < 2) {
      return state;
    }

    state.upcomingTracks = shuffle(state.upcomingTracks);
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return state;
  }

  async setControlMessageId(guildId: string, messageId: string | null): Promise<void> {
    const state = await loadOrCreateQueueState(this.queueRepository, guildId);
    state.controlMessageId = messageId;
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
  }

  async recoverQueues(): Promise<GuildQueueState[]> {
    return this.queueRepository.listRecoverableQueues();
  }

  async disconnectAllVoiceConnections(): Promise<void> {
    const guildIds = this.audioBackend.getConnectedGuildIds();
    await Promise.all(
      guildIds.map(async (guildId) => {
        try {
          this.suppressedVoiceDisconnectGuilds.add(guildId);
          await this.audioBackend.leave(guildId);
        } catch (error) {
          this.logger.warn({ err: error, guildId }, "Failed to leave voice channel during shutdown");
        }
      })
    );
  }

  async prepareForShutdown(): Promise<GuildQueueState[]> {
    const states = await this.recoverQueues();
    const normalizedStates: GuildQueueState[] = [];

    for (const state of states) {
      if (!state.currentTrack && !state.voiceChannelId && !state.isPlaying && !state.isPaused) {
        continue;
      }

      normalizedStates.push(await this.normalizeDisconnectedState(state));
    }

    return normalizedStates;
  }

  private async advanceQueue(guildId: string): Promise<void> {
    const state = await this.getQueue(guildId);
    if (!state.currentTrack) {
      return;
    }

    if (state.repeatMode === "track") {
      const repeatedTrack = await this.startPlaybackFromCurrent(guildId, state, false);
      if (!repeatedTrack) {
        throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。");
      }
      return;
    }

    const nextTrack = state.upcomingTracks.shift() ?? null;
    state.currentTrack = nextTrack;
    state.isPlaying = nextTrack !== null;
    state.isPaused = false;
    state.isStopped = nextTrack === null;
    state.updatedAt = Date.now();

    if (nextTrack) {
      this.logger.info({ guildId, trackTitle: nextTrack.title }, "Advancing to next track");
      const startedTrack = await this.startPlaybackFromCurrent(guildId, state, true);
      if (startedTrack) {
        this.emit("trackAdvanced", guildId);
        return;
      }
    } else {
      await this.queueRepository.saveQueue(state);
    }

    if (state.currentTrack) {
      this.emit("trackAdvanced", guildId);
      return;
    }

    this.suppressedTrackEndGuilds.add(guildId);
    await this.audioBackend.stop(guildId).catch((error) => {
      this.logger.warn({ err: error, guildId }, "Failed to clear player after queue end");
    });
    this.logger.info({ guildId }, "Queue finished, switching to idle control state");
    this.emit("queueEnded", guildId);
  }

  private async handleVoiceDisconnected(guildId: string): Promise<void> {
    this.clearTrackFailureRecovery(guildId);
    const state = await this.getQueue(guildId);
    await this.normalizeDisconnectedState(state);
  }

  private async scheduleTrackFailureRecovery(guildId: string): Promise<void> {
    const state = await this.getQueue(guildId);
    const failedTrackId = state.currentTrack?.trackId;
    if (!failedTrackId) {
      return;
    }

    this.clearTrackFailureRecovery(guildId);
    const timer = setTimeout(() => {
      void this.recoverFromTrackFailure(guildId, failedTrackId);
    }, 1500);
    this.trackFailureRecoveryTimers.set(guildId, timer);
  }

  private async recoverFromTrackFailure(guildId: string, failedTrackId: string): Promise<void> {
    this.clearTrackFailureRecovery(guildId);
    const state = await this.getQueue(guildId);
    if (!state.currentTrack || state.currentTrack.trackId !== failedTrackId) {
      return;
    }

    this.logger.warn({ guildId, trackTitle: state.currentTrack.title }, "Recovering from track failure");
    state.repeatMode = "off";
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);

    this.suppressedTrackEndGuilds.add(guildId);
    await this.audioBackend.stop(guildId).catch((error) => {
      this.logger.warn({ err: error, guildId }, "Failed to stop failed track during recovery");
    });
    await this.advanceQueue(guildId);
  }

  private clearTrackFailureRecovery(guildId: string): void {
    const timer = this.trackFailureRecoveryTimers.get(guildId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.trackFailureRecoveryTimers.delete(guildId);
  }

  private async normalizeDisconnectedState(state: GuildQueueState): Promise<GuildQueueState> {
    if (state.currentTrack) {
      state.upcomingTracks.unshift(state.currentTrack);
      state.currentTrack = null;
    }

    state.voiceChannelId = null;
    state.isPlaying = false;
    state.isPaused = false;
    state.isStopped = true;
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return state;
  }

  private async enqueueResolved(
    context: JoinContext,
    state: GuildQueueState,
    selectedTrack: ResolvedTrack,
    requestedBy: string
  ): Promise<QueueTrack> {
    const queueTrack = createQueueTrack(selectedTrack, requestedBy);

    if (!state.currentTrack) {
      state.currentTrack = queueTrack;
      state.isPlaying = true;
      state.isPaused = false;
      state.isStopped = false;
      this.logger.info({ guildId: context.guildId, trackTitle: queueTrack.title }, "Playing track immediately");
      const startedTrack = await this.startPlaybackFromCurrent(context.guildId, state, false);
      if (!startedTrack) {
        throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。");
      }
      return startedTrack;
    } else {
      this.logger.info({ guildId: context.guildId, trackTitle: queueTrack.title }, "Appending track to queue");
      state.upcomingTracks.push(queueTrack);
    }

    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return queueTrack;
  }

  private startJoinIfNeeded(context: JoinContext, logMessage: string): Promise<void> {
    if (this.audioBackend.hasConnection(context.guildId)) {
      return Promise.resolve();
    }

    this.logger.info({ guildId: context.guildId }, logMessage);
    return this.audioBackend.join({
      guildId: context.guildId,
      voiceChannelId: context.voiceChannelId,
      textChannelId: context.textChannelId,
      shardId: context.shardId
    });
  }

  private async startPlaybackFromCurrent(
    guildId: string,
    state: GuildQueueState,
    allowSkipOnFailure: boolean
  ): Promise<QueueTrack | null> {
    while (state.currentTrack) {
      const requestedTrack = state.currentTrack;
      try {
        const playableTrack = await this.ensurePlayableTrack(requestedTrack);
        state.currentTrack = playableTrack;
        state.isPlaying = true;
        state.isPaused = false;
        state.isStopped = false;
        state.updatedAt = Date.now();
        await this.audioBackend.play(guildId, getPlaybackTarget(playableTrack));
        await this.botStatsService.recordTrackPlay(playableTrack.trackId);
        await this.queueRepository.saveQueue(state);
        return playableTrack;
      } catch (error) {
        if (!allowSkipOnFailure) {
          throw error instanceof MusicBotError
            ? error
            : new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。");
        }

        this.logger.warn(
          { err: error, guildId, trackTitle: requestedTrack.title },
          "Skipping unplayable track before playback"
        );
        state.currentTrack = state.upcomingTracks.shift() ?? null;
      }
    }

    state.isPlaying = false;
    state.isPaused = false;
    state.isStopped = true;
    state.updatedAt = Date.now();
    await this.queueRepository.saveQueue(state);
    return null;
  }

  private async ensurePlayableTrack(track: QueueTrack): Promise<QueueTrack> {
    if (track.encodedTrack || track.playbackIdentifier) {
      return track;
    }

    const resolved = await this.audioBackend.resolve(track.url);
    const playableTrack = resolved[0];
    if (!playableTrack) {
      throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。");
    }

    return {
      ...track,
      trackId: playableTrack.trackId,
      durationMs: playableTrack.durationMs || track.durationMs,
      artworkUrl: playableTrack.artworkUrl ?? track.artworkUrl,
      encodedTrack: playableTrack.encodedTrack,
      playbackIdentifier: playableTrack.playbackIdentifier
    };
  }
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function getPlaybackTarget(track: QueueTrack): { encodedTrack?: string; playbackIdentifier?: string } {
  return {
    encodedTrack: track.encodedTrack,
    playbackIdentifier: track.playbackIdentifier
  };
}

function createQueueTrack(selectedTrack: ResolvedTrack, requestedBy: string): QueueTrack {
  return {
    trackId: selectedTrack.trackId,
    title: selectedTrack.title,
    url: selectedTrack.url,
    durationMs: selectedTrack.durationMs,
    artworkUrl: selectedTrack.artworkUrl,
    requestedBy,
    source: "youtube",
    encodedTrack: selectedTrack.encodedTrack,
    playbackIdentifier: selectedTrack.playbackIdentifier
  };
}
