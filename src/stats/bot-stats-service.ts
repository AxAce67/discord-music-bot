import type { Client } from "discord.js";
import type { BotStatsSnapshot, StatsRepository } from "../storage/repositories.js";

export interface BotStatsView extends BotStatsSnapshot {
  guildCount: number;
  memberCount: number;
}

export class BotStatsService {
  constructor(private readonly statsRepository: StatsRepository) {}

  async recordTrackPlay(trackId: string): Promise<void> {
    await this.statsRepository.recordTrackPlay(trackId);
  }

  async getView(client: Client): Promise<BotStatsView> {
    const stats = await this.statsRepository.getStats();
    const guilds = [...client.guilds.cache.values()];

    return {
      ...stats,
      guildCount: guilds.length,
      memberCount: guilds.reduce((sum, guild) => sum + guild.memberCount, 0)
    };
  }
}
