import { Connectors, LoadType, Shoukaku, type NodeOption, type Player } from "shoukaku";
import type { Client } from "discord.js";
import type pino from "pino";
import { AudioBackend, type JoinVoiceRequest, type ResolvedTrack } from "./audio-backend.js";
import type { AppConfig } from "../config/env.js";
import { MusicBotError } from "../errors/music-error.js";

export class LavalinkAudioBackend extends AudioBackend {
  private readonly shoukaku: Shoukaku;
  private readonly playbackState = new Map<string, { position: number; updatedAt: number; paused: boolean }>();

  constructor(
    private readonly client: Client,
    config: AppConfig,
    private readonly logger: pino.Logger
  ) {
    super();

    const nodes: NodeOption[] = [
      {
        name: "main",
        url: `${config.LAVALINK_HOST}:${config.LAVALINK_PORT}`,
        auth: config.LAVALINK_PASSWORD,
        secure: false
      }
    ];

    this.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
      resume: true,
      resumeByLibrary: true,
      reconnectInterval: 5,
      reconnectTries: 5
    });

    this.shoukaku.on("error", (name, error) => {
      this.logger.error({ err: error, nodeName: name }, "Lavalink node error");
    });
  }

  hasConnection(guildId: string): boolean {
    return this.shoukaku.players.has(guildId) || this.shoukaku.connections.has(guildId);
  }

  getConnectedGuildIds(): string[] {
    return [...new Set([...this.shoukaku.players.keys(), ...this.shoukaku.connections.keys()])];
  }

  async join(request: JoinVoiceRequest): Promise<void> {
    const existingPlayer = this.shoukaku.players.get(request.guildId);
    if (existingPlayer) {
      this.logger.info({ guildId: request.guildId }, "Reusing existing Lavalink player");
      this.attachPlayerListeners(existingPlayer);
      await this.ensureServerDeaf(request.guildId);
      return;
    }

    try {
      const player = await this.shoukaku.joinVoiceChannel({
        guildId: request.guildId,
        channelId: request.voiceChannelId,
        shardId: request.shardId,
        deaf: true
      });
      this.logger.info(
        {
          guildId: request.guildId,
          voiceChannelId: request.voiceChannelId,
          shardId: request.shardId
        },
        "Joined voice channel via Lavalink"
      );
      this.attachPlayerListeners(player);
      await this.ensureServerDeaf(request.guildId);
    } catch (error) {
      if (isLavalinkConnectionError(error)) {
        throw new MusicBotError(
          "LAVALINK_UNAVAILABLE",
          "音声サーバーにまだ接続できていません。",
          String(error)
        );
      }

      throw new MusicBotError("VOICE_CONNECT_FAILED", "VCへの接続に失敗しました。", String(error));
    }
  }

  async leave(guildId: string): Promise<void> {
    await this.shoukaku.leaveVoiceChannel(guildId);
  }

  async resolve(query: string): Promise<ResolvedTrack[]> {
    return this.resolveInternal(query, false);
  }

  async resolvePlaylist(query: string): Promise<ResolvedTrack[]> {
    return this.resolveInternal(query, true);
  }

  private async resolveInternal(query: string, preservePlaylistUrl: boolean): Promise<ResolvedTrack[]> {
    const node = this.shoukaku.getIdealNode();

    if (!node) {
      throw new MusicBotError("LAVALINK_UNAVAILABLE", "音声サーバーに接続できていません。");
    }

    const identifier = isUrl(query)
      ? preservePlaylistUrl
        ? query
        : normalizePlaybackUrl(query)
      : `ytsearch:${query}`;
    this.logger.info({ query, identifier }, "Resolving track");
    const response = await node.rest.resolve(identifier);

    if (!response) {
      throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。");
    }

    if (response.loadType === LoadType.ERROR) {
      throw new MusicBotError("TRACK_RESOLVE_FAILED", "曲情報の取得に失敗しました。", response.data.message);
    }

    if (response.loadType === LoadType.EMPTY) {
      return [];
    }

    const tracks = response.loadType === LoadType.PLAYLIST ? response.data.tracks : [response.data].flat();

    return tracks.map((track) => ({
      trackId: track.info.identifier,
      title: track.info.title,
      url: track.info.uri ?? `https://www.youtube.com/watch?v=${track.info.identifier}`,
      durationMs: track.info.length,
      artworkUrl: track.info.artworkUrl,
      encodedTrack: track.encoded,
      source: "youtube"
    }));
  }

  async play(guildId: string, encodedTrack: string): Promise<void> {
    const player = this.getPlayer(guildId);
    this.logger.info({ guildId }, "Starting track playback");
    await player.playTrack({ track: { encoded: encodedTrack } });
  }

  getPlaybackPosition(guildId: string): number {
    const player = this.shoukaku.players.get(guildId);
    const playback = this.playbackState.get(guildId);

    if (!player || !playback) {
      return 0;
    }

    if (playback.paused) {
      return playback.position;
    }

    const elapsed = Date.now() - playback.updatedAt;
    return Math.max(0, playback.position + elapsed);
  }

  async pause(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    this.logger.info({ guildId }, "Pausing track playback");
    await player.setPaused(true);
  }

  async resume(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    this.logger.info({ guildId }, "Resuming track playback");
    await player.setPaused(false);
  }

  async stop(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    this.logger.info({ guildId }, "Stopping track playback");
    await player.stopTrack();
  }

  private getPlayer(guildId: string): Player {
    const player = this.shoukaku.players.get(guildId);
    if (!player) {
      throw new MusicBotError("PLAYER_NOT_FOUND", "再生プレイヤーが見つかりません。");
    }
    return player;
  }

  private attachPlayerListeners(player: Player): void {
    const taggedPlayer = player as Player & { __musicBotAttached?: boolean };
    if (taggedPlayer.__musicBotAttached) {
      return;
    }

    taggedPlayer.__musicBotAttached = true;
    player.on("start", () => {
      this.playbackState.set(player.guildId, { position: 0, updatedAt: Date.now(), paused: false });
      this.logger.info({ guildId: player.guildId }, "Track started");
    });
    player.on("update", (data) => {
      this.playbackState.set(player.guildId, {
        position: data.state.position,
        updatedAt: Date.now(),
        paused: player.paused
      });
    });
    player.on("end", () => {
      this.playbackState.set(player.guildId, { position: 0, updatedAt: Date.now(), paused: false });
      this.logger.info({ guildId: player.guildId }, "Track ended");
      this.emit("trackEnd", player.guildId);
    });
    player.on("exception", (reason) => {
      this.logger.error({ guildId: player.guildId, reason }, "Track exception");
      this.emit("trackException", player.guildId);
    });
    player.on("closed", (reason) => {
      this.logger.warn({ guildId: player.guildId, reason }, "Voice websocket closed");
      this.emit("voiceDisconnected", player.guildId);
    });
  }

  private async ensureServerDeaf(guildId: string): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    const me = guild?.members.me ?? (guild ? await guild.members.fetchMe().catch(() => null) : null);
    if (!me) {
      return;
    }

    if (me.voice.serverDeaf) {
      return;
    }

    try {
      await me.voice.setDeaf(true);
      this.logger.info({ guildId }, "Applied server deaf to bot member");
    } catch (error) {
      this.logger.warn({ err: error, guildId }, "Failed to apply server deaf to bot member");
    }
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

function normalizePlaybackUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const videoId = url.pathname.slice(1);
    if (videoId) {
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
  }

  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const videoId = url.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    if (url.pathname.startsWith("/shorts/")) {
      const videoId = url.pathname.split("/")[2];
      if (videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }
  }

  return value;
}

function isLavalinkConnectionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

  return (
    message.includes("Can't find any nodes to connect on") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Websocket closed before a connection was established") ||
    message.includes("socket hang up")
  );
}
