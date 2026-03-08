import { Client, GatewayIntentBits, Partials } from "discord.js";
import type pino from "pino";
import type { AppConfig } from "../config/env.js";
import { createDatabase } from "../storage/database.js";
import { SqliteQueueRepository, SqliteSettingsRepository, SqliteStatsRepository } from "../storage/repositories.js";
import { LavalinkAudioBackend } from "../audio/lavalink-audio-backend.js";
import { ResolverBackedAudioBackend } from "../audio/resolver-backed-audio-backend.js";
import { DefaultMusicService } from "../queue/music-service.js";
import { DiscordMusicUiService } from "../ui/music-ui-service.js";
import { QueueViewerService } from "../ui/queue-viewer.js";
import { SearchPickerService } from "../ui/search-picker.js";
import { MusicCommandHandler } from "../commands/music-command-handler.js";
import { LocalizationService } from "../i18n/localization-service.js";
import { BotStatsService } from "../stats/bot-stats-service.js";
import { HttpResolverClient } from "../resolver/http-resolver-client.js";

export interface AppContainer {
  client: Client;
  musicHandler: MusicCommandHandler;
  musicService: DefaultMusicService;
  uiService: DiscordMusicUiService;
  queueViewer: QueueViewerService;
  searchPicker: SearchPickerService;
  localizationService: LocalizationService;
  botStatsService: BotStatsService;
}

export async function createAppContainer(config: AppConfig, logger: pino.Logger): Promise<AppContainer> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  const database = await createDatabase(config.DATABASE_URL);
  const queueRepository = new SqliteQueueRepository(database);
  const settingsRepository = new SqliteSettingsRepository(database, config.BOT_PREFIX);
  const statsRepository = new SqliteStatsRepository(database);
  const localizationService = new LocalizationService(settingsRepository);
  const botStatsService = new BotStatsService(statsRepository);

  const lavalinkBackend = new LavalinkAudioBackend(client, config, logger);
  const audioBackend = config.RESOLVER_ENABLED
    ? new ResolverBackedAudioBackend(
        new HttpResolverClient(config.RESOLVER_BASE_URL, config.RESOLVER_TIMEOUT_MS, logger),
        lavalinkBackend,
        logger
      )
    : lavalinkBackend;
  const musicService = new DefaultMusicService(queueRepository, audioBackend, botStatsService, logger);
  const uiService = new DiscordMusicUiService(client, musicService, localizationService, logger);
  const queueViewer = new QueueViewerService(musicService, localizationService);
  const searchPicker = new SearchPickerService(musicService, uiService, localizationService);

  return {
    client,
    musicHandler: new MusicCommandHandler(musicService, uiService, queueViewer, searchPicker, localizationService, botStatsService),
    musicService,
    uiService,
    queueViewer,
    searchPicker,
    localizationService,
    botStatsService
  };
}
