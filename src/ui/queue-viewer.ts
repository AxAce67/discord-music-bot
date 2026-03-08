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
import type { MusicService } from "../queue/music-service.js";
import type { QueueTrack } from "../types/music.js";
import { MusicBotError } from "../errors/music-error.js";
import { LocalizationService } from "../i18n/localization-service.js";
import { buildStatusEmbed } from "./status-embed.js";
import { buildQueueRemoveConfirmationEmbed } from "./queue-remove-confirmation.js";

type QueueViewerAction = "prev" | "next" | "remove" | "close";
type QueueViewerButtonId = `queueview:${QueueViewerAction}:${string}`;
type QueueViewerSelectId = `queueview:select:${string}`;

interface QueueViewerSession {
  guildId: string;
  ownerId: string;
  channelId: string;
  page: number;
  selectedQueueIndex: number | null;
}

interface QueueViewerRenderPayload {
  embeds: [EmbedBuilder];
  components: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>>;
}

const PAGE_SIZE = 5;

export class QueueViewerService {
  private readonly sessions = new Map<string, QueueViewerSession>();

  constructor(
    private readonly musicService: MusicService,
    private readonly localizationService: LocalizationService
  ) {}

  async create(channel: TextBasedChannel, guildId: string, ownerId: string): Promise<void> {
    if (!("send" in channel)) {
      throw new MusicBotError("QUEUE_VIEW_UNAVAILABLE", "このチャンネルではキューを表示できません。");
    }

    const session: QueueViewerSession = {
      guildId,
      ownerId,
      channelId: channel.id,
      page: 0,
      selectedQueueIndex: null
    };

    const message = await channel.send(await this.render(session));
    this.sessions.set(message.id, session);
  }

  async createEphemeral(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    guildId: string,
    ownerId: string
  ): Promise<void> {
    const session: QueueViewerSession = {
      guildId,
      ownerId,
      channelId: interaction.channelId ?? "ephemeral",
      page: 0,
      selectedQueueIndex: null
    };

    const payload = await this.render(session);
    const message = await replyEphemeral(interaction, payload);
    if (message) {
      this.sessions.set(message.id, session);
    }
  }

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const parsed = parseQueueViewerButtonId(interaction.customId);
    if (!parsed) {
      return false;
    }

    const session = this.sessions.get(interaction.message.id);
    if (!session) {
      await safeReply(interaction, (await this.localizationService.getMessages(parsed.guildId)).queueExpired);
      return true;
    }

    if (session.ownerId !== interaction.user.id) {
      await safeReply(interaction, (await this.localizationService.getMessages(session.guildId)).queueOwnerOnly);
      return true;
    }

    const queueView = await this.musicService.getQueueView(session.guildId);
    const totalPages = Math.max(1, Math.ceil(queueView.upcomingTracks.length / PAGE_SIZE));

    switch (parsed.action) {
      case "prev":
        session.page = Math.max(0, session.page - 1);
        break;
      case "next":
        session.page = Math.min(totalPages - 1, session.page + 1);
        break;
      case "remove":
        if (session.selectedQueueIndex === null) {
          await safeReply(interaction, (await this.localizationService.getMessages(session.guildId)).queueSelectRequired);
          return true;
        }

        const removed = await this.musicService.removeUpcomingTrack(session.guildId, session.selectedQueueIndex);
        session.selectedQueueIndex = null;
        const language = await this.localizationService.getLanguage(session.guildId);
        await interaction.update(await this.render(session));
        await interaction.followUp({
          embeds: [buildQueueRemoveConfirmationEmbed(language, removed.title)],
          flags: MessageFlags.Ephemeral
        });
        return true;
        break;
      case "close":
        this.sessions.delete(interaction.message.id);
        await interaction.message.delete().catch(() => undefined);
        return true;
    }

    await interaction.update(await this.render(session));
    return true;
  }

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
    const parsed = parseQueueViewerSelectId(interaction.customId);
    if (!parsed) {
      return false;
    }

    const session = this.sessions.get(interaction.message.id);
    if (!session) {
      await safeReply(interaction, (await this.localizationService.getMessages(parsed.guildId)).queueExpired);
      return true;
    }

    if (session.ownerId !== interaction.user.id) {
      await safeReply(interaction, (await this.localizationService.getMessages(session.guildId)).queueOwnerOnly);
      return true;
    }

    session.selectedQueueIndex = Number(interaction.values[0]);
    await interaction.update(await this.render(session));
    return true;
  }

  private async render(session: QueueViewerSession): Promise<QueueViewerRenderPayload> {
    const text = await this.localizationService.getMessages(session.guildId);
    const queueView = await this.musicService.getQueueView(session.guildId);
    const totalPages = Math.max(1, Math.ceil(queueView.upcomingTracks.length / PAGE_SIZE));
    session.page = Math.min(session.page, totalPages - 1);
    const pageItems = queueView.upcomingTracks.slice(session.page * PAGE_SIZE, (session.page + 1) * PAGE_SIZE);

    const embed = new EmbedBuilder()
      .setTitle(text.queueTitle)
      .setColor(0x1f6feb)
      .setDescription(
        queueView.currentTrack
          ? `${text.queueNowPlaying}: **[${queueView.currentTrack.title}](${queueView.currentTrack.url})**`
          : text.queueNoCurrent
      )
      .addFields({
        name: text.queuePage(session.page + 1, totalPages),
        value: pageItems.length > 0
          ? pageItems
              .map(
                (track, index) =>
                  `${session.page * PAGE_SIZE + index + 1}. [${escapeLabel(track.title)}](${track.url}) • ${formatDuration(track.durationMs)}`
              )
              .join("\n")
          : text.controlNoNext
      })
      .setFooter({
        text: session.selectedQueueIndex !== null
          ? text.queueSelected(session.selectedQueueIndex + 1)
          : text.queueTotal(queueView.upcomingTracks.length)
      });

    if (queueView.currentTrack?.artworkUrl) {
      embed.setThumbnail(queueView.currentTrack.artworkUrl);
    }

    const components = [
      buildQueueViewerButtons(session, queueView.upcomingTracks.length, totalPages, text),
      buildQueueViewerSelect(session, pageItems, text)
    ].filter((component): component is ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder> => component !== null);

    return {
      embeds: [embed],
      components
    };
  }
}

function buildQueueViewerButtons(
  session: QueueViewerSession,
  totalUpcoming: number,
  totalPages: number,
  text: Awaited<ReturnType<LocalizationService["getMessages"]>>
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createQueueViewerButtonId("prev", session.guildId))
      .setLabel(text.queuePrev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.page === 0),
    new ButtonBuilder()
      .setCustomId(createQueueViewerButtonId("next", session.guildId))
      .setLabel(text.queueNext)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(createQueueViewerButtonId("remove", session.guildId))
      .setLabel(text.queueRemove)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(totalUpcoming === 0 || session.selectedQueueIndex === null),
    new ButtonBuilder()
      .setCustomId(createQueueViewerButtonId("close", session.guildId))
      .setLabel(text.queueClose)
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildQueueViewerSelect(
  session: QueueViewerSession,
  pageItems: QueueTrack[],
  text: Awaited<ReturnType<LocalizationService["getMessages"]>>
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (pageItems.length === 0) {
    return null;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(createQueueViewerSelectId(session.guildId))
    .setPlaceholder(text.queueSelectPlaceholder)
    .addOptions(
      pageItems.map((track, index) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(trim(track.title, 90))
          .setDescription(formatDuration(track.durationMs))
          .setValue(String(session.page * PAGE_SIZE + index))
          .setDefault(session.selectedQueueIndex === session.page * PAGE_SIZE + index)
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function createQueueViewerButtonId(action: QueueViewerAction, guildId: string): QueueViewerButtonId {
  return `queueview:${action}:${guildId}`;
}

function parseQueueViewerButtonId(customId: string): { action: QueueViewerAction; guildId: string } | null {
  const match = /^queueview:(prev|next|remove|close):(.+)$/.exec(customId);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as QueueViewerAction,
    guildId: match[2]
  };
}

function createQueueViewerSelectId(guildId: string): QueueViewerSelectId {
  return `queueview:select:${guildId}`;
}

function parseQueueViewerSelectId(customId: string): { guildId: string } | null {
  const match = /^queueview:select:(.+)$/.exec(customId);
  if (!match) {
    return null;
  }

  return { guildId: match[1] };
}

async function safeReply(interaction: ButtonInteraction | StringSelectMenuInteraction, content: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [buildStatusEmbed(content)], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [buildStatusEmbed(content)], flags: MessageFlags.Ephemeral });
  }
}

async function replyEphemeral(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  payload: QueueViewerRenderPayload
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function trim(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function escapeLabel(value: string): string {
  return value.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
