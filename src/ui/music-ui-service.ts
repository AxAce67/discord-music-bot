import type { Client, Message, SendableChannels, TextBasedChannel } from "discord.js";
import type pino from "pino";
import type { MusicService } from "../queue/music-service.js";
import { buildControlButtons, buildControlEmbed } from "./control-panel.js";
import { LocalizationService } from "../i18n/localization-service.js";

export interface MusicUiService {
  ensureControlMessage(guildId: string): Promise<void>;
  ensureControlMessageInChannel(guildId: string, channel: TextBasedChannel): Promise<void>;
  recreateControlMessageInChannel(guildId: string, channel: TextBasedChannel): Promise<void>;
  bumpControlMessage(guildId: string): Promise<void>;
  refreshControlMessage(guildId: string): Promise<void>;
  invalidateControlMessage(guildId: string): Promise<void>;
  deleteControlMessage(guildId: string): Promise<void>;
  startAutoRefresh(intervalMs?: number): void;
  stopAutoRefresh(): void;
}

export class DiscordMusicUiService implements MusicUiService {
  private autoRefreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: Client,
    private readonly musicService: MusicService,
    private readonly localizationService: LocalizationService,
    private readonly logger: pino.Logger
  ) {}

  async ensureControlMessage(guildId: string): Promise<void> {
    const state = await this.musicService.getQueue(guildId);
    const language = await this.localizationService.getLanguage(guildId);
    const playbackPosition = this.musicService.getPlaybackPosition(guildId);
    if (state.controlMessageId) {
      await this.refreshControlMessage(guildId);
      return;
    }

    const channel = await this.getTextChannel(guildId);
    if (!channel) {
      return;
    }

    const message = await channel.send({
      embeds: [buildControlEmbed(state, language, playbackPosition)],
      components: buildControlButtons(state, language)
    });

    await this.musicService.setControlMessageId(guildId, message.id);
  }

  async ensureControlMessageInChannel(guildId: string, channel: TextBasedChannel): Promise<void> {
    const state = await this.musicService.getQueue(guildId);
    const language = await this.localizationService.getLanguage(guildId);
    const playbackPosition = this.musicService.getPlaybackPosition(guildId);
    if (state.controlMessageId) {
      await this.refreshControlMessage(guildId);
      return;
    }

    if (!("send" in channel)) {
      this.logger.warn({ guildId, channelId: channel.id }, "Target channel is not sendable for control message");
      return;
    }

    const message = await channel.send({
      embeds: [buildControlEmbed(state, language, playbackPosition)],
      components: buildControlButtons(state, language)
    });

    this.logger.info({ guildId, channelId: channel.id, messageId: message.id }, "Created control message");
    await this.musicService.setControlMessageId(guildId, message.id);
  }

  async recreateControlMessageInChannel(guildId: string, channel: TextBasedChannel): Promise<void> {
    if (await this.isControlMessageLatest(guildId, channel)) {
      await this.refreshControlMessage(guildId);
      return;
    }

    await this.deleteControlMessage(guildId);
    await this.musicService.setControlMessageId(guildId, null);
    await this.ensureControlMessageInChannel(guildId, channel);
  }

  async bumpControlMessage(guildId: string): Promise<void> {
    const channel = await this.getTextChannel(guildId);
    if (!channel) {
      return;
    }

    await this.recreateControlMessageInChannel(guildId, channel);
  }

  async refreshControlMessage(guildId: string): Promise<void> {
    const state = await this.musicService.getQueue(guildId);
    const language = await this.localizationService.getLanguage(guildId);
    const playbackPosition = this.musicService.getPlaybackPosition(guildId);
    const channel = await this.getTextChannel(guildId);
    if (!channel) {
      return;
    }

    const message = state.controlMessageId ? await this.tryFetchMessage(channel, state.controlMessageId) : null;

    if (!message) {
      const created = await channel.send({
        embeds: [buildControlEmbed(state, language, playbackPosition)],
        components: buildControlButtons(state, language)
      });
      this.logger.info({ guildId, channelId: channel.id, messageId: created.id }, "Recreated control message");
      await this.musicService.setControlMessageId(guildId, created.id);
      return;
    }

    await message.edit({
      embeds: [buildControlEmbed(state, language, playbackPosition)],
      components: buildControlButtons(state, language)
    });
    this.logger.info({ guildId, messageId: message.id }, "Updated control message");
  }

  async invalidateControlMessage(guildId: string): Promise<void> {
    const state = await this.musicService.getQueue(guildId);
    const channel = await this.getTextChannel(guildId);
    if (!channel || !state.controlMessageId) {
      return;
    }

    const message = await this.tryFetchMessage(channel, state.controlMessageId);
    if (!message) {
      return;
    }

    await message.edit({
      embeds: [buildControlEmbed(state, await this.localizationService.getLanguage(guildId), 0)],
      components: []
    });
  }

  async deleteControlMessage(guildId: string): Promise<void> {
    const state = await this.musicService.getQueue(guildId);
    const channel = await this.getTextChannel(guildId);
    if (!channel || !state.controlMessageId) {
      return;
    }

    const message = await this.tryFetchMessage(channel, state.controlMessageId);
    if (!message) {
      return;
    }

    await message.delete().catch((error: unknown) => {
      this.logger.warn({ err: error, guildId }, "Failed to delete control message");
    });
  }

  startAutoRefresh(intervalMs = 15000): void {
    if (this.autoRefreshTimer) {
      return;
    }

    this.autoRefreshTimer = setInterval(() => {
      void this.runAutoRefresh();
    }, intervalMs);
  }

  stopAutoRefresh(): void {
    if (!this.autoRefreshTimer) {
      return;
    }

    clearInterval(this.autoRefreshTimer);
    this.autoRefreshTimer = null;
  }

  private async getTextChannel(guildId: string): Promise<SendableChannels | null> {
    const state = await this.musicService.getQueue(guildId);
    if (!state.textChannelId) {
      return null;
    }

    const channel = await this.client.channels.fetch(state.textChannelId);
    if (!channel?.isSendable()) {
      return null;
    }

    return channel;
  }

  private async tryFetchMessage(channel: SendableChannels, messageId: string): Promise<Message | null> {
    if (!("messages" in channel)) {
      return null;
    }

    try {
      return await channel.messages.fetch(messageId);
    } catch (error) {
      this.logger.warn({ err: error, messageId }, "Control message not found, recreating");
      return null;
    }
  }

  private async runAutoRefresh(): Promise<void> {
    const states = await this.musicService.recoverQueues();

    for (const state of states) {
      if (!state.controlMessageId) {
        continue;
      }

      if (!state.currentTrack || (!state.isPlaying && !state.isPaused)) {
        continue;
      }

      try {
        await this.refreshControlMessage(state.guildId);
      } catch (error) {
        this.logger.warn({ err: error, guildId: state.guildId }, "Auto refresh failed");
      }
    }
  }

  private async isControlMessageLatest(guildId: string, channel: TextBasedChannel): Promise<boolean> {
    if (!("messages" in channel)) {
      return false;
    }

    const state = await this.musicService.getQueue(guildId);
    if (!state.controlMessageId) {
      return false;
    }

    try {
      const latestMessages = await channel.messages.fetch({ limit: 1 });
      const latestMessage = latestMessages.first();
      return latestMessage?.id === state.controlMessageId;
    } catch (error) {
      this.logger.warn({ err: error, guildId, channelId: channel.id }, "Failed to inspect latest channel message");
      return false;
    }
  }
}
