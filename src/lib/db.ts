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
  grade_min: "1", // the school's grading scale, e.g. Hungarian 1–5 or German 1–6
  grade_max: "5",
  grade_best_is_high: "true",
};

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured && configured.trim() !== "") return path.resolve(configured);
  return path.join(process.cwd(), "data", "family.db");
}

/**
 * Schema versions. `schema.sql` is always the current shape and is used
 * verbatim for a brand-new database; the numbered migrations only ever run on
 * a database created by an earlier version.
 */
const SCHEMA_VERSION = 4;
const MIGRATIONS: { version: number; file: string }[] = [
  { version: 2, file: "002-school-sport.sql" },
  { version: 3, file: "003-screen-time.sql" },
  { version: 4, file: "004-push-and-devices.sql" },
];

function sqlFile(...parts: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), "src", "lib", ...parts), "utf8");
}

function migrate(db: DB): void {
  const isFresh =
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() === undefined;

  if (isFresh) {
    // schema.sql sets user_version itself, so applying it is enough.
    db.exec(sqlFile("schema.sql"));
    const applied = db.pragma("user_version", { simple: true }) as number;
    if (applied !== SCHEMA_VERSION) {
      throw new Error(
        `schema.sql declares user_version ${applied} but the migration list expects ${SCHEMA_VERSION}. ` +
          "Bump the PRAGMA in schema.sql when you add a migration.",
      );
    }
    return;
  }

  const current = db.pragma("user_version", { simple: true }) as number;
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return;

  // Rebuilding a table means dropping and renaming, which foreign keys would
  // fight; they are checked again once the migrations are in.
  db.pragma("foreign_keys = OFF");
  try {
    for (const migration of pending) {
      const sql = sqlFile("migrations", migration.file);
      db.transaction(() => {
        db.exec(sql);
        db.pragma(`user_version = ${migration.version}`);
      })();
    }
    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`Migration left ${violations.length} foreign key violation(s) behind`);
    }
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function open(): DB {
  const file = resolveDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  migrate(db);

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
  /** Worst mark on the school's scale (1 in Hungary, 1 in Germany, 0 for percentages). */
  gradeMin: number;
  /** Best mark on the scale (5 in Hungary, 6 in Germany). */
  gradeMax: number;
  /** False for scales where a lower number is the better mark, such as the German 1–6. */
  gradeBestIsHigh: boolean;
};

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: keyof typeof DEFAULT_SETTINGS) => map.get(key) ?? DEFAULT_SETTINGS[key];

  const number = (key: keyof typeof DEFAULT_SETTINGS, fallback: number) => {
    const value = Number(read(key));
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    familyName: read("family_name"),
    currencySymbol: read("currency_symbol"),
    currencyPosition: read("currency_position") === "after" ? "after" : "before",
    pointsLabel: read("points_label"),
    timezone: read("timezone"),
    gradeMin: number("grade_min", 1),
    gradeMax: number("grade_max", 5),
    gradeBestIsHigh: read("grade_best_is_high") !== "false",
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
