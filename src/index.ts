import { loadConfig } from "./config/env.js";
import { createLogger } from "./utils/logger.js";
import { createAppContainer } from "./app/container.js";
import { registerInteractionHandler } from "./interactions/interaction-handler.js";
import { registerMessageCreateHandler } from "./events/message-create.js";
import { acquireSingleInstance } from "./utils/single-instance.js";

async function main(): Promise<void> {
  const instanceLock = await acquireSingleInstance("music-bot");
  const config = loadConfig();
  const logger = createLogger(config);
  const { client, musicHandler, musicService, uiService, queueViewer, searchPicker, localizationService } = await createAppContainer(config, logger);

  registerInteractionHandler(client, musicHandler, queueViewer, searchPicker, localizationService, logger);
  registerMessageCreateHandler(client, config.BOT_PREFIX, musicHandler, localizationService, logger);
  uiService.startAutoRefresh(5000);
  musicService.on("trackAdvanced", (guildId: string) => {
    void uiService.bumpControlMessage(guildId).catch((error) => {
      logger.warn({ err: error, guildId }, "Failed to bump control message after track advance");
    });
  });

  client.once("clientReady", async () => {
    logger.info({ user: client.user?.tag }, "Discord bot is ready");

    const states = await musicService.recoverQueues();
    for (const state of states) {
      try {
        await musicService.normalizeRecoveredQueue(state.guildId);
        await uiService.refreshControlMessage(state.guildId);
      } catch (error) {
        logger.warn({ err: error, guildId: state.guildId }, "Failed to recover control message");
      }
    }
  });

  const shutdown = async () => {
    uiService.stopAutoRefresh();
    const normalizedStates = await musicService.prepareForShutdown().catch(() => []);
    for (const state of normalizedStates) {
      await uiService.refreshControlMessage(state.guildId).catch(() => undefined);
    }
    await musicService.disconnectAllVoiceConnections().catch(() => undefined);
    client.destroy();
    await instanceLock.release().catch(() => undefined);
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("exit", () => {
    void instanceLock.release().catch(() => undefined);
  });

  await client.login(config.DISCORD_TOKEN);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
