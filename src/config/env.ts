import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const optionalString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: optionalString,
  BOT_PREFIX: z.string().min(1).default("!"),
  LAVALINK_HOST: z.string().min(1),
  LAVALINK_PORT: z.coerce.number().int().positive(),
  LAVALINK_PASSWORD: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESOLVER_ENABLED: z
    .preprocess((value) => {
      if (typeof value === "string") {
        return value.toLowerCase() === "true";
      }

      return value;
    }, z.boolean())
    .default(false),
  RESOLVER_BASE_URL: z.string().url().default("http://127.0.0.1:8080"),
  RESOLVER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
