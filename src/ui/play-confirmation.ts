import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import { getMessages } from "../i18n/messages.js";

export function buildPlayConfirmationEmbed(
  language: LanguageCode,
  title: string,
  url: string,
  startedPlaybackImmediately: boolean
): EmbedBuilder {
  const text = getMessages(language);
  return new EmbedBuilder()
    .setColor(startedPlaybackImmediately ? 0x2b8a3e : 0x1f6feb)
    .setTitle(startedPlaybackImmediately ? text.playStarted : text.queued)
    .setDescription(`**[${title}](${url})**`);
}
