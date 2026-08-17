/**
 * Fills a fresh database with a believable family so the app can be explored
 * before any real data exists.
 *
 *   npm run seed            # refuses if the database already has people in it
 *   npm run seed -- --force # wipes everything first
 *
 * Runs standalone (no Next.js), so it talks to SQLite directly.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashPin } from "../src/lib/pin.ts";

const force = process.argv.includes("--force");
const dbPath = path.resolve(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "family.db"));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

const existing = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
if (existing > 0 && !force) {
  console.error(`${dbPath} already has ${existing} people in it. Re-run with --force to wipe and reseed.`);
  process.exit(1);
}

if (force) {
  for (const table of [
    "ledger",
    "task_instances",
    "tasks",
    "policy_applications",
    "policies",
    "redemptions",
    "rewards",
    "requests",
    "goals",
    "allowances",
    "users",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare("DELETE FROM sqlite_sequence").run();
}

const today = new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// --- People ----------------------------------------------------------------

const insertUser = db.prepare("INSERT INTO users (name, role, pin_hash, emoji, color) VALUES (?, ?, ?, ?, ?)");
const parentId = Number(insertUser.run("Dad", "PARENT", hashPin("1234"), "🧑‍🍼", "violet").lastInsertRowid);
const sonId = Number(insertUser.run("Márk", "CHILD", hashPin("1111"), "👦", "sky").lastInsertRowid);

db.prepare("INSERT INTO settings (key, value) VALUES ('family_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
  "Our family",
);

// --- Tasks -----------------------------------------------------------------

const insertTask = db.prepare(
  `INSERT INTO tasks (title, details, child_id, points, money_cents, penalty_points, recurrence, days_mask,
                      due_time, start_date, auto_approve, created_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const MON_TO_FRI = 0b0011111;
const taskIds = {
  bed: Number(
    insertTask.run("Make the bed", "Duvet straight, pillow on top", sonId, 3, 0, 0, "DAILY", 0, "08:00", addDays(today, -20), 1, parentId)
      .lastInsertRowid,
  ),
  homework: Number(
    insertTask.run("Homework done", "Before any screen goes on", sonId, 10, 0, 5, "WEEKDAYS", MON_TO_FRI, "18:00", addDays(today, -20), 0, parentId)
      .lastInsertRowid,
  ),
  dishes: Number(
    insertTask.run("Clear the table", "", sonId, 5, 0, 0, "DAILY", 0, "19:30", addDays(today, -20), 0, parentId).lastInsertRowid,
  ),
  bins: Number(
    insertTask.run("Take the bins out", "Green bin on Tuesdays", sonId, 8, 50, 0, "WEEKLY", 0b0000010, "20:00", addDays(today, -20), 0, parentId)
      .lastInsertRowid,
  ),
  room: Number(
    insertTask.run("Tidy your room properly", "Floor visible, desk clear", sonId, 20, 200, 0, "WEEKLY", 0b0100000, "12:00", addDays(today, -20), 0, parentId)
      .lastInsertRowid,
  ),
};

// --- House rules -----------------------------------------------------------

const insertPolicy = db.prepare(
  "INSERT INTO policies (title, details, kind, points, money_cents, child_id) VALUES (?, ?, ?, ?, ?, ?)",
);
insertPolicy.run("Kind to your sister", "Noticed being generous without being asked", "REWARD", 10, 0, null);
insertPolicy.run("Reading half an hour", "A real book, not a screen", "REWARD", 8, 0, null);
insertPolicy.run("Helped without being asked", "", "REWARD", 15, 0, null);
insertPolicy.run("Rude answer", "Talking back, name-calling", "PENALTY", 10, 0, null);
insertPolicy.run("Screen past agreed time", "Every started 15 minutes", "PENALTY", 15, 0, null);
insertPolicy.run("Left a mess in a shared room", "", "PENALTY", 5, 0, null);

// --- Rewards ---------------------------------------------------------------

const insertReward = db.prepare(
  "INSERT INTO rewards (title, details, cost_points, cost_money_cents, child_id, stock) VALUES (?, ?, ?, ?, ?, ?)",
);
insertReward.run("An extra hour of screen time", "Weekends only", 60, 0, null, null);
insertReward.run("Pick what's for dinner", "Within reason", 40, 0, null, null);
insertReward.run("Friend over for a sleepover", "Needs a free Saturday", 150, 0, null, null);
insertReward.run("Stay up an hour later", "Not on a school night", 50, 0, null, null);
insertReward.run("Cinema trip", "Ticket and popcorn", 200, 500, null, 2);

// --- Pocket money ----------------------------------------------------------

db.prepare(
  `INSERT INTO allowances (child_id, base_cents, cadence, payday, bonus_per_point_cents, min_points, active)
   VALUES (?, ?, 'WEEKLY', 6, ?, ?, 1)`,
).run(sonId, 500, 5, 40);

// Leave some money outside the goal, so the rewards shop is usable in the demo.
db.prepare("INSERT INTO goals (child_id, title, target_cents, saved_cents) VALUES (?, ?, ?, ?)").run(
  sonId,
  "Skateboard",
  6500,
  600,
);

// --- A fortnight of history ------------------------------------------------

const insertInstance = db.prepare(
  `INSERT OR IGNORE INTO task_instances (task_id, child_id, due_date, due_time, status, submitted_at, reviewed_at,
                                         reviewed_by, points_awarded)
   VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)`,
);
const insertLedger = db.prepare(
  `INSERT INTO ledger (child_id, currency, amount, reason, source, source_id, created_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime(?))`,
);

const history: { taskId: number; title: string; points: number; time: string }[] = [
  { taskId: taskIds.bed, title: "Make the bed", points: 3, time: "08:00" },
  { taskId: taskIds.homework, title: "Homework done", points: 10, time: "18:00" },
  { taskId: taskIds.dishes, title: "Clear the table", points: 5, time: "19:30" },
];

for (let dayOffset = 14; dayOffset >= 1; dayOffset--) {
  const date = addDays(today, -dayOffset);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  for (const task of history) {
    if (task.taskId === taskIds.homework && (weekday === 0 || weekday === 6)) continue;
    // A believable slip rate rather than a perfect record.
    const slipped = (dayOffset * 7 + task.points) % 9 === 0;

    if (slipped) {
      db.prepare(
        "INSERT OR IGNORE INTO task_instances (task_id, child_id, due_date, due_time, status) VALUES (?, ?, ?, ?, 'MISSED')",
      ).run(task.taskId, sonId, date, task.time);
      continue;
    }

    insertInstance.run(task.taskId, sonId, date, task.time, "APPROVED", parentId, task.points);
    insertLedger.run(sonId, "POINTS", task.points, `Task: ${task.title}`, "TASK", null, parentId, `${date} ${task.time}`);
  }
}

insertLedger.run(sonId, "POINTS", -10, "Rude answer — before school", "POLICY", null, parentId, `${addDays(today, -9)} 07:40`);
insertLedger.run(sonId, "POINTS", 15, "Helped without being asked — carried the shopping", "POLICY", null, parentId, `${addDays(today, -6)} 17:10`);
insertLedger.run(sonId, "MONEY", 500, "Weekly pocket money", "ALLOWANCE", null, null, `${addDays(today, -8)} 09:00`);
insertLedger.run(sonId, "MONEY", 500, "Weekly pocket money", "ALLOWANCE", null, null, `${addDays(today, -1)} 09:00`);
insertLedger.run(sonId, "MONEY", 340, "Performance bonus: 68 points", "ALLOWANCE", null, null, `${addDays(today, -1)} 09:00`);
insertLedger.run(sonId, "MONEY", -140, "Reward: Comic book", "REWARD", null, parentId, `${addDays(today, -4)} 16:20`);

db.prepare(
  "INSERT INTO requests (child_id, kind, title, details, amount_cents, status) VALUES (?, 'PERMISSION', ?, ?, 0, 'OPEN')",
).run(sonId, "Sleepover at Máté's on Saturday", "His mum will pick us up at 5 and drop me back Sunday morning.");

console.log(`Seeded ${dbPath}`);
console.log("  Dad  (parent) — PIN 1234");
console.log("  Márk (child)  — PIN 1111");
db.close();
