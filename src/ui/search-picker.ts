import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type TextBasedChannel
} from "discord.js";
import type { ResolvedTrack } from "../audio/audio-backend.js";
import type { MusicService } from "../queue/music-service.js";
import type { MusicUiService } from "./music-ui-service.js";
import { MusicBotError } from "../errors/music-error.js";
import { buildPlayConfirmationEmbed } from "./play-confirmation.js";
import { LocalizationService } from "../i18n/localization-service.js";

type SearchPickerButtonAction = "close";
type SearchPickerButtonId = `searchpick:${SearchPickerButtonAction}:${string}`;
type SearchPickerSelectId = `searchpick:select:${string}`;

interface SearchPickerSession {
  guildId: string;
  ownerId: string;
  channelId: string;
  results: ResolvedTrack[];
}

interface SearchPickerRenderPayload {
  embeds: [EmbedBuilder];
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

const MAX_RESULTS = 10;
const MAX_RESULT_FIELD_LENGTH = 1000;

export class SearchPickerService {
  private readonly sessions = new Map<string, SearchPickerSession>();

  constructor(
    private readonly musicService: MusicService,
    private readonly uiService: MusicUiService,
    private readonly localizationService: LocalizationService
  ) {}

  async create(channel: TextBasedChannel, guildId: string, ownerId: string, results: ResolvedTrack[]): Promise<void> {
    if (!("send" in channel)) {
      throw new MusicBotError("SEARCH_PICKER_UNAVAILABLE", "このチャンネルでは検索結果を表示できません。");
    }

    const session: SearchPickerSession = {
      guildId,
      ownerId,
      channelId: channel.id,
      results: results.slice(0, MAX_RESULTS)
    };

    const message = await channel.send(await this.render(session));
    this.sessions.set(message.id, session);
  }

  async createEphemeral(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    guildId: string,
    ownerId: string,
    results: ResolvedTrack[]
  ): Promise<void> {
    const session: SearchPickerSession = {
      guildId,
      ownerId,
      channelId: interaction.channelId ?? "ephemeral",
      results: results.slice(0, MAX_RESULTS)
    };

    const payload = await this.render(session);
    const message = await replyEphemeral(interaction, payload);
    if (message) {
      this.sessions.set(message.id, session);
    }
  }

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const parsed = parseSearchPickerButtonId(interaction.customId);
    if (!parsed) {
      return false;
    }

    const session = this.sessions.get(interaction.message.id);
    if (!session) {
      await safeReply(interaction, (await this.localizationService.getMessages(parsed.guildId)).searchExpired);
      return true;
    }

    if (session.ownerId !== interaction.user.id) {
      await safeReply(interaction, (await this.localizationService.getMessages(session.guildId)).searchOwnerOnly);
      return true;
    }

    this.sessions.delete(interaction.message.id);
    await interaction.message.delete().catch(() => undefined);
    return true;
  }

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
    const parsed = parseSearchPickerSelectId(interaction.customId);
    if (!parsed) {
      return false;
    }

    const session = this.sessions.get(interaction.message.id);
    if (!session) {
      await safeReply(interaction, (await this.localizationService.getMessages(parsed.guildId)).searchExpired);
      return true;
    }

    if (session.ownerId !== interaction.user.id) {
      await safeReply(interaction, (await this.localizationService.getMessages(session.guildId)).searchOwnerOnly);
      return true;
    }

    if (!interaction.inCachedGuild()) {
      throw new MusicBotError("GUILD_ONLY", "この操作はサーバー内でのみ使えます。");
    }

    const memberVoiceChannelId = interaction.member.voice.channelId;
    if (!memberVoiceChannelId) {
      throw new MusicBotError("VOICE_REQUIRED", "先にVCへ参加してください。");
    }

    const queue = await this.musicService.getQueue(session.guildId);
    if (queue.voiceChannelId && queue.voiceChannelId !== memberVoiceChannelId) {
      throw new MusicBotError("VOICE_MISMATCH", "bot と同じVCに参加してから操作してください。");
    }

    const selectedTrack = session.results[Number(interaction.values[0])];
    if (!selectedTrack) {
      throw new MusicBotError("SEARCH_PICK_INVALID", "選択した候補が見つかりません。");
    }

    const startedPlaybackImmediately = queue.currentTrack === null;
    await this.musicService.enqueueResolvedTrack(
      {
        guildId: session.guildId,
        voiceChannelId: memberVoiceChannelId,
        textChannelId: interaction.channelId,
        shardId: interaction.guild.shardId
      },
      selectedTrack,
      interaction.user.id
    );

    const channel = interaction.channel;
    if (channel?.isTextBased()) {
      await this.uiService.recreateControlMessageInChannel(session.guildId, channel);
    }

    this.sessions.delete(interaction.message.id);
    const language = await this.localizationService.getLanguage(session.guildId);
    const confirmationEmbed = buildPlayConfirmationEmbed(
      language,
      selectedTrack.title,
      selectedTrack.url,
      startedPlaybackImmediately
    );

    if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
      await interaction.update({
        embeds: [confirmationEmbed],
        components: []
      });
      return true;
    }

    const text = await this.localizationService.getMessages(session.guildId);
    await interaction.update({ embeds: [], components: [], content: text.queued });
    const confirmation =
      interaction.channel?.isTextBased() && "send" in interaction.channel
        ? await interaction.channel.send({ embeds: [confirmationEmbed] })
        : null;

    setTimeout(() => {
      void interaction.message.delete().catch(() => undefined);
      void confirmation?.delete().catch(() => undefined);
    }, 5000);

    return true;
  }

  private async render(session: SearchPickerSession): Promise<SearchPickerRenderPayload> {
    const text = await this.localizationService.getMessages(session.guildId);
    const resultsText = buildResultsText(session.results);
    const embed = new EmbedBuilder()
      .setTitle(text.searchTitle)
      .setColor(0x1f6feb)
      .setDescription(text.searchDescription)
      .addFields({
        name: text.searchResults(session.results.length),
        value: resultsText
      });

    const select = new StringSelectMenuBuilder()
      .setCustomId(createSearchPickerSelectId(session.guildId))
      .setPlaceholder(text.searchPlaceholder)
      .addOptions(
        session.results.map((track, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(trim(track.title, 100))
            .setDescription(formatDuration(track.durationMs))
            .setValue(String(index))
        )
      );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(createSearchPickerButtonId("close", session.guildId))
            .setLabel(text.searchClose)
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }
}

function createSearchPickerButtonId(action: SearchPickerButtonAction, guildId: string): SearchPickerButtonId {
  return `searchpick:${action}:${guildId}`;
}

function parseSearchPickerButtonId(customId: string): { action: SearchPickerButtonAction; guildId: string } | null {
  const match = /^searchpick:(close):(.+)$/.exec(customId);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as SearchPickerButtonAction,
    guildId: match[2]
  };
}

function createSearchPickerSelectId(guildId: string): SearchPickerSelectId {
  return `searchpick:select:${guildId}`;
}

function parseSearchPickerSelectId(customId: string): { guildId: string } | null {
  const match = /^searchpick:select:(.+)$/.exec(customId);
  if (!match) {
    return null;
  }

  return { guildId: match[1] };
}

async function safeReply(interaction: ButtonInteraction | StringSelectMenuInteraction, content: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  payload: SearchPickerRenderPayload
): Promise<Message | null> {
  if (interaction.replied || interaction.deferred) {
    const response = await interaction.followUp({
      ...payload,
      flags: MessageFlags.Ephemeral,
      fetchReply: true
    });
    return response instanceof Object && "id" in response ? (response as Message) : null;
  }

  const response = await interaction.reply({
    ...payload,
    flags: MessageFlags.Ephemeral,
    fetchReply: true
  });
  return response instanceof Object && "id" in response ? (response as Message) : null;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function trim(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function buildResultsText(results: ResolvedTrack[]): string {
  const lines: string[] = [];

  for (const [index, track] of results.entries()) {
    const line = `${index + 1}. [${escapeLabel(trim(track.title, 60))}](${track.url}) • ${formatDuration(track.durationMs)}`;
    const nextText = [...lines, line].join("\n");
    if (nextText.length > MAX_RESULT_FIELD_LENGTH) {
      break;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

function escapeLabel(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`");
}
