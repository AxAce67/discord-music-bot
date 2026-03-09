import { MessageFlags, SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import type { CommandContext } from "./types.js";
import type { MusicService } from "../queue/music-service.js";
import type { MusicUiService } from "../ui/music-ui-service.js";
import { QueueViewerService } from "../ui/queue-viewer.js";
import { SearchPickerService } from "../ui/search-picker.js";
import { MusicBotError } from "../errors/music-error.js";
import { buildPlayConfirmationEmbed } from "../ui/play-confirmation.js";
import { buildPlaylistConfirmationEmbed } from "../ui/playlist-confirmation.js";
import { buildHelpEmbed } from "../ui/help-embed.js";
import { buildStatusEmbed } from "../ui/status-embed.js";
import { buildStatsEmbed } from "../ui/stats-embed.js";
import { LocalizationService, isLanguageCode } from "../i18n/localization-service.js";
import type { BotStatsService } from "../stats/bot-stats-service.js";

export const slashCommandDefinitions: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder().setName("help").setDescription("使い方と主なコマンドを表示します。").toJSON(),
  new SlashCommandBuilder().setName("stats").setDescription("bot の利用状況を表示します。").toJSON(),
  new SlashCommandBuilder().setName("join").setDescription("ボイスチャンネルに参加します。").toJSON(),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("曲を再生またはキュー追加します。")
    .addStringOption((option) => option.setName("query").setDescription("URL または検索語").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("YouTubeプレイリストを再生またはキュー追加します。")
    .addStringOption((option) => option.setName("query").setDescription("YouTubeプレイリストURL").setRequired(true))
    .toJSON(),
  new SlashCommandBuilder().setName("pause").setDescription("再生/一時停止を切り替えます。").toJSON(),
  new SlashCommandBuilder().setName("repeat").setDescription("現在の曲のリピートを切り替えます。").toJSON(),
  new SlashCommandBuilder().setName("shuffle").setDescription("未再生キューをシャッフルします。").toJSON(),
  new SlashCommandBuilder()
    .setName("lang")
    .setDescription("表示言語を切り替えます。")
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("ja または en")
        .setRequired(true)
        .addChoices(
          { name: "日本語", value: "ja" },
          { name: "English", value: "en" }
        )
    )
    .toJSON(),
  new SlashCommandBuilder().setName("skip").setDescription("現在の曲をスキップします。").toJSON(),
  new SlashCommandBuilder().setName("stop").setDescription("再生を停止し、キューを消去します。").toJSON(),
  new SlashCommandBuilder().setName("queue").setDescription("現在のキューを表示します。").toJSON(),
  new SlashCommandBuilder().setName("leave").setDescription("VCから退出します。").toJSON()
];

export class MusicCommandHandler {
  constructor(
    private readonly musicService: MusicService,
    private readonly uiService: MusicUiService,
    private readonly queueViewer: QueueViewerService,
    private readonly searchPicker: SearchPickerService,
    private readonly localizationService: LocalizationService,
    private readonly botStatsService: BotStatsService
  ) {}

  async handleHelp(context: CommandContext): Promise<void> {
    const language = await this.localizationService.getLanguage(context.guildId);
    const embed = buildHelpEmbed(language);

    if (context.interaction) {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await context.interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if ("send" in context.textChannel) {
      await context.textChannel.send({ embeds: [embed] });
      return;
    }

    await context.reply(embed.data.description ?? "");
  }

  async handleStats(context: CommandContext): Promise<void> {
    const language = await this.localizationService.getLanguage(context.guildId);
    const stats = await this.botStatsService.getView(context.client);
    const embed = buildStatsEmbed(language, stats);

    if (context.interaction) {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await context.interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if ("send" in context.textChannel) {
      await context.textChannel.send({ embeds: [embed] });
      return;
    }

    await context.reply(embed.data.description ?? "");
  }

  async handleJoin(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    await this.musicService.join({
      guildId: context.guildId,
      voiceChannelId,
      textChannelId: context.textChannel.id,
      shardId: context.shardId
    });
    await this.sendStatusReply(context, text.vcJoined);
  }

  async handlePlay(context: CommandContext, query: string): Promise<void> {
    if (!query.trim()) {
      throw new MusicBotError("QUERY_REQUIRED", "曲名またはURLを入力してください");
    }

    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);

    if (!isUrl(query)) {
      const results = (await this.musicService.search(query)).slice(0, 10);
      if (results.length === 0) {
        throw new MusicBotError("TRACK_NOT_FOUND", "該当する曲が見つかりませんでした。");
      }

      if (context.interaction) {
        await this.searchPicker.createEphemeral(context.interaction, context.guildId, context.userId, results);
      } else {
        await this.searchPicker.create(context.textChannel, context.guildId, context.userId, results);
      }
      return;
    }

    const queueBeforeEnqueue = await this.musicService.getQueue(context.guildId);
    const track = await this.musicService.enqueue(
      {
        guildId: context.guildId,
        voiceChannelId,
        textChannelId: context.textChannel.id,
        shardId: context.shardId
      },
      {
        query,
        requestedBy: context.userId,
        requestedAt: Date.now()
      }
    );
    this.queueControlMessageSync(context, true);
    await this.sendPlayConfirmation(context, track.title, track.url, queueBeforeEnqueue.currentTrack === null);
  }

  async handlePlaylist(context: CommandContext, query: string): Promise<void> {
    if (!query.trim()) {
      throw new MusicBotError("PLAYLIST_URL_REQUIRED", "YouTubeプレイリストURLを入力してください");
    }

    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);

    if (!isPlaylistUrl(query)) {
      throw new MusicBotError("PLAYLIST_URL_REQUIRED", "YouTubeプレイリストURLを指定してください。");
    }

    if (isYoutubeMixUrl(query)) {
      throw new MusicBotError(
        "PLAYLIST_URL_REQUIRED",
        "YouTube Mix / Radio URL は !playlist では扱えません。通常のプレイリストURLを使うか !play を使ってください。"
      );
    }

    const queueBeforeEnqueue = await this.musicService.getQueue(context.guildId);
    const playlist = await this.musicService.enqueuePlaylist(
      {
        guildId: context.guildId,
        voiceChannelId,
        textChannelId: context.textChannel.id,
        shardId: context.shardId
      },
      {
        query,
        requestedBy: context.userId,
        requestedAt: Date.now()
      }
    );

    this.queueControlMessageSync(context, true);
    await this.sendPlaylistConfirmation(context, playlist.totalCount, queueBeforeEnqueue.currentTrack === null);
  }

  async handleSkip(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    await this.musicService.skip(context.guildId);
    await this.syncControlMessage(context, true);
    await this.sendStatusReply(context, text.trackSkipped, context.source !== "prefix");
  }

  async handlePause(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const queue = await this.musicService.getQueue(context.guildId);

    if (!queue.currentTrack && queue.upcomingTracks.length > 0) {
      if (!context.voiceChannelId) {
        throw new MusicBotError(
          "RESUME_VOICE_REQUIRED",
          "先にVCへ参加してください\n参加してから `再開` ボタンを押すか !play 曲名 または !play URL を入力してください"
        );
      }

      await ensureControllableVoiceState(this.musicService, context, context.voiceChannelId);
      await this.musicService.resumeFromQueue({
        guildId: context.guildId,
        voiceChannelId: context.voiceChannelId,
        textChannelId: context.textChannel.id,
        shardId: context.shardId
      });
      await this.syncControlMessage(context, true);
      await this.sendStatusReply(context, text.resumedFromQueue, context.source !== "prefix");
      return;
    }

    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    const state = await this.musicService.togglePause(context.guildId);
    await this.syncControlMessage(context, true);
    await this.sendStatusReply(context, state.isPaused ? text.paused : text.resumed, context.source !== "prefix");
  }

  async handleRepeat(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    const state = await this.musicService.toggleRepeat(context.guildId);
    await this.syncControlMessage(context, true);

    if (context.source !== "button") {
      await this.sendStatusReply(
        context,
        state.repeatMode === "track" ? text.repeatOn : text.repeatOff,
        context.source !== "prefix"
      );
    }
  }

  async handleShuffle(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    const state = await this.musicService.shuffleUpcoming(context.guildId);
    await this.syncControlMessage(context, true);

    if (context.source !== "button") {
      await this.sendStatusReply(
        context,
        state.upcomingTracks.length > 1 ? text.shuffled : text.shuffleInsufficient,
        context.source !== "prefix"
      );
    }
  }

  async handleStop(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    await this.musicService.stop(context.guildId);
    await this.syncControlMessage(context, true);
    await this.sendStatusReply(context, text.stopped, context.source !== "prefix");
  }

  async handleQueue(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    await this.syncControlMessage(context);
    if (context.interaction) {
      await this.queueViewer.createEphemeral(context.interaction, context.guildId, context.userId);
      return;
    }

    await this.queueViewer.create(context.textChannel, context.guildId, context.userId);
    await this.sendStatusReply(context, text.queueShown);
  }

  async handleLeave(context: CommandContext): Promise<void> {
    const text = await this.localizationService.getMessages(context.guildId);
    const voiceChannelId = requireVoice(context);
    await ensureControllableVoiceState(this.musicService, context, voiceChannelId);
    await this.uiService.deleteControlMessage(context.guildId);
    await this.musicService.leave(context.guildId);
    await this.sendStatusReply(context, text.leftVoice, context.source !== "prefix");
  }

  async handleLang(context: CommandContext, languageInput: string): Promise<void> {
    if (!isLanguageCode(languageInput)) {
      const text = await this.localizationService.getMessages(context.guildId);
      throw new MusicBotError("INVALID_LANGUAGE", text.invalidLanguage);
    }

    await this.localizationService.setLanguage(context.guildId, languageInput);
    await this.uiService.refreshControlMessage(context.guildId).catch(() => undefined);
    const text = await this.localizationService.getMessages(context.guildId);
    await this.sendStatusReply(context, text.languageSet(text.languageName), context.source !== "prefix");
  }

  private async sendPlayConfirmation(
    context: CommandContext,
    title: string,
    url: string,
    startedPlaybackImmediately: boolean
  ): Promise<void> {
    const language = await this.localizationService.getLanguage(context.guildId);
    const embed = buildPlayConfirmationEmbed(language, title, url, startedPlaybackImmediately);

    if (context.interaction) {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await context.interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (!("send" in context.textChannel)) {
      const text = await this.localizationService.getMessages(context.guildId);
      await context.reply(startedPlaybackImmediately ? text.playStarted : text.queued);
      return;
    }

    const message = await context.textChannel.send({ embeds: [embed] });
    setTimeout(() => {
      void message.delete().catch(() => undefined);
    }, 5000);
  }

  private async syncControlMessage(context: CommandContext, moveToBottom = false): Promise<void> {
    if (moveToBottom) {
      await this.uiService.recreateControlMessageInChannel(context.guildId, context.textChannel);
      return;
    }

    await this.uiService.refreshControlMessage(context.guildId);
  }

  private queueControlMessageSync(context: CommandContext, moveToBottom = false): void {
    void this.syncControlMessage(context, moveToBottom).catch(() => undefined);
  }

  private async sendPlaylistConfirmation(
    context: CommandContext,
    trackCount: number,
    startedPlaybackImmediately: boolean
  ): Promise<void> {
    const language = await this.localizationService.getLanguage(context.guildId);
    const embed = buildPlaylistConfirmationEmbed(language, trackCount, startedPlaybackImmediately);

    if (context.interaction) {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        await context.interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (!("send" in context.textChannel)) {
      const text = await this.localizationService.getMessages(context.guildId);
      await context.reply(startedPlaybackImmediately ? text.playlistStarted : text.playlistQueued);
      return;
    }

    const message = await context.textChannel.send({ embeds: [embed] });
    setTimeout(() => {
      void message.delete().catch(() => undefined);
    }, 5000);
  }

  private async sendStatusReply(context: CommandContext, message: string, ephemeral = false): Promise<void> {
    const embed = buildStatusEmbed(message);

    if (context.interaction) {
      if (context.interaction.replied || context.interaction.deferred) {
        await context.interaction.followUp({ embeds: [embed], ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      } else {
        await context.interaction.reply({ embeds: [embed], ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      }
      return;
    }

    if (!("send" in context.textChannel)) {
      await context.reply(message);
      return;
    }

    const sent = await context.textChannel.send({ embeds: [embed] });
    setTimeout(() => {
      void sent.delete().catch(() => undefined);
    }, 5000);
  }
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPlaylistUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be")) &&
      url.searchParams.has("list")
    );
  } catch {
    return false;
  }
}

function isYoutubeMixUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!(url.hostname.includes("youtube.com") || url.hostname.includes("youtu.be"))) {
      return false;
    }

    const listId = url.searchParams.get("list");
    return Boolean(url.searchParams.get("start_radio")) || (listId?.startsWith("RD") ?? false);
  } catch {
    return false;
  }
}

function requireVoice(context: CommandContext): string {
  if (!context.voiceChannelId) {
    throw new MusicBotError("VOICE_REQUIRED", "先にVCへ参加してください。");
  }

  return context.voiceChannelId;
}

async function ensureControllableVoiceState(
  musicService: MusicService,
  context: CommandContext,
  callerVoiceChannelId: string
): Promise<void> {
  const queue = await musicService.getQueue(context.guildId);
  if (queue.voiceChannelId && queue.voiceChannelId !== callerVoiceChannelId) {
    throw new MusicBotError("VOICE_MISMATCH", "bot と同じVCに参加してから操作してください。");
  }
}
