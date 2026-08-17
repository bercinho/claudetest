-- Family HQ schema.
-- Money is always stored as integer minor units (cents/fillér). Points are integers.
-- Every balance is derived from the `ledger` table so history is fully auditable.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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
                ('TASK', 'TASK_MISSED', 'POLICY', 'REWARD', 'REQUEST', 'ALLOWANCE', 'GOAL', 'MANUAL')),
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
