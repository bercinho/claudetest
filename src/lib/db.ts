import "server-only";

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const DEFAULT_SETTINGS: Record<string, string> = {
  family_name: "Family HQ",
  currency_symbol: "€",
  currency_position: "before", // 'before' | 'after'
  points_label: "points",
  timezone: "Europe/Budapest",
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured && configured.trim() !== "") return path.resolve(configured);
  return path.join(process.cwd(), "data", "family.db");
}

function open(): DB {
  const file = resolveDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");
  db.exec(schema);

  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

  return db;
}

// Next.js reloads modules in dev; keep one connection per process.
const globalForDb = globalThis as unknown as { __familyHqDb?: DB };

export function getDb(): DB {
  if (!globalForDb.__familyHqDb) globalForDb.__familyHqDb = open();
  return globalForDb.__familyHqDb;
}

export type Settings = {
  familyName: string;
  currencySymbol: string;
  currencyPosition: "before" | "after";
  pointsLabel: string;
  timezone: string;
};

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: keyof typeof DEFAULT_SETTINGS) => map.get(key) ?? DEFAULT_SETTINGS[key];

  return {
    familyName: read("family_name"),
    currencySymbol: read("currency_symbol"),
    currencyPosition: read("currency_position") === "after" ? "after" : "before",
    pointsLabel: read("points_label"),
    timezone: read("timezone"),
  };
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

/** Runs `fn` inside a transaction. better-sqlite3 is synchronous, so this is safe to nest-free use. */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}
