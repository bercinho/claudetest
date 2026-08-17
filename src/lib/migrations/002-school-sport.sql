-- Migration 002: school, sport and the weekly schedule.
--
-- Adds the new tables and widens the ledger's `source` check so grades and
-- sport can post points. SQLite cannot alter a CHECK constraint in place, so
-- the ledger is rebuilt; the runner disables foreign keys around this file and
-- verifies integrity afterwards.

CREATE TABLE ledger_new (
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

INSERT INTO ledger_new (id, child_id, currency, amount, reason, source, source_id, created_by, created_at)
  SELECT id, child_id, currency, amount, reason, source, source_id, created_by, created_at FROM ledger;

DROP TABLE ledger;
ALTER TABLE ledger_new RENAME TO ledger;

CREATE INDEX IF NOT EXISTS idx_ledger_child ON ledger(child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_currency ON ledger(child_id, currency);

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
