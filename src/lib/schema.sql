-- Family HQ schema.
-- Money is always stored as integer minor units (cents/fillér). Points are integers.
-- Every balance is derived from the `ledger` table so history is fully auditable.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- The schema version. Bump this together with a new file in migrations/ so an
-- existing database can be brought up to this shape. `db.ts` checks the two
-- agree, and refuses to start if they drift apart.
PRAGMA user_version = 3;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  role       TEXT    NOT NULL CHECK (role IN ('PARENT', 'CHILD')),
  pin_hash   TEXT    NOT NULL,
  emoji      TEXT    NOT NULL DEFAULT '🙂',
  color      TEXT    NOT NULL DEFAULT 'sky',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Tasks: `tasks` holds the definition (possibly recurring), `task_instances`
-- holds one concrete, dated occurrence that can be submitted and reviewed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tasks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT    NOT NULL,
  details        TEXT    NOT NULL DEFAULT '',
  child_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points         INTEGER NOT NULL DEFAULT 0,
  money_cents    INTEGER NOT NULL DEFAULT 0,
  penalty_points INTEGER NOT NULL DEFAULT 0, -- charged when an occurrence is missed
  recurrence     TEXT    NOT NULL CHECK (recurrence IN ('ONCE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM')),
  days_mask      INTEGER NOT NULL DEFAULT 0, -- bit 0 = Monday … bit 6 = Sunday
  due_time       TEXT    NOT NULL DEFAULT '20:00',
  start_date     TEXT    NOT NULL,           -- YYYY-MM-DD
  end_date       TEXT,                       -- YYYY-MM-DD, NULL = open ended
  auto_approve   INTEGER NOT NULL DEFAULT 0, -- pay out on submit, no parent review
  active         INTEGER NOT NULL DEFAULT 1,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_child ON tasks(child_id, active);

CREATE TABLE IF NOT EXISTS task_instances (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  child_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_date            TEXT    NOT NULL,      -- YYYY-MM-DD
  due_time            TEXT    NOT NULL,      -- HH:MM
  status              TEXT    NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'MISSED', 'SKIPPED')),
  child_note          TEXT    NOT NULL DEFAULT '',
  parent_note         TEXT    NOT NULL DEFAULT '',
  submitted_at        TEXT,
  reviewed_at         TEXT,
  reviewed_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  points_awarded      INTEGER NOT NULL DEFAULT 0,
  money_awarded_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (task_id, due_date)
);

CREATE INDEX IF NOT EXISTS idx_instances_child_date ON task_instances(child_id, due_date);
CREATE INDEX IF NOT EXISTS idx_instances_status ON task_instances(status);

-- ---------------------------------------------------------------------------
-- Policies: standing house rules with a fixed reward or penalty, applied with
-- one tap by a parent. Every application is recorded.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS policies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  details     TEXT    NOT NULL DEFAULT '',
  kind        TEXT    NOT NULL CHECK (kind IN ('REWARD', 'PENALTY')),
  points      INTEGER NOT NULL DEFAULT 0, -- magnitude, never negative
  money_cents INTEGER NOT NULL DEFAULT 0, -- magnitude, never negative
  child_id    INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = every child
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS policy_applications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id         INTEGER REFERENCES policies(id) ON DELETE SET NULL,
  policy_title      TEXT    NOT NULL, -- snapshot, survives policy deletion
  child_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  applied_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  note              TEXT    NOT NULL DEFAULT '',
  points_delta      INTEGER NOT NULL DEFAULT 0,
  money_delta_cents INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_apps_child ON policy_applications(child_id, created_at);

-- ---------------------------------------------------------------------------
-- Rewards shop
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rewards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  details          TEXT    NOT NULL DEFAULT '',
  cost_points      INTEGER NOT NULL DEFAULT 0,
  cost_money_cents INTEGER NOT NULL DEFAULT 0,
  child_id         INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = every child
  stock            INTEGER,                                        -- NULL = unlimited
  screen_minutes   INTEGER NOT NULL DEFAULT 0, -- extra screen time granted when redeemed
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redemptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id        INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
  reward_title     TEXT    NOT NULL, -- snapshot
  child_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT    NOT NULL DEFAULT 'REQUESTED'
                     CHECK (status IN ('REQUESTED', 'APPROVED', 'DENIED', 'CANCELLED')),
  cost_points      INTEGER NOT NULL DEFAULT 0,
  cost_money_cents INTEGER NOT NULL DEFAULT 0,
  child_note       TEXT    NOT NULL DEFAULT '',
  parent_note      TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  decided_at       TEXT,
  decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status, created_at);

-- ---------------------------------------------------------------------------
-- Free-form requests from child to parent
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL CHECK (kind IN ('MONEY', 'PERMISSION', 'PURCHASE', 'SCREEN_TIME', 'OTHER')),
  title        TEXT    NOT NULL,
  details      TEXT    NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0, -- paid out on approval when kind = MONEY
  status       TEXT    NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN', 'APPROVED', 'DENIED', 'WITHDRAWN')),
  parent_note  TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT,
  decided_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at);

-- ---------------------------------------------------------------------------
-- Ledger: the single source of truth for both balances.
-- `amount` is signed; for MONEY it is minor units.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency   TEXT    NOT NULL CHECK (currency IN ('POINTS', 'MONEY')),
  amount     INTEGER NOT NULL,
  reason     TEXT    NOT NULL,
  source     TEXT    NOT NULL CHECK (source IN
                ('TASK', 'TASK_MISSED', 'POLICY', 'REWARD', 'REQUEST', 'ALLOWANCE', 'GOAL', 'MANUAL',
                 'GRADE', 'SPORT')),
  source_id  INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ledger_child ON ledger(child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_currency ON ledger(child_id, currency);

-- ---------------------------------------------------------------------------
-- Pocket money: a recurring allowance plus optional performance bonus.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS allowances (
  child_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_cents            INTEGER NOT NULL DEFAULT 0,
  cadence               TEXT    NOT NULL DEFAULT 'WEEKLY' CHECK (cadence IN ('WEEKLY', 'MONTHLY')),
  payday                INTEGER NOT NULL DEFAULT 1, -- weekly: 1 (Mon) … 7 (Sun); monthly: 1 … 28
  bonus_per_point_cents INTEGER NOT NULL DEFAULT 0, -- extra per point earned in the period
  min_points            INTEGER NOT NULL DEFAULT 0, -- base is withheld below this many points
  active                INTEGER NOT NULL DEFAULT 1,
  last_paid_period      TEXT                        -- '2026-W33' or '2026-08'
);

-- ---------------------------------------------------------------------------
-- Savings goals: money moved into a goal leaves the spendable balance.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  target_cents INTEGER NOT NULL,
  saved_cents  INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REACHED', 'CLOSED')),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_child ON goals(child_id, status);

-- ---------------------------------------------------------------------------
-- School: a term holds the subjects taken in it, and every mark sits on a
-- subject. A mark stores both `value` and `out_of`, so a 4/5 and an 87/100 fit
-- the same two columns and averages can compare them.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS terms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id    INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  child_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  teacher    TEXT    NOT NULL DEFAULT '',
  emoji      TEXT    NOT NULL DEFAULT '📘',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subjects_term ON subjects(term_id, child_id, active);

CREATE TABLE IF NOT EXISTS grades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  child_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL DEFAULT '',
  kind         TEXT    NOT NULL DEFAULT 'TEST'
                 CHECK (kind IN ('TEST', 'ORAL', 'HOMEWORK', 'PROJECT', 'EXAM', 'OTHER')),
  value        REAL    NOT NULL,
  out_of       REAL    NOT NULL,
  weight       INTEGER NOT NULL DEFAULT 1, -- counts this many times in the average
  date         TEXT    NOT NULL,           -- YYYY-MM-DD
  note         TEXT    NOT NULL DEFAULT '',
  recorded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- A mark entered by a child waits for a parent to confirm it before it counts.
  confirmed    INTEGER NOT NULL DEFAULT 0,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_grades_subject ON grades(subject_id, date);
CREATE INDEX IF NOT EXISTS idx_grades_pending ON grades(confirmed, child_id);

-- ---------------------------------------------------------------------------
-- Sport: one profile per child, then the same schedule tables as school use.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sport_profiles (
  child_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sport        TEXT    NOT NULL DEFAULT '',
  team         TEXT    NOT NULL DEFAULT '',
  coach        TEXT    NOT NULL DEFAULT '',
  level        TEXT    NOT NULL DEFAULT '',
  season_start TEXT,
  season_end   TEXT,
  notes        TEXT    NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- The week: `schedule_slots` are the things that repeat every week (lessons,
-- regular training). `schedule_events` are the dated occurrences — generated
-- from the slots, or added directly for exams, matches and one-offs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schedule_slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('LESSON', 'TRAINING', 'OTHER')),
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  term_id     INTEGER REFERENCES terms(id) ON DELETE SET NULL,
  title       TEXT    NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1 = Monday
  start_time  TEXT    NOT NULL,
  end_time    TEXT    NOT NULL,
  location    TEXT    NOT NULL DEFAULT '',
  note        TEXT    NOT NULL DEFAULT '',
  start_date  TEXT    NOT NULL,
  end_date    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slots_child ON schedule_slots(child_id, active, day_of_week);

CREATE TABLE IF NOT EXISTS schedule_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id    INTEGER REFERENCES schedule_slots(id) ON DELETE CASCADE, -- NULL = a one-off
  kind       TEXT    NOT NULL
               CHECK (kind IN ('LESSON', 'TRAINING', 'EXAM', 'MATCH', 'TOURNAMENT', 'OTHER')),
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  title      TEXT    NOT NULL,
  date       TEXT    NOT NULL,           -- YYYY-MM-DD
  start_time TEXT    NOT NULL,
  end_time   TEXT    NOT NULL,
  location   TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  attendance TEXT    NOT NULL DEFAULT 'PLANNED'
               CHECK (attendance IN ('PLANNED', 'PRESENT', 'ABSENT', 'EXCUSED', 'CANCELLED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  -- Generated occurrences are unique per slot and day. One-offs have a NULL
  -- slot_id, and SQLite treats NULLs as distinct, so they never collide.
  UNIQUE (slot_id, date)
);

CREATE INDEX IF NOT EXISTS idx_events_child_date ON schedule_events(child_id, date);
CREATE INDEX IF NOT EXISTS idx_events_kind ON schedule_events(kind, date);

-- How a training session or a match actually went. One report per event.
CREATE TABLE IF NOT EXISTS sport_reports (
  event_id       INTEGER PRIMARY KEY REFERENCES schedule_events(id) ON DELETE CASCADE,
  opponent       TEXT    NOT NULL DEFAULT '',
  score_for      INTEGER,
  score_against  INTEGER,
  outcome        TEXT CHECK (outcome IN ('WIN', 'DRAW', 'LOSS')),
  goals          INTEGER NOT NULL DEFAULT 0,
  assists        INTEGER NOT NULL DEFAULT 0,
  minutes        INTEGER NOT NULL DEFAULT 0,
  coach_rating   INTEGER CHECK (coach_rating BETWEEN 1 AND 5),
  coach_feedback TEXT    NOT NULL DEFAULT '',
  own_note       TEXT    NOT NULL DEFAULT '',
  recorded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Screen and play time. Each day has an allowance that depends on whether it
-- is a school day or the weekend, adjusted by anything granted or docked for
-- that specific date. The child claims against it; approved claims are what
-- actually spend the day's minutes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS screen_budgets (
  child_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekday_minutes      INTEGER NOT NULL DEFAULT 60,  -- Monday to Friday
  weekend_minutes      INTEGER NOT NULL DEFAULT 120, -- Saturday and Sunday
  auto_approve_minutes INTEGER NOT NULL DEFAULT 0,   -- claims this size need no asking
  require_tasks_done   INTEGER NOT NULL DEFAULT 0,   -- today's tasks first, then screens
  active               INTEGER NOT NULL DEFAULT 1
);

-- One-off changes to a single day's allowance: a treat, or time docked.
CREATE TABLE IF NOT EXISTS screen_grants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,  -- YYYY-MM-DD
  minutes    INTEGER NOT NULL,  -- signed: positive adds, negative takes away
  reason     TEXT    NOT NULL DEFAULT '',
  source     TEXT    NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'REWARD')),
  source_id  INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_screen_grants ON screen_grants(child_id, date);

CREATE TABLE IF NOT EXISTS screen_claims (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date              TEXT    NOT NULL,
  what              TEXT    NOT NULL DEFAULT '', -- "Fortnite with Máté"
  requested_minutes INTEGER NOT NULL,
  granted_minutes   INTEGER NOT NULL DEFAULT 0,  -- a parent may grant less than asked
  status            TEXT    NOT NULL DEFAULT 'REQUESTED'
                      CHECK (status IN ('REQUESTED', 'APPROVED', 'DENIED', 'CANCELLED')),
  child_note        TEXT    NOT NULL DEFAULT '',
  parent_note       TEXT    NOT NULL DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  decided_at        TEXT,
  decided_by        INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_screen_claims_day ON screen_claims(child_id, date);
CREATE INDEX IF NOT EXISTS idx_screen_claims_status ON screen_claims(status, created_at);
