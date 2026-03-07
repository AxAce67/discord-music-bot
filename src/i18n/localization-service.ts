import type { MusicBotError } from "../errors/music-error.js";
import type { SettingsRepository } from "../storage/repositories.js";
import type { GuildId, LanguageCode } from "../types/music.js";
import { getMessages, isLanguageCode, translateErrorCode } from "./messages.js";

export class LocalizationService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getLanguage(guildId: GuildId): Promise<LanguageCode> {
    const settings = await this.settingsRepository.loadSettings(guildId);
    return settings.language;
  }

  async setLanguage(guildId: GuildId, language: LanguageCode): Promise<void> {
    const settings = await this.settingsRepository.loadSettings(guildId);
    settings.language = language;
    await this.settingsRepository.saveSettings(settings);
  }

  async getMessages(guildId: GuildId) {
    return getMessages(await this.getLanguage(guildId));
  }

  translateError(language: LanguageCode, error: unknown): string {
    if (isMusicBotError(error)) {
      return translateErrorCode(language, error.code, error.userMessage);
    }

    return getMessages(language).errorFallback;
  }
}

function isMusicBotError(error: unknown): error is MusicBotError {
  return error instanceof Error && "code" in error && "userMessage" in error;
}

export { getMessages, isLanguageCode };
