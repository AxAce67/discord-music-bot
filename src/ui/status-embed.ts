import { EmbedBuilder } from "discord.js";

export function buildStatusEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x495057)
    .setDescription(message);
}
