import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  Message,
  TextBasedChannel
} from "discord.js";
import { MusicBotError } from "../errors/music-error.js";
import type { CommandContext } from "./types.js";

export async function createSlashContext(interaction: ChatInputCommandInteraction): Promise<CommandContext> {
  if (!interaction.inCachedGuild()) {
    throw new MusicBotError("GUILD_ONLY", "このコマンドはサーバー内でのみ使えます。");
  }

  const member = interaction.member as GuildMember;
  const textChannel = interaction.channel;
  if (!textChannel?.isTextBased()) {
    throw new MusicBotError("TEXT_CHANNEL_REQUIRED", "テキストチャンネルで実行してください。");
  }

  return {
    source: "slash",
    client: interaction.client,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    member,
    textChannel,
    shardId: interaction.guild.shardId,
    voiceChannelId: member.voice.channelId ?? null,
    interaction,
    reply: async (content, ephemeral = false) => {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      } else {
        await interaction.reply({ content, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      }
    }
  };
}

export async function createButtonContext(interaction: ButtonInteraction): Promise<CommandContext> {
  if (!interaction.inCachedGuild()) {
    throw new MusicBotError("GUILD_ONLY", "この操作はサーバー内でのみ使えます。");
  }

  const member = interaction.member as GuildMember;
  const textChannel = interaction.channel;
  if (!textChannel?.isTextBased()) {
    throw new MusicBotError("TEXT_CHANNEL_REQUIRED", "テキストチャンネルで実行してください。");
  }

  return {
    source: "button",
    client: interaction.client,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    member,
    textChannel,
    shardId: interaction.guild.shardId,
    voiceChannelId: member.voice.channelId ?? null,
    interaction,
    reply: async (content, ephemeral = true) => {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      } else {
        await interaction.reply({ content, ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}) });
      }
    }
  };
}

export async function createPrefixContext(message: Message<true>): Promise<CommandContext> {
  if (!message.member) {
    throw new MusicBotError("MEMBER_REQUIRED", "メンバー情報を取得できませんでした。");
  }

  return {
    source: "prefix",
    client: message.client,
    guildId: message.guildId,
    userId: message.author.id,
    member: message.member,
    textChannel: message.channel as TextBasedChannel,
    shardId: message.guild.shardId,
    voiceChannelId: message.member.voice.channelId ?? null,
    message,
    reply: async (content) => {
      await message.reply(content);
    }
  };
}
