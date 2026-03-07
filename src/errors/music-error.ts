export class MusicBotError extends Error {
  public readonly code: string;
  public readonly userMessage: string;

  constructor(code: string, userMessage: string, message?: string) {
    super(message ?? userMessage);
    this.code = code;
    this.userMessage = userMessage;
  }
}
