import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import { getMessages } from "../i18n/messages.js";

export function buildPlaylistConfirmationEmbed(
  language: LanguageCode,
  trackCount: number,
  startedPlaybackImmediately: boolean
): EmbedBuilder {
  const text = getMessages(language);
  return new EmbedBuilder()
    .setColor(startedPlaybackImmediately ? 0x2b8a3e : 0x1f6feb)
    .setTitle(startedPlaybackImmediately ? text.playlistStarted : text.playlistQueued)
    .setDescription(`**${text.tracksCount(trackCount)}**`);
}
