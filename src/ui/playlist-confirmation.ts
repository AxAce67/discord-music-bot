import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import { getMessages } from "../i18n/messages.js";

export function buildPlaylistConfirmationEmbed(
  language: LanguageCode,
  trackCount: number,
  startedPlaybackImmediately: boolean,
  showMixNote = false
): EmbedBuilder {
  const text = getMessages(language);
  const descriptionLines = [`**${text.tracksCount(trackCount)}**`];
  if (showMixNote) {
    descriptionLines.push("", text.playlistMixNote);
  }

  return new EmbedBuilder()
    .setColor(startedPlaybackImmediately ? 0x2b8a3e : 0x1f6feb)
    .setTitle(startedPlaybackImmediately ? text.playlistStarted : text.playlistQueued)
    .setDescription(descriptionLines.join("\n"));
}
