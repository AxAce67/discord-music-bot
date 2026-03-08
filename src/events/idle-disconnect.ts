import type { Client, VoiceBasedChannel } from "discord.js";
import type pino from "pino";
import type { LocalizationService } from "../i18n/localization-service.js";
import type { MusicService } from "../queue/music-service.js";
import type { MusicUiService } from "../ui/music-ui-service.js";
import { buildStatusEmbed } from "../ui/status-embed.js";

const DEFAULT_IDLE_TIMEOUT_MS = 3 * 60 * 1000;

export function registerIdleDisconnectHandler(
  client: Client,
  musicService: MusicService,
  uiService: MusicUiService,
  localizationService: LocalizationService,
  logger: pino.Logger,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS
): void {
  const timers = new Map<string, NodeJS.Timeout>();

  const clearTimer = (guildId: string) => {
    const timer = timers.get(guildId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    timers.delete(guildId);
  };

  const evaluateGuild = async (guildId: string) => {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
    const botVoiceChannel = guild?.members.me?.voice.channel;

    if (!botVoiceChannel || !isVoiceChannelWithMembers(botVoiceChannel)) {
      clearTimer(guildId);
      return;
    }

    const humanCount = countHumanMembers(botVoiceChannel.members.values());
    if (humanCount > 0) {
      clearTimer(guildId);
      return;
    }

    if (timers.has(guildId)) {
      return;
    }

    logger.info({ guildId, voiceChannelId: botVoiceChannel.id, idleTimeoutMs }, "Scheduling idle disconnect");
    const timer = setTimeout(() => {
      void disconnectForIdle(guildId);
    }, idleTimeoutMs);
    timers.set(guildId, timer);
  };

  const disconnectForIdle = async (guildId: string) => {
    clearTimer(guildId);

    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
    const botVoiceChannel = guild?.members.me?.voice.channel;
    if (!botVoiceChannel || !isVoiceChannelWithMembers(botVoiceChannel) || countHumanMembers(botVoiceChannel.members.values()) > 0) {
      return;
    }

    const state = await musicService.getQueue(guildId);
    const text = await localizationService.getMessages(guildId);

    logger.info({ guildId, voiceChannelId: botVoiceChannel.id }, "Disconnecting after idle timeout");
    await musicService.disconnectKeepingQueue(guildId);
    await uiService.refreshControlMessage(guildId).catch((error) => {
      logger.warn({ err: error, guildId }, "Failed to refresh control message after idle disconnect");
    });

    if (!state.textChannelId) {
      return;
    }

    const channel = await client.channels.fetch(state.textChannelId).catch(() => null);
    if (!channel?.isSendable()) {
      return;
    }

    await channel.send({ embeds: [buildStatusEmbed(text.autoLeftIdle)] }).catch((error) => {
      logger.warn({ err: error, guildId, channelId: state.textChannelId }, "Failed to send idle disconnect notification");
    });
  };

  client.on("voiceStateUpdate", (oldState, newState) => {
    if (oldState.channelId === newState.channelId) {
      return;
    }

    void evaluateGuild(newState.guild.id).catch((error) => {
      logger.warn({ err: error, guildId: newState.guild.id }, "Failed to evaluate idle disconnect state");
    });
  });

  client.on("clientReady", () => {
    for (const guild of client.guilds.cache.values()) {
      void evaluateGuild(guild.id).catch((error) => {
        logger.warn({ err: error, guildId: guild.id }, "Failed to evaluate idle disconnect state on ready");
      });
    }
  });
}

function isVoiceChannelWithMembers(channel: VoiceBasedChannel): channel is VoiceBasedChannel & { members: VoiceBasedChannel["members"] } {
  return "members" in channel;
}

export function countHumanMembers(members: Iterable<{ user: { bot: boolean } }>): number {
  let count = 0;
  for (const member of members) {
    if (!member.user.bot) {
      count += 1;
    }
  }

  return count;
}
