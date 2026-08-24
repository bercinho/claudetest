import "server-only";

import { getDb } from "./db";
import { hashToken } from "./push";
import type { ISODate } from "./dates";

/**
 * Companion devices. A phone running the usage-reporting companion holds a
 * bearer token and posts what Android actually recorded, so a claim can be
 * compared with real use. Tokens are only ever stored hashed.
 */

export type Device = {
  id: number;
  child_id: number;
  name: string;
  active: number;
  created_at: string;
  last_seen_at: string | null;
};

export type DeviceWithChild = Device & { child_name: string; child_emoji: string };

export function listDevices(childId?: number): DeviceWithChild[] {
  const params: unknown[] = [];
  let where = "";
  if (childId) {
    where = "WHERE d.child_id = ?";
    params.push(childId);
  }
  return getDb()
    .prepare(
      `SELECT d.id, d.child_id, d.name, d.active, d.created_at, d.last_seen_at,
              u.name AS child_name, u.emoji AS child_emoji
         FROM devices d JOIN users u ON u.id = d.child_id
         ${where} ORDER BY d.active DESC, d.name`,
    )
    .all(...params) as DeviceWithChild[];
}

export function createDevice(args: { childId: number; name: string; tokenHash: string; createdBy: number }): number {
  const info = getDb()
    .prepare("INSERT INTO devices (child_id, name, token_hash, created_by) VALUES (?, ?, ?, ?)")
    .run(args.childId, args.name, args.tokenHash, args.createdBy);
  return Number(info.lastInsertRowid);
}

export function setDeviceActive(id: number, active: boolean): void {
  getDb().prepare("UPDATE devices SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
}

export function deleteDevice(id: number): void {
  getDb().prepare("DELETE FROM devices WHERE id = ?").run(id);
}

/** Resolves a bearer token to its device, or null. Also stamps last seen. */
export function deviceFromToken(token: string): Device | null {
  const device = getDb()
    .prepare(
      `SELECT id, child_id, name, active, created_at, last_seen_at
         FROM devices WHERE token_hash = ? AND active = 1`,
    )
    .get(hashToken(token)) as Device | undefined;
  if (!device) return null;

  getDb().prepare("UPDATE devices SET last_seen_at = datetime('now') WHERE id = ?").run(device.id);
  return device;
}

export function recordUsage(args: {
  childId: number;
  deviceId: number;
  date: ISODate;
  minutes: number;
  apps: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO device_usage (child_id, device_id, date, minutes, apps)
       VALUES (@childId, @deviceId, @date, @minutes, @apps)
       ON CONFLICT(device_id, date) DO UPDATE SET
         minutes = excluded.minutes,
         apps = excluded.apps,
         recorded_at = datetime('now')`,
    )
    .run(args);
}

export type RecordedUsage = { date: string; minutes: number; apps: string };

/** Total minutes every companion recorded for a child on one day. */
export function recordedMinutes(childId: number, date: ISODate): number | null {
  const row = getDb()
    .prepare("SELECT SUM(minutes) AS total, COUNT(*) AS n FROM device_usage WHERE child_id = ? AND date = ?")
    .get(childId, date) as { total: number | null; n: number };
  return row.n === 0 ? null : (row.total ?? 0);
}

export function recordedRange(childId: number, from: ISODate, to: ISODate): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT date, SUM(minutes) AS total FROM device_usage
        WHERE child_id = ? AND date >= ? AND date <= ? GROUP BY date`,
    )
    .all(childId, from, to) as { date: string; total: number }[];
  return new Map(rows.map((row) => [row.date, row.total]));
}

/** The biggest apps on a day, for the "where did it go" line. */
export function topApps(childId: number, date: ISODate, limit = 4): { name: string; minutes: number }[] {
  const rows = getDb()
    .prepare("SELECT apps FROM device_usage WHERE child_id = ? AND date = ? AND apps != ''")
    .all(childId, date) as { apps: string }[];

  const totals = new Map<string, number>();
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.apps);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed) {
      const name = typeof entry?.name === "string" ? entry.name.slice(0, 60) : null;
      const minutes = Number(entry?.minutes);
      if (!name || !Number.isFinite(minutes) || minutes <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + Math.round(minutes));
    }
  }

  return [...totals.entries()]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}
