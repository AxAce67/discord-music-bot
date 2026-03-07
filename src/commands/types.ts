import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  Message,
  TextBasedChannel
} from "discord.js";

export type CommandSource = "slash" | "prefix" | "button";

export interface CommandContext {
  source: CommandSource;
  client: Client;
  guildId: string;
  userId: string;
  member: GuildMember;
  textChannel: TextBasedChannel;
  shardId: number;
  voiceChannelId: string | null;
  interaction?: ChatInputCommandInteraction | ButtonInteraction;
  message?: Message<true>;
  reply(content: string, ephemeral?: boolean): Promise<void>;
}

export type SupportedInteraction = ChatInputCommandInteraction | ButtonInteraction;
export type PrefixMessage = Message<true>;
