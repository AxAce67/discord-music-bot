export type MusicButtonAction = "pause" | "skip" | "stop" | "leave" | "queue" | "repeat" | "shuffle";
export type MusicButtonCustomId = `music:${MusicButtonAction}:${string}`;

export function createMusicButtonId(action: MusicButtonAction, guildId: string): MusicButtonCustomId {
  return `music:${action}:${guildId}`;
}

export function parseMusicButtonId(customId: string): { action: MusicButtonAction; guildId: string } | null {
  const match = /^music:(pause|skip|stop|leave|queue|repeat|shuffle):(.+)$/.exec(customId);
  if (!match) {
    return null;
  }

  return {
    action: match[1] as MusicButtonAction,
    guildId: match[2]
  };
}
