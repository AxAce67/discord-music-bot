import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import { getMessages } from "../i18n/messages.js";

export function buildQueueRemoveConfirmationEmbed(language: LanguageCode, title: string): EmbedBuilder {
  const text = getMessages(language);
  return new EmbedBuilder()
    .setColor(0xd94841)
    .setTitle(text.queueRemovedTitle)
    .setDescription(`**${title}**`);
}
