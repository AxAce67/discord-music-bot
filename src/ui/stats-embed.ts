import { EmbedBuilder } from "discord.js";
import type { LanguageCode } from "../types/music.js";
import type { BotStatsView } from "../stats/bot-stats-service.js";
import { getMessages } from "../i18n/messages.js";

export function buildStatsEmbed(language: LanguageCode, stats: BotStatsView): EmbedBuilder {
  const text = getMessages(language);

  return new EmbedBuilder()
    .setColor(0x1f6feb)
    .setTitle(text.statsTitle)
    .addFields(
      { name: text.statsServers, value: String(stats.guildCount), inline: true },
      { name: text.statsUsers, value: String(stats.memberCount), inline: true },
      { name: text.statsTotalPlays, value: String(stats.totalPlayCount), inline: true },
      { name: text.statsUniqueTracks, value: String(stats.uniqueTrackCount), inline: true }
    );
}
