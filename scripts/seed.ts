/**
 * Fills a fresh database with a believable family so the app can be explored
 * before any real data exists.
 *
 *   npm run seed            # refuses if a database already exists
 *   npm run seed -- --force # deletes it first and starts clean
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

// Seeding writes the current schema straight in, which is only safe on a file
// that does not already hold an older shape. --force starts from nothing.
if (force) {
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.rmSync(`${dbPath}${suffix}`);
  }
} else if (fs.existsSync(dbPath)) {
  console.error(`${dbPath} already exists. Re-run with --force to wipe and reseed, or use \`npm run reset\` first.`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8"));

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
  `INSERT INTO rewards (title, details, cost_points, cost_money_cents, child_id, stock, screen_minutes)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
insertReward.run("An extra hour of screen time", "Weekends only", 60, 0, null, null, 60);
insertReward.run("Half an hour more on a school night", "", 35, 0, null, null, 30);
insertReward.run("Pick what's for dinner", "Within reason", 40, 0, null, null, 0);
insertReward.run("Friend over for a sleepover", "Needs a free Saturday", 150, 0, null, null, 0);
insertReward.run("Stay up an hour later", "Not on a school night", 50, 0, null, null, 0);
insertReward.run("Cinema trip", "Ticket and popcorn", 200, 500, null, 2, 0);

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


// --- School ----------------------------------------------------------------

// A term wrapped around today, so the demo always has a live one.
const termStart = addDays(today, -45);
const termEnd = addDays(today, 75);
const termId = Number(
  db.prepare("INSERT INTO terms (name, start_date, end_date) VALUES (?, ?, ?)").run("Autumn term", termStart, termEnd)
    .lastInsertRowid,
);

const insertSubject = db.prepare(
  "INSERT INTO subjects (term_id, child_id, name, teacher, emoji) VALUES (?, ?, ?, ?, ?)",
);
const subjectIds: Record<string, number> = {};
for (const [name, teacher, emoji] of [
  ["Mathematics", "Kovács Anna", "📐"],
  ["Hungarian literature", "Szabó Péter", "📖"],
  ["History", "Nagy Éva", "🏛️"],
  ["English", "Tóth Márta", "🇬🇧"],
  ["Biology", "Varga Gábor", "🧬"],
  ["Physical education", "Horváth Zsolt", "🏃"],
] as const) {
  subjectIds[name] = Number(insertSubject.run(termId, sonId, name, teacher, emoji).lastInsertRowid);
}

const insertGrade = db.prepare(
  `INSERT INTO grades (subject_id, child_id, title, kind, value, out_of, weight, date, note, recorded_by,
                       confirmed, confirmed_by, confirmed_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
);

const marks: [string, string, string, number, number, number, number][] = [
  // subject, title, kind, value, out of, weight, days ago
  ["Mathematics", "Quadratic equations", "TEST", 4, 5, 2, 32],
  ["Mathematics", "Homework check", "HOMEWORK", 5, 5, 1, 20],
  ["Mathematics", "Functions", "TEST", 3, 5, 2, 8],
  ["Hungarian literature", "Petőfi essay", "PROJECT", 5, 5, 2, 27],
  ["Hungarian literature", "Reading aloud", "ORAL", 4, 5, 1, 12],
  ["History", "Reform era", "TEST", 3, 5, 2, 24],
  ["History", "Timeline quiz", "OTHER", 82, 100, 1, 10],
  ["English", "Unit 3 vocabulary", "TEST", 5, 5, 1, 30],
  ["English", "Speaking exam", "ORAL", 4, 5, 2, 15],
  ["Biology", "Cell structure", "TEST", 4, 5, 2, 21],
  ["Biology", "Lab report", "PROJECT", 5, 5, 1, 6],
  ["Physical education", "Swimming 100m", "OTHER", 5, 5, 1, 18],
];

for (const [subject, title, kind, value, outOf, weight, daysAgo] of marks) {
  insertGrade.run(subjectIds[subject], sonId, title, kind, value, outOf, weight, addDays(today, -daysAgo), "", parentId, 1, parentId);
}

// One mark he entered himself that still needs confirming.
db.prepare(
  `INSERT INTO grades (subject_id, child_id, title, kind, value, out_of, weight, date, note, recorded_by, confirmed)
   VALUES (?, ?, ?, 'TEST', 4, 5, 1, ?, ?, ?, 0)`,
).run(subjectIds["Mathematics"], sonId, "Surprise test", addDays(today, -1), "Got it back today", sonId);

// --- Sport -----------------------------------------------------------------

db.prepare(
  `INSERT INTO sport_profiles (child_id, sport, team, coach, level, season_start, season_end, notes)
   VALUES (?, 'Waterpolo', ?, ?, ?, ?, ?, ?)`,
).run(
  sonId,
  "Városi VSC — U16",
  "Balogh Tamás",
  "Semi-pro, U16",
  addDays(today, -60),
  addDays(today, 180),
  "Two pool sessions plus dry-land on Wednesdays. Match days are usually Saturday.",
);

// --- The weekly timetable ---------------------------------------------------

const insertSlot = db.prepare(
  `INSERT INTO schedule_slots (child_id, kind, subject_id, term_id, title, day_of_week, start_time, end_time,
                               location, note, start_date, end_date)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
);

const lessons: [number, string, string, string][] = [
  // day (1 = Monday), subject, from, to
  [1, "Mathematics", "08:00", "08:45"],
  [1, "Hungarian literature", "08:55", "09:40"],
  [1, "History", "10:00", "10:45"],
  [2, "English", "08:00", "08:45"],
  [2, "Mathematics", "08:55", "09:40"],
  [2, "Biology", "10:00", "10:45"],
  [3, "Hungarian literature", "08:00", "08:45"],
  [3, "History", "08:55", "09:40"],
  [3, "Physical education", "10:00", "10:45"],
  [4, "Mathematics", "08:00", "08:45"],
  [4, "English", "08:55", "09:40"],
  [4, "Biology", "10:00", "10:45"],
  [5, "History", "08:00", "08:45"],
  [5, "Hungarian literature", "08:55", "09:40"],
  [5, "Physical education", "10:00", "10:45"],
];

for (const [day, subject, from, to] of lessons) {
  insertSlot.run(sonId, "LESSON", subjectIds[subject], termId, subject, day, from, to, "School", termStart, termEnd);
}

const trainings: [number, string, string, string, string][] = [
  [1, "Waterpolo training", "17:00", "19:00", "Városi uszoda"],
  [2, "Dry-land conditioning", "17:30", "18:45", "Club gym"],
  [3, "Waterpolo training", "17:00", "19:00", "Városi uszoda"],
  [5, "Waterpolo training", "16:30", "18:30", "Városi uszoda"],
];

const seasonStart = addDays(today, -60);
const seasonEnd = addDays(today, 180);
for (const [day, title, from, to, place] of trainings) {
  insertSlot.run(sonId, "TRAINING", null, null, title, day, from, to, place, seasonStart, seasonEnd);
}

// A couple of dated one-offs so the week looks lived-in.
const insertEvent = db.prepare(
  `INSERT INTO schedule_events (child_id, slot_id, kind, subject_id, title, date, start_time, end_time,
                                location, note, attendance, created_by)
   VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

// Find the next Saturday for the upcoming match.
const daysUntilSaturday = (6 - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 7) % 7 || 7;
const nextSaturday = addDays(today, daysUntilSaturday);
const lastSaturday = addDays(nextSaturday, -7);

insertEvent.run(sonId, "MATCH", null, "League match vs. Eger", nextSaturday, "11:00", "12:30", "Városi uszoda", "Home fixture — be there by 10:15.", "PLANNED", parentId);
insertEvent.run(sonId, "EXAM", subjectIds["History"], "History test — the Reform era", addDays(today, 5), "08:55", "09:40", "Room 12", "Chapters 4 to 6.", "PLANNED", parentId);
insertEvent.run(sonId, "EXAM", subjectIds["Mathematics"], "Maths test — functions", addDays(today, 12), "08:00", "08:45", "Room 8", "", "PLANNED", parentId);

// Training that already happened. Occurrences are only ever generated forward
// from the moment a slot is created, so the demo's history is inserted directly.
const pastSessions: [number, string, string, string, string, string][] = [
  // days ago, title, from, to, where, attendance
  [19, "Waterpolo training", "17:00", "19:00", "Városi uszoda", "PRESENT"],
  [17, "Dry-land conditioning", "17:30", "18:45", "Club gym", "PRESENT"],
  [15, "Waterpolo training", "16:30", "18:30", "Városi uszoda", "ABSENT"],
  [12, "Waterpolo training", "17:00", "19:00", "Városi uszoda", "PRESENT"],
  [10, "Dry-land conditioning", "17:30", "18:45", "Club gym", "PRESENT"],
  [8, "Waterpolo training", "16:30", "18:30", "Városi uszoda", "EXCUSED"],
  [5, "Waterpolo training", "17:00", "19:00", "Városi uszoda", "PRESENT"],
  [3, "Dry-land conditioning", "17:30", "18:45", "Club gym", "PRESENT"],
  // The two most recent are left unrecorded, so the sport page has something to do.
  [2, "Waterpolo training", "16:30", "18:30", "Városi uszoda", "PLANNED"],
  [1, "Waterpolo training", "17:00", "19:00", "Városi uszoda", "PLANNED"],
];

const insertReport = db.prepare(
  `INSERT INTO sport_reports (event_id, opponent, score_for, score_against, outcome, goals, assists, minutes,
                              coach_rating, coach_feedback, own_note, recorded_by)
   VALUES (?, '', NULL, NULL, NULL, 0, 0, ?, ?, ?, '', ?)`,
);

const trainingFeedback = [
  "Good tempo in the sets. Legs holding up much better than last month.",
  "Lost concentration in the last twenty minutes.",
  "Best session of the week — kept his position under pressure.",
  "Solid. Work on the left-hand shot.",
];

pastSessions.forEach(([daysAgo, title, from, to, place, attendance], index) => {
  const eventId = Number(
    insertEvent.run(sonId, "TRAINING", null, title, addDays(today, -daysAgo), from, to, place, "", attendance, parentId)
      .lastInsertRowid,
  );
  if (attendance === "PRESENT" && index % 2 === 0) {
    insertReport.run(eventId, 90, 3 + (index % 3), trainingFeedback[index % trainingFeedback.length], parentId);
  }
});

// A match that already happened, written up.
const playedId = Number(
  insertEvent.run(sonId, "MATCH", null, "League match vs. Szolnok", lastSaturday, "11:00", "12:30", "Szolnok", "", "PRESENT", parentId)
    .lastInsertRowid,
);
db.prepare(
  `INSERT INTO sport_reports (event_id, opponent, score_for, score_against, outcome, goals, assists, minutes,
                              coach_rating, coach_feedback, own_note, recorded_by)
   VALUES (?, 'Szolnok', 11, 9, 'WIN', 3, 2, 24, 4, ?, ?, ?)`,
).run(
  playedId,
  "Excellent work in the centre. Needs to keep his head up on the counter-attack instead of forcing the pass.",
  "Tired in the last quarter but the third goal was a good one.",
  parentId,
);


// --- Screen and play time ---------------------------------------------------

db.prepare(
  `INSERT INTO screen_budgets (child_id, weekday_minutes, weekend_minutes, auto_approve_minutes, require_tasks_done, active)
   VALUES (?, 60, 150, 30, 1, 1)`,
).run(sonId);

const insertClaim = db.prepare(
  `INSERT INTO screen_claims (child_id, date, what, requested_minutes, granted_minutes, status, child_note,
                              parent_note, decided_at, decided_by)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
);

// A fortnight of claims: mostly waved through, one trimmed, one refused.
const claims: [number, string, number, number, string, string][] = [
  // days ago, what, asked, granted, status, parent note
  [11, "Fortnite with Máté", 60, 60, "APPROVED", ""],
  [10, "YouTube", 30, 30, "APPROVED", ""],
  [9, "Fortnite", 90, 45, "APPROVED", "Half now, the rest after the maths homework."],
  [8, "Minecraft with the cousins", 120, 120, "APPROVED", ""],
  [6, "YouTube", 30, 30, "APPROVED", ""],
  [5, "Fortnite", 60, 0, "DENIED", "Not on a night before a match."],
  [4, "Film with Mum", 100, 100, "APPROVED", ""],
  [3, "Fortnite with Máté", 45, 45, "APPROVED", ""],
  [2, "YouTube", 30, 30, "APPROVED", ""],
  [1, "Fortnite", 60, 40, "APPROVED", "Forty, then out on the bike."],
];

for (const [daysAgo, what, asked, granted, status, parentNote] of claims) {
  insertClaim.run(sonId, addDays(today, -daysAgo), what, asked, granted, status, "", parentNote, parentId);
}

// Today: some used, and one still waiting for a decision.
insertClaim.run(sonId, today, "YouTube over breakfast", 20, 20, "APPROVED", "", "", parentId);
db.prepare(
  `INSERT INTO screen_claims (child_id, date, what, requested_minutes, status, child_note)
   VALUES (?, ?, ?, ?, 'REQUESTED', ?)`,
).run(sonId, today, "Fortnite with Máté", 45, "We are in the middle of a season.");

db.prepare(
  "INSERT INTO screen_grants (child_id, date, minutes, reason, created_by) VALUES (?, ?, ?, ?, ?)",
).run(sonId, today, 30, "Helped clear out the garage", parentId);

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

// A few things left waiting for a decision, so the approvals queue has one of
// each kind to look at on a first run.
db.prepare(
  `INSERT OR IGNORE INTO task_instances (task_id, child_id, due_date, due_time, status, submitted_at, child_note)
   VALUES (?, ?, ?, '19:30', 'SUBMITTED', datetime('now'), ?)`,
).run(taskIds.dishes, sonId, today, "Loaded the dishwasher too.");

const cinema = db.prepare("SELECT id, title, cost_points, cost_money_cents FROM rewards WHERE title = 'Cinema trip'").get() as
  | { id: number; title: string; cost_points: number; cost_money_cents: number }
  | undefined;
if (cinema) {
  db.prepare(
    `INSERT INTO redemptions (reward_id, reward_title, child_id, cost_points, cost_money_cents, child_note, status)
     VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED')`,
  ).run(cinema.id, cinema.title, sonId, cinema.cost_points, cinema.cost_money_cents, "The new one is out on Friday.");
}

console.log(`Seeded ${dbPath}`);
console.log("  Dad  (parent) — PIN 1234");
console.log("  Márk (child)  — PIN 1111");
db.close();
