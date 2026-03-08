import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction, type Client, type Interaction } from "discord.js";
import type pino from "pino";
import { createButtonContext, createSlashContext } from "../commands/context.js";
import { MusicCommandHandler } from "../commands/music-command-handler.js";
import { parseMusicButtonId } from "../ui/custom-ids.js";
import { MusicBotError } from "../errors/music-error.js";
import { QueueViewerService } from "../ui/queue-viewer.js";
import { SearchPickerService } from "../ui/search-picker.js";
import { LocalizationService } from "../i18n/localization-service.js";
import { buildErrorEmbed } from "../ui/error-embed.js";

export function registerInteractionHandler(
  client: Client,
  handler: MusicCommandHandler,
  queueViewer: QueueViewerService,
  searchPicker: SearchPickerService,
  localizationService: LocalizationService,
  logger: pino.Logger
): void {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleChatInput(interaction, handler);
        return;
      }

      if (interaction.isButton()) {
        if (await queueViewer.handleButton(interaction)) {
          return;
        }
        if (await searchPicker.handleButton(interaction)) {
          return;
        }
        await handleButton(interaction, handler);
        return;
      }

      if (interaction.isStringSelectMenu()) {
        if (await queueViewer.handleSelect(interaction)) {
          return;
        }
        if (await searchPicker.handleSelect(interaction)) {
          return;
        }
      }
    } catch (error) {
      await replyInteractionError(interaction, error, localizationService, logger);
    }
  });
}

async function handleChatInput(interaction: ChatInputCommandInteraction, handler: MusicCommandHandler) {
  const context = await createSlashContext(interaction);

  switch (interaction.commandName) {
    case "help":
      await handler.handleHelp(context);
      break;
    case "stats":
      await handler.handleStats(context);
      break;
    case "join":
      await handler.handleJoin(context);
      break;
    case "play":
      await handler.handlePlay(context, interaction.options.getString("query", true));
      break;
    case "playlist":
      await handler.handlePlaylist(context, interaction.options.getString("query", true));
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
      await handler.handleLang(context, interaction.options.getString("language", true));
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
    default:
      throw new MusicBotError("UNKNOWN_COMMAND", "未対応のコマンドです。");
  }
}

async function handleButton(interaction: ButtonInteraction, handler: MusicCommandHandler) {
  const parsed = parseMusicButtonId(interaction.customId);
  if (!parsed) {
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  const context = await createButtonContext(interaction);

  switch (parsed.action) {
    case "pause":
      await handler.handlePause(context);
      break;
    case "skip":
      await handler.handleSkip(context);
      break;
    case "stop":
      await handler.handleStop(context);
      break;
    case "leave":
      await handler.handleLeave(context);
      break;
    case "queue":
      await handler.handleQueue(context);
      break;
    case "repeat":
      await handler.handleRepeat(context);
      break;
    case "shuffle":
      await handler.handleShuffle(context);
      break;
  }
}

async function replyInteractionError(
  interaction: Interaction,
  error: unknown,
  localizationService: LocalizationService,
  logger: pino.Logger
): Promise<void> {
  logger.error({ err: error }, "Interaction handling failed");

  if (!interaction.isRepliable()) {
    return;
  }

  const language =
    interaction.inGuild() && interaction.guildId
      ? await localizationService.getLanguage(interaction.guildId).catch(() => "ja" as const)
      : "ja";
  const message = localizationService.translateError(language, error);
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [buildErrorEmbed(message)], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [buildErrorEmbed(message)], flags: MessageFlags.Ephemeral });
  }
}
