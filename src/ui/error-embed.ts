import { EmbedBuilder } from "discord.js";

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xd94841)
    .setDescription(message);
}
