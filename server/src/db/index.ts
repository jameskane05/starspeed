import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

const dbPath = process.env.DB_PATH || "./data/starspeed.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    discord_id TEXT UNIQUE,
    google_id TEXT UNIQUE,
    apple_id TEXT UNIQUE,
    email TEXT,
    name TEXT NOT NULL,
    callsign TEXT,
    anonymous INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  )
`);

export function upsertUser(data: {
  discordId?: string;
  googleId?: string;
  appleId?: string;
  email?: string;
  name: string;
  callsign?: string;
  anonymous?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);
  let row: { id: string } | undefined;

  if (data.discordId) {
    row = db.prepare("SELECT id FROM users WHERE discord_id = ?").get(data.discordId) as { id: string } | undefined;
  } else if (data.googleId) {
    row = db.prepare("SELECT id FROM users WHERE google_id = ?").get(data.googleId) as { id: string } | undefined;
  } else if (data.appleId) {
    row = db.prepare("SELECT id FROM users WHERE apple_id = ?").get(data.appleId) as { id: string } | undefined;
  }

  if (row) {
    db.prepare(`
      UPDATE users SET name = ?, email = coalesce(?, email), callsign = coalesce(?, callsign), updated_at = ?
      WHERE id = ?
    `).run(data.name, data.email ?? null, data.callsign ?? null, now, row.id);
    return { id: row.id, ...data };
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO users (id, discord_id, google_id, apple_id, email, name, callsign, anonymous, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.discordId ?? null,
    data.googleId ?? null,
    data.appleId ?? null,
    data.email ?? null,
    data.name,
    data.callsign ?? null,
    data.anonymous ? 1 : 0,
    now,
    now,
  );
  return { id, ...data };
}

export function findUserById(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
}
