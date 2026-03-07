import type { Client, Message } from "discord.js";
import type pino from "pino";
import { createPrefixContext } from "../commands/context.js";
import { MusicCommandHandler } from "../commands/music-command-handler.js";
import { LocalizationService } from "../i18n/localization-service.js";

export function registerMessageCreateHandler(
  client: Client,
  prefix: string,
  handler: MusicCommandHandler,
  localizationService: LocalizationService,
  logger: pino.Logger
): void {
  client.on("messageCreate", async (message) => {
    if (!message.inGuild() || message.author.bot || !message.content.startsWith(prefix)) {
      return;
    }

    try {
      const context = await createPrefixContext(message as Message<true>);
      const [command, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);

      switch (command?.toLowerCase()) {
        case "join":
          await handler.handleJoin(context);
          break;
        case "play":
          await handler.handlePlay(context, args.join(" "));
          break;
        case "playlist":
          await handler.handlePlaylist(context, args.join(" "));
          break;
        case "pause":
          await handler.handlePause(context);
          break;
        case "repeat":
          await handler.handleRepeat(context);
          break;
        case "shuffle":
          await handler.handleShuffle(context);
          break;
        case "lang":
          await handler.handleLang(context, args[0] ?? "");
          break;
        case "skip":
          await handler.handleSkip(context);
          break;
        case "stop":
          await handler.handleStop(context);
          break;
        case "queue":
          await handler.handleQueue(context);
          break;
        case "leave":
          await handler.handleLeave(context);
          break;
      }
    } catch (error) {
      logger.error({ err: error }, "Prefix command handling failed");
      const language = await localizationService.getLanguage(message.guildId).catch(() => "ja" as const);
      const messageText = localizationService.translateError(language, error);
      await message.reply(messageText);
    }
  });
}
