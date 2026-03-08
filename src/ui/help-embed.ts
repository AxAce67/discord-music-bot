import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import { getMessages } from "../i18n/messages.js";

export function buildHelpEmbed(language: LanguageCode): EmbedBuilder {
  const text = getMessages(language);

  return new EmbedBuilder()
    .setTitle(text.helpTitle)
    .setColor(0x495057)
    .setDescription(text.helpDescription)
    .addFields(
      { name: text.helpSectionPlay, value: text.helpPlay, inline: false },
      { name: text.helpSectionPlaylist, value: text.helpPlaylist, inline: false },
      { name: text.helpSectionControls, value: text.helpControls, inline: false },
      { name: text.helpSectionUtility, value: text.helpUtility, inline: false }
    );
}
