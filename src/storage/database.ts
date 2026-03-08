import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

export type SqliteDatabase = Database<sqlite3.Database, sqlite3.Statement>;

export async function createDatabase(databaseUrl: string): Promise<SqliteDatabase> {
  const resolvedPath = path.resolve(databaseUrl);
  await mkdir(path.dirname(resolvedPath), { recursive: true });

  const db = await open({
    filename: resolvedPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL,
      default_volume INTEGER NOT NULL,
      language TEXT NOT NULL DEFAULT 'ja'
    );

    CREATE TABLE IF NOT EXISTS guild_queue_state (
      guild_id TEXT PRIMARY KEY,
      text_channel_id TEXT,
      voice_channel_id TEXT,
      control_message_id TEXT,
      is_playing INTEGER NOT NULL,
      is_paused INTEGER NOT NULL DEFAULT 0,
      is_stopped INTEGER NOT NULL,
      repeat_mode TEXT NOT NULL DEFAULT 'off',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_queue_tracks (
      guild_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_current INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      artwork_url TEXT,
      requested_by TEXT NOT NULL,
      source TEXT NOT NULL,
      encoded_track TEXT NOT NULL,
      PRIMARY KEY (guild_id, position, is_current)
    );

    CREATE TABLE IF NOT EXISTS bot_stats (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_play_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS played_tracks (
      track_id TEXT PRIMARY KEY,
      first_played_at INTEGER NOT NULL
    );
  `);

  await ensureColumn(db, "guild_queue_state", "is_paused", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "guild_queue_state", "repeat_mode", "TEXT NOT NULL DEFAULT 'off'");
  await ensureColumn(db, "guild_settings", "language", "TEXT NOT NULL DEFAULT 'ja'");
  await ensureColumn(db, "guild_queue_tracks", "artwork_url", "TEXT");
  await ensureColumn(db, "guild_queue_tracks", "playback_identifier", "TEXT");
  await db.run(`INSERT OR IGNORE INTO bot_stats (id, total_play_count) VALUES (1, 0)`);

  return db;
}

async function ensureColumn(
  db: SqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): Promise<void> {
  const columns = await db.all<{ name: string }[]>(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
