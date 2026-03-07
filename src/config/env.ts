import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  BOT_PREFIX: z.string().min(1).default("!"),
  LAVALINK_HOST: z.string().min(1),
  LAVALINK_PORT: z.coerce.number().int().positive(),
  LAVALINK_PASSWORD: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
