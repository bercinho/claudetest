-- Migration 004: push notifications and companion devices. All additive.

-- ---------------------------------------------------------------------------
-- Push notifications. One row per browser/device that has granted permission;
-- a person with no rows simply gets no notifications.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT    NOT NULL UNIQUE,
  p256dh       TEXT    NOT NULL,
  auth         TEXT    NOT NULL,
  label        TEXT    NOT NULL DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT,
  failures     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ---------------------------------------------------------------------------
-- Companion devices. A phone running the usage-reporting companion holds a
-- bearer token and posts what the device actually recorded, so claimed screen
-- time can be compared with real use. The token is stored hashed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  token_hash   TEXT    NOT NULL UNIQUE,
  active       INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_child ON devices(child_id, active);

CREATE TABLE IF NOT EXISTS device_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  date        TEXT    NOT NULL,           -- YYYY-MM-DD, the device's local day
  minutes     INTEGER NOT NULL,           -- foreground screen time the device recorded
  apps        TEXT    NOT NULL DEFAULT '', -- optional JSON breakdown, biggest first
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (device_id, date)
);

CREATE INDEX IF NOT EXISTS idx_device_usage ON device_usage(child_id, date);
