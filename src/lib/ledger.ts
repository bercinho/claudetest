import "server-only";

import { getDb } from "./db";
import type { Balances, Currency, LedgerEntry, LedgerSource } from "./types";

export type PostEntry = {
  childId: number;
  currency: Currency;
  amount: number; // signed; minor units for MONEY
  reason: string;
  source: LedgerSource;
  sourceId?: number | null;
  createdBy?: number | null;
};

/** Appends one ledger entry. Zero-amount entries are skipped so history stays readable. */
export function post(entry: PostEntry): void {
  if (entry.amount === 0) return;
  getDb()
    .prepare(
      `INSERT INTO ledger (child_id, currency, amount, reason, source, source_id, created_by)
       VALUES (@childId, @currency, @amount, @reason, @source, @sourceId, @createdBy)`,
    )
    .run({
      childId: entry.childId,
      currency: entry.currency,
      amount: entry.amount,
      reason: entry.reason,
      source: entry.source,
      sourceId: entry.sourceId ?? null,
      createdBy: entry.createdBy ?? null,
    });
}

/** Posts a points and/or money entry in one go, sharing a reason and source. */
export function postBoth(args: {
  childId: number;
  points: number;
  moneyCents: number;
  reason: string;
  source: LedgerSource;
  sourceId?: number | null;
  createdBy?: number | null;
}): void {
  post({ ...args, currency: "POINTS", amount: args.points });
  post({ ...args, currency: "MONEY", amount: args.moneyCents });
}

/**
 * Gives back points that were docked when an occurrence was marked missed, for
 * when it is completed late and approved anyway.
 */
export function reverseMissPenalty(args: {
  instanceId: number;
  childId: number;
  title: string;
  createdBy?: number | null;
}): void {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger WHERE source = 'TASK_MISSED' AND source_id = ?")
    .get(args.instanceId) as { total: number };

  if (row.total >= 0) return;
  post({
    childId: args.childId,
    currency: "POINTS",
    amount: -row.total,
    reason: `Late but done — penalty reversed: ${args.title}`,
    source: "TASK",
    sourceId: args.instanceId,
    createdBy: args.createdBy ?? null,
  });
}

export function balances(childId: number): Balances {
  const rows = getDb()
    .prepare("SELECT currency, COALESCE(SUM(amount), 0) AS total FROM ledger WHERE child_id = ? GROUP BY currency")
    .all(childId) as { currency: Currency; total: number }[];

  const points = rows.find((r) => r.currency === "POINTS")?.total ?? 0;
  const money = rows.find((r) => r.currency === "MONEY")?.total ?? 0;
  return { points, money_cents: money };
}

/**
 * Money currently locked into active savings goals. Spendable money is the
 * money balance minus this, because goal deposits stay on the books.
 */
export function savedInGoals(childId: number): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(saved_cents), 0) AS total FROM goals WHERE child_id = ? AND status = 'ACTIVE'")
    .get(childId) as { total: number };
  return row.total;
}

export type Wallet = Balances & { spendable_cents: number; saved_cents: number };

export function wallet(childId: number): Wallet {
  const base = balances(childId);
  const saved = savedInGoals(childId);
  return { ...base, saved_cents: saved, spendable_cents: base.money_cents - saved };
}

/** Points earned (positive entries only) between two dates, inclusive of `from`, exclusive of `to`. */
export function pointsEarnedBetween(childId: number, fromDate: string, toDate: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM ledger
        WHERE child_id = ? AND currency = 'POINTS' AND amount > 0
          AND date(created_at) >= date(?) AND date(created_at) < date(?)`,
    )
    .get(childId, fromDate, toDate) as { total: number };
  return row.total;
}

export function pointsSince(childId: number, fromDate: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM ledger
        WHERE child_id = ? AND currency = 'POINTS' AND date(created_at) >= date(?)`,
    )
    .get(childId, fromDate) as { total: number };
  return row.total;
}

export function recentEntries(childId: number | null, limit = 50): (LedgerEntry & { child_name: string })[] {
  const db = getDb();
  const sql = `SELECT l.*, u.name AS child_name
                 FROM ledger l
                 JOIN users u ON u.id = l.child_id
                ${childId === null ? "" : "WHERE l.child_id = ?"}
                ORDER BY l.id DESC
                LIMIT ?`;
  return (
    childId === null ? db.prepare(sql).all(limit) : db.prepare(sql).all(childId, limit)
  ) as (LedgerEntry & { child_name: string })[];
}
