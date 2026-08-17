import "server-only";

import { getDb } from "./db";
import { isoDayOfWeek, type ISODate } from "./dates";
import type { ScreenBudget, ScreenClaim } from "./types";

/** Saturday and Sunday get the weekend allowance. */
export function isWeekend(date: ISODate): boolean {
  return isoDayOfWeek(date) >= 6;
}

export const DEFAULT_BUDGET: Omit<ScreenBudget, "child_id"> = {
  weekday_minutes: 60,
  weekend_minutes: 120,
  auto_approve_minutes: 0,
  require_tasks_done: 0,
  active: 1,
};

export function getBudget(childId: number): ScreenBudget {
  const row = getDb().prepare("SELECT * FROM screen_budgets WHERE child_id = ?").get(childId) as
    | ScreenBudget
    | undefined;
  return row ?? { child_id: childId, ...DEFAULT_BUDGET };
}

export type ScreenDay = {
  date: ISODate;
  /** The standing allowance for this kind of day. */
  base: number;
  /** Signed total of one-off grants and dockings for this date. */
  adjustments: number;
  /** base + adjustments, never below zero. */
  allowance: number;
  /** Minutes already handed over by approved claims. */
  used: number;
  /** Minutes sitting in claims that have not been decided yet. */
  awaiting: number;
  /** allowance − used, never below zero. */
  remaining: number;
  active: boolean;
};

/** The whole picture for one child on one day. */
export function screenDay(childId: number, date: ISODate): ScreenDay {
  const db = getDb();
  const budget = getBudget(childId);
  const base = isWeekend(date) ? budget.weekend_minutes : budget.weekday_minutes;

  const adjustments = (
    db
      .prepare("SELECT COALESCE(SUM(minutes), 0) AS total FROM screen_grants WHERE child_id = ? AND date = ?")
      .get(childId, date) as { total: number }
  ).total;

  const claims = db
    .prepare(
      `SELECT status, COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN granted_minutes ELSE requested_minutes END), 0) AS total
         FROM screen_claims
        WHERE child_id = ? AND date = ? AND status IN ('APPROVED', 'REQUESTED')
        GROUP BY status`,
    )
    .all(childId, date) as { status: string; total: number }[];

  const used = claims.find((row) => row.status === "APPROVED")?.total ?? 0;
  const awaiting = claims.find((row) => row.status === "REQUESTED")?.total ?? 0;
  const allowance = Math.max(0, base + adjustments);

  return {
    date,
    base,
    adjustments,
    allowance,
    used,
    awaiting,
    remaining: Math.max(0, allowance - used),
    active: budget.active === 1,
  };
}

/** Today's tasks, for the "tasks before screens" rule. */
export function tasksOutstanding(childId: number, date: ISODate): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM task_instances
        WHERE child_id = ? AND due_date = ? AND status IN ('PENDING', 'SUBMITTED', 'REJECTED', 'MISSED')`,
    )
    .get(childId, date) as { n: number };
  return row.n;
}

export function claimsForDay(childId: number, date: ISODate): ScreenClaim[] {
  return getDb()
    .prepare("SELECT * FROM screen_claims WHERE child_id = ? AND date = ? ORDER BY id DESC")
    .all(childId, date) as ScreenClaim[];
}

export type PendingClaim = ScreenClaim & { child_name: string; child_emoji: string };

export function pendingClaims(childId?: number): PendingClaim[] {
  const params: unknown[] = [];
  let where = "c.status = 'REQUESTED'";
  if (childId) {
    where += " AND c.child_id = ?";
    params.push(childId);
  }
  return getDb()
    .prepare(
      `SELECT c.*, u.name AS child_name, u.emoji AS child_emoji
         FROM screen_claims c JOIN users u ON u.id = c.child_id
        WHERE ${where} ORDER BY c.id`,
    )
    .all(...params) as PendingClaim[];
}

export function recentClaims(childId: number, limit = 20): ScreenClaim[] {
  return getDb()
    .prepare("SELECT * FROM screen_claims WHERE child_id = ? ORDER BY date DESC, id DESC LIMIT ?")
    .all(childId, limit) as ScreenClaim[];
}

export type GrantRow = {
  id: number;
  date: string;
  minutes: number;
  reason: string;
  source: string;
  created_at: string;
};

export function recentGrants(childId: number, limit = 10): GrantRow[] {
  return getDb()
    .prepare("SELECT id, date, minutes, reason, source, created_at FROM screen_grants WHERE child_id = ? ORDER BY id DESC LIMIT ?")
    .all(childId, limit) as GrantRow[];
}

/** Minutes actually used per day over the last `days` days, for the little chart. */
export function usageTrend(childId: number, todayDate: ISODate, days = 14): { date: ISODate; minutes: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT date, COALESCE(SUM(granted_minutes), 0) AS total
         FROM screen_claims
        WHERE child_id = ? AND status = 'APPROVED' AND date > date(?, '-' || ? || ' days') AND date <= ?
        GROUP BY date`,
    )
    .all(childId, todayDate, days, todayDate) as { date: string; total: number }[];

  const byDay = new Map(rows.map((row) => [row.date, row.total]));
  const out: { date: ISODate; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shift(todayDate, -i);
    out.push({ date, minutes: byDay.get(date) ?? 0 });
  }
  return out;
}

function shift(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "1h 30m", "45m", "none". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const abs = Math.abs(Math.round(minutes));
  if (abs === 0) return "none";
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  if (hours === 0) return `${sign}${rest}m`;
  if (rest === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${rest}m`;
}

/**
 * Grants the extra minutes a reward carries. Lives here rather than in the
 * actions module because that one may only export async server actions.
 */
export function grantRewardScreenTime(args: {
  childId: number;
  minutes: number;
  rewardTitle: string;
  redemptionId: number;
  date: ISODate;
  createdBy: number;
}): void {
  if (args.minutes <= 0) return;
  getDb()
    .prepare(
      `INSERT INTO screen_grants (child_id, date, minutes, reason, source, source_id, created_by)
       VALUES (?, ?, ?, ?, 'REWARD', ?, ?)`,
    )
    .run(args.childId, args.date, args.minutes, `Reward: ${args.rewardTitle}`, args.redemptionId, args.createdBy);
}
