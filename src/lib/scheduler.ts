import "server-only";

import { getDb, getSettings, transaction } from "./db";
import {
  addDays,
  addMonths,
  isoDayOfWeek,
  isoWeekKey,
  monthKey,
  nowIn,
  startOfMonth,
  startOfWeek,
  type ISODate,
} from "./dates";
import { post, pointsEarnedBetween } from "./ledger";
import type { Allowance, Task } from "./types";

/** How far ahead occurrences of recurring tasks are created. */
const HORIZON_DAYS = 14;
/** How far back occurrences may be back-filled (never before the task was created). */
const BACKFILL_DAYS = 7;

function occursOn(task: Task, date: ISODate): boolean {
  if (date < task.start_date) return false;
  if (task.end_date && date > task.end_date) return false;

  switch (task.recurrence) {
    case "ONCE":
      return date === task.start_date;
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return isoDayOfWeek(date) <= 5;
    case "WEEKLY":
    case "CUSTOM":
      return (task.days_mask & (1 << (isoDayOfWeek(date) - 1))) !== 0;
    default:
      return false;
  }
}

/**
 * Creates the concrete occurrences of every active task inside the scheduling
 * window. Occurrences are never created for dates before the task existed, so
 * adding a task with an old start date cannot generate retroactive misses.
 */
export function materializeTasks(todayDate: ISODate): number {
  const db = getDb();
  const tasks = db.prepare("SELECT * FROM tasks WHERE active = 1").all() as Task[];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO task_instances (task_id, child_id, due_date, due_time)
     VALUES (?, ?, ?, ?)`,
  );

  let created = 0;
  for (const task of tasks) {
    const createdOn = task.created_at.slice(0, 10);
    const earliest = [task.start_date, createdOn, addDays(todayDate, -BACKFILL_DAYS)].sort().at(-1)!;
    const latest = addDays(todayDate, HORIZON_DAYS);

    if (task.recurrence === "ONCE") {
      // A one-off keeps its exact date even if it was scheduled in the past.
      created += insert.run(task.id, task.child_id, task.start_date, task.due_time).changes;
      continue;
    }

    for (let date = earliest; date <= latest; date = addDays(date, 1)) {
      if (occursOn(task, date)) {
        created += insert.run(task.id, task.child_id, date, task.due_time).changes;
      }
    }
  }
  return created;
}

/** Flags overdue, still-untouched occurrences as missed and charges any penalty. */
export function markMissedTasks(todayDate: ISODate, nowTime: string): number {
  const db = getDb();
  const overdue = db
    .prepare(
      `SELECT i.id, i.child_id, i.due_date, t.title, t.penalty_points
         FROM task_instances i
         JOIN tasks t ON t.id = i.task_id
        WHERE i.status = 'PENDING'
          AND (i.due_date < ? OR (i.due_date = ? AND i.due_time < ?))`,
    )
    .all(todayDate, todayDate, nowTime) as {
    id: number;
    child_id: number;
    due_date: string;
    title: string;
    penalty_points: number;
  }[];

  const markOne = db.prepare("UPDATE task_instances SET status = 'MISSED' WHERE id = ? AND status = 'PENDING'");

  for (const row of overdue) {
    if (markOne.run(row.id).changes === 0) continue;
    if (row.penalty_points > 0) {
      post({
        childId: row.child_id,
        currency: "POINTS",
        amount: -row.penalty_points,
        reason: `Missed: ${row.title} (${row.due_date})`,
        source: "TASK_MISSED",
        sourceId: row.id,
      });
    }
  }
  return overdue.length;
}

type PaydayInfo = { periodKey: string; paydayDate: ISODate; assessFrom: ISODate };

function currentPayday(allowance: Allowance, todayDate: ISODate): PaydayInfo {
  if (allowance.cadence === "WEEKLY") {
    const payday = Math.min(7, Math.max(1, allowance.payday));
    const paydayDate = addDays(startOfWeek(todayDate), payday - 1);
    return { periodKey: isoWeekKey(todayDate), paydayDate, assessFrom: addDays(paydayDate, -7) };
  }

  const dayOfMonth = Math.min(28, Math.max(1, allowance.payday));
  const paydayDate = addDays(startOfMonth(todayDate), dayOfMonth - 1);
  return { periodKey: monthKey(todayDate), paydayDate, assessFrom: addMonths(paydayDate, -1) };
}

export type AllowancePayment = {
  childId: number;
  periodKey: string;
  baseCents: number;
  bonusCents: number;
  pointsInPeriod: number;
  withheld: boolean;
};

/**
 * Pays every allowance whose payday has arrived in the current period. Only the
 * current period is ever paid, so a server that was offline for a while does not
 * release a burst of back-payments.
 */
export function payAllowances(todayDate: ISODate): AllowancePayment[] {
  const db = getDb();
  const allowances = db.prepare("SELECT * FROM allowances WHERE active = 1").all() as Allowance[];
  const markPaid = db.prepare("UPDATE allowances SET last_paid_period = ? WHERE child_id = ? AND active = 1");
  const payments: AllowancePayment[] = [];

  for (const allowance of allowances) {
    const { periodKey, paydayDate, assessFrom } = currentPayday(allowance, todayDate);
    if (todayDate < paydayDate) continue;
    if (allowance.last_paid_period === periodKey) continue;

    const pointsInPeriod = pointsEarnedBetween(allowance.child_id, assessFrom, addDays(paydayDate, 1));
    const meetsBar = pointsInPeriod >= allowance.min_points;
    const baseCents = meetsBar ? allowance.base_cents : 0;
    const bonusCents = allowance.bonus_per_point_cents * Math.max(0, pointsInPeriod);
    const label = allowance.cadence === "WEEKLY" ? "Weekly" : "Monthly";

    // Mark the period as paid inside the same transaction as the payout so a
    // crash can never double-pay.
    transaction(() => {
      if (baseCents > 0) {
        post({
          childId: allowance.child_id,
          currency: "MONEY",
          amount: baseCents,
          reason: `${label} pocket money (${periodKey})`,
          source: "ALLOWANCE",
        });
      }
      if (bonusCents > 0) {
        post({
          childId: allowance.child_id,
          currency: "MONEY",
          amount: bonusCents,
          reason: `Performance bonus: ${pointsInPeriod} points (${periodKey})`,
          source: "ALLOWANCE",
        });
      }
      markPaid.run(periodKey, allowance.child_id);
    });

    payments.push({
      childId: allowance.child_id,
      periodKey,
      baseCents,
      bonusCents,
      pointsInPeriod,
      withheld: !meetsBar && allowance.base_cents > 0,
    });
  }

  return payments;
}

let lastRunAt = 0;
const THROTTLE_MS = 20_000;

/**
 * Brings the database up to date: creates upcoming task occurrences, closes
 * overdue ones and releases pocket money. Safe (and cheap) to call on every
 * page render; it self-throttles.
 */
export function runMaintenance(options: { force?: boolean } = {}): void {
  if (!options.force && Date.now() - lastRunAt < THROTTLE_MS) return;
  lastRunAt = Date.now();

  const { timezone } = getSettings();
  const { date, time } = nowIn(timezone);

  materializeTasks(date);
  markMissedTasks(date, time);
  payAllowances(date);
}
