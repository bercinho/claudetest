-- Migration 003: screen and play time.
--
-- All additive: three new tables, plus one column on rewards so a reward can
-- hand over extra minutes when it is redeemed.

ALTER TABLE rewards ADD COLUMN screen_minutes INTEGER NOT NULL DEFAULT 0;

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
