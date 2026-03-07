import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { GuildQueueState, LanguageCode } from "../types/music.js";
import { createMusicButtonId } from "./custom-ids.js";
import { getMessages } from "../i18n/messages.js";

export function buildControlEmbed(state: GuildQueueState, language: LanguageCode, playbackPositionMs = 0): EmbedBuilder {
  const text = getMessages(language);
  const currentTrack = state.currentTrack;
  const repeatText = state.repeatMode === "track" ? text.controlRepeating : null;
  if (!currentTrack) {
    const hasQueuedTracks = state.upcomingTracks.length > 0;
    const nextUp = hasQueuedTracks
      ? state.upcomingTracks.slice(0, 3).map((track, index) => `${index + 1}. ${trim(track.title, 54)}`).join("\n")
      : null;

    const embed = new EmbedBuilder()
      .setTitle(hasQueuedTracks ? text.controlStopped : text.controlIdle)
      .setColor(0x495057)
      .setDescription(
        hasQueuedTracks
          ? text.controlStoppedDescription
          : text.controlIdleDescription
      )
      .addFields(
        hasQueuedTracks
          ? {
              name: text.controlUpNext,
              value: nextUp ?? text.controlNoNext,
              inline: false
            }
          : {
              name: text.controlUsage,
              value: text.controlUsageValue,
              inline: false
            }
      );

    if (repeatText) {
      embed.setFooter({ text: repeatText });
    }

    return embed;
  }

  const upcoming = state.upcomingTracks.slice(0, 3);
  const upNext = upcoming.length > 0
    ? upcoming.map((track, index) => `${index + 1}. ${trim(track.title, 54)}`).join("\n")
    : text.controlNoNext;
  const title = state.isPaused
    ? text.controlPaused
    : state.isPlaying && state.repeatMode === "track"
      ? text.controlRepeating
      : state.isPlaying
        ? text.controlPlaying
        : text.controlIdle;
  const accentColor = state.isPaused ? 0xf59f00 : state.isPlaying ? 0x2b8a3e : 0x495057;
  const currentPosition = Math.min(playbackPositionMs, currentTrack.durationMs);
  const progressText = [
    buildProgressBar(currentPosition, currentTrack.durationMs),
    `\`${formatDuration(currentPosition)} / ${formatDuration(currentTrack.durationMs)}\``
  ].join("\n");
  const description = [`**[${currentTrack.title}](${currentTrack.url})**`, `${text.controlRequestedBy}: <@${currentTrack.requestedBy}>`].join("\n");

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(accentColor)
    .setDescription(description)
    .addFields(
      { name: text.controlProgress, value: progressText, inline: false },
      { name: text.controlUpNext, value: upNext, inline: false }
    );

  if (repeatText) {
    embed.setFooter({ text: repeatText });
  }

  if (currentTrack?.artworkUrl) {
    embed.setThumbnail(currentTrack.artworkUrl);
  }

  return embed.setTimestamp(state.updatedAt);
}

export function buildControlButtons(state: GuildQueueState, language: LanguageCode) {
  const text = getMessages(language);
  const guildId = state.guildId;
  const hasTrack = state.currentTrack !== null;
  const canResumeQueue = !state.currentTrack && state.upcomingTracks.length > 0;

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("pause", guildId))
        .setLabel(state.isPaused || canResumeQueue ? text.controlButtonResume : text.controlButtonPause)
        .setEmoji(state.isPaused ? "▶" : "⏸")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!hasTrack && !canResumeQueue),
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("skip", guildId))
        .setLabel(text.controlButtonSkip)
        .setEmoji("⏭")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!hasTrack),
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("stop", guildId))
        .setLabel(text.controlButtonStop)
        .setEmoji("⏹")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasTrack),
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("leave", guildId))
        .setLabel(text.controlButtonLeave)
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("repeat", guildId))
        .setLabel(state.repeatMode === "track" ? text.controlButtonRepeating : text.controlButtonRepeat)
        .setEmoji("🔁")
        .setStyle(state.repeatMode === "track" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("shuffle", guildId))
        .setLabel(text.controlButtonShuffle)
        .setEmoji("🔀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.upcomingTracks.length < 2),
      new ButtonBuilder()
        .setCustomId(createMusicButtonId("queue", guildId))
        .setLabel(text.controlButtonQueue)
        .setEmoji("📜")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildProgressBar(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) {
    return "▱▱▱▱▱▱▱▱▱▱";
  }

  const segments = 10;
  const ratio = Math.min(Math.max(positionMs / durationMs, 0), 1);
  const filled = Math.min(segments, Math.max(1, Math.round(ratio * segments)));
  if (ratio <= 0) {
    return "▱▱▱▱▱▱▱▱▱▱";
  }

  return `${"▰".repeat(filled)}${"▱".repeat(Math.max(segments - filled, 0))}`;
}

function trim(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
