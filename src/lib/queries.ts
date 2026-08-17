import "server-only";

import { getDb } from "./db";
import { wallet, type Wallet } from "./ledger";
import { addDays, startOfWeek, type ISODate } from "./dates";
import type {
  Allowance,
  FamilyRequest,
  Goal,
  Policy,
  Redemption,
  Reward,
  Task,
  TaskInstanceView,
  User,
} from "./types";

const INSTANCE_COLUMNS = `i.*, t.title, t.details, t.points, t.money_cents, t.penalty_points, t.auto_approve,
                          u.name AS child_name, u.emoji AS child_emoji`;

const INSTANCE_JOINS = `FROM task_instances i
                        JOIN tasks t ON t.id = i.task_id
                        JOIN users u ON u.id = i.child_id`;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function listUsers(): User[] {
  return getDb()
    .prepare("SELECT id, name, role, emoji, color, active FROM users WHERE active = 1 ORDER BY role DESC, name")
    .all() as User[];
}

export function listChildren(): User[] {
  return getDb()
    .prepare("SELECT id, name, role, emoji, color, active FROM users WHERE role = 'CHILD' AND active = 1 ORDER BY name")
    .all() as User[];
}

export function getUser(id: number): User | null {
  return (getDb()
    .prepare("SELECT id, name, role, emoji, color, active FROM users WHERE id = ?")
    .get(id) as User | undefined) ?? null;
}

export function hasAnyUser(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return row.n > 0;
}

// ---------------------------------------------------------------------------
// Task occurrences
// ---------------------------------------------------------------------------

export function instancesBetween(from: ISODate, to: ISODate, childId?: number): TaskInstanceView[] {
  const db = getDb();
  const where = `WHERE i.due_date >= ? AND i.due_date <= ?${childId ? " AND i.child_id = ?" : ""}`;
  const sql = `SELECT ${INSTANCE_COLUMNS} ${INSTANCE_JOINS} ${where} ORDER BY i.due_date, i.due_time, t.title`;
  const params = childId ? [from, to, childId] : [from, to];
  return db.prepare(sql).all(...params) as TaskInstanceView[];
}

export function instanceById(id: number): TaskInstanceView | null {
  return (getDb()
    .prepare(`SELECT ${INSTANCE_COLUMNS} ${INSTANCE_JOINS} WHERE i.id = ?`)
    .get(id) as TaskInstanceView | undefined) ?? null;
}

export function submittedInstances(): TaskInstanceView[] {
  return getDb()
    .prepare(`SELECT ${INSTANCE_COLUMNS} ${INSTANCE_JOINS} WHERE i.status = 'SUBMITTED' ORDER BY i.submitted_at`)
    .all() as TaskInstanceView[];
}

export type DayProgress = { done: number; total: number; pending: number; missed: number };

export function dayProgress(childId: number, date: ISODate): DayProgress {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM task_instances WHERE child_id = ? AND due_date = ? GROUP BY status")
    .all(childId, date) as { status: string; n: number }[];

  const count = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
  const total = rows.reduce((sum, r) => sum + r.n, 0) - count("SKIPPED");
  return {
    done: count("APPROVED"),
    total,
    pending: count("PENDING") + count("SUBMITTED"),
    missed: count("MISSED") + count("REJECTED"),
  };
}

// ---------------------------------------------------------------------------
// Task definitions
// ---------------------------------------------------------------------------

export function listTasks(childId?: number, includeInactive = false): (Task & { child_name: string })[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (childId) {
    clauses.push("t.child_id = ?");
    params.push(childId);
  }
  if (!includeInactive) clauses.push("t.active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return getDb()
    .prepare(
      `SELECT t.*, u.name AS child_name FROM tasks t JOIN users u ON u.id = t.child_id
       ${where} ORDER BY t.active DESC, u.name, t.title`,
    )
    .all(...params) as (Task & { child_name: string })[];
}

export function getTask(id: number): Task | null {
  return (getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export function listPolicies(childId?: number, includeInactive = false): Policy[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (childId) {
    clauses.push("(child_id IS NULL OR child_id = ?)");
    params.push(childId);
  }
  if (!includeInactive) clauses.push("active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return getDb()
    .prepare(`SELECT * FROM policies ${where} ORDER BY active DESC, kind, title`)
    .all(...params) as Policy[];
}

export type PolicyApplication = {
  id: number;
  policy_title: string;
  child_id: number;
  child_name: string;
  note: string;
  points_delta: number;
  money_delta_cents: number;
  created_at: string;
};

export function recentPolicyApplications(limit = 20, childId?: number): PolicyApplication[] {
  const where = childId ? "WHERE a.child_id = ?" : "";
  const params = childId ? [childId, limit] : [limit];
  return getDb()
    .prepare(
      `SELECT a.id, a.policy_title, a.child_id, u.name AS child_name, a.note,
              a.points_delta, a.money_delta_cents, a.created_at
         FROM policy_applications a JOIN users u ON u.id = a.child_id
         ${where} ORDER BY a.id DESC LIMIT ?`,
    )
    .all(...params) as PolicyApplication[];
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export function listRewards(childId?: number, includeInactive = false): Reward[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (childId) {
    clauses.push("(child_id IS NULL OR child_id = ?)");
    params.push(childId);
  }
  if (!includeInactive) clauses.push("active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return getDb()
    .prepare(`SELECT * FROM rewards ${where} ORDER BY active DESC, cost_points, cost_money_cents, title`)
    .all(...params) as Reward[];
}

export function getReward(id: number): Reward | null {
  return (getDb().prepare("SELECT * FROM rewards WHERE id = ?").get(id) as Reward | undefined) ?? null;
}

export function listRedemptions(options: { childId?: number; status?: string; limit?: number } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.childId) {
    clauses.push("r.child_id = ?");
    params.push(options.childId);
  }
  if (options.status) {
    clauses.push("r.status = ?");
    params.push(options.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(options.limit ?? 50);

  return getDb()
    .prepare(
      `SELECT r.*, u.name AS child_name, u.emoji AS child_emoji
         FROM redemptions r JOIN users u ON u.id = r.child_id
         ${where} ORDER BY r.id DESC LIMIT ?`,
    )
    .all(...params) as (Redemption & { child_name: string; child_emoji: string })[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function listRequests(options: { childId?: number; status?: string; limit?: number } = {}) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.childId) {
    clauses.push("r.child_id = ?");
    params.push(options.childId);
  }
  if (options.status) {
    clauses.push("r.status = ?");
    params.push(options.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(options.limit ?? 50);

  return getDb()
    .prepare(
      `SELECT r.*, u.name AS child_name, u.emoji AS child_emoji
         FROM requests r JOIN users u ON u.id = r.child_id
         ${where} ORDER BY r.id DESC LIMIT ?`,
    )
    .all(...params) as (FamilyRequest & { child_name: string; child_emoji: string })[];
}

// ---------------------------------------------------------------------------
// Pocket money
// ---------------------------------------------------------------------------

export function getAllowance(childId: number): Allowance | null {
  return (getDb().prepare("SELECT * FROM allowances WHERE child_id = ?").get(childId) as Allowance | undefined) ?? null;
}

export function listGoals(childId: number, includeClosed = false): Goal[] {
  const where = includeClosed ? "WHERE child_id = ?" : "WHERE child_id = ? AND status != 'CLOSED'";
  return getDb().prepare(`SELECT * FROM goals ${where} ORDER BY status, id DESC`).all(childId) as Goal[];
}

export function getGoal(id: number): Goal | null {
  return (getDb().prepare("SELECT * FROM goals WHERE id = ?").get(id) as Goal | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Dashboard aggregates
// ---------------------------------------------------------------------------

export type ChildSummary = {
  child: User;
  wallet: Wallet;
  today: DayProgress;
  weekPoints: number;
  openRequests: number;
  pendingRedemptions: number;
};

export function childSummary(child: User, todayDate: ISODate): ChildSummary {
  const db = getDb();
  const weekStart = startOfWeek(todayDate);
  const weekPoints = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger
        WHERE child_id = ? AND currency = 'POINTS' AND date(created_at) >= date(?)`,
    )
    .get(child.id, weekStart) as { total: number };

  const openRequests = db
    .prepare("SELECT COUNT(*) AS n FROM requests WHERE child_id = ? AND status = 'OPEN'")
    .get(child.id) as { n: number };
  const pendingRedemptions = db
    .prepare("SELECT COUNT(*) AS n FROM redemptions WHERE child_id = ? AND status = 'REQUESTED'")
    .get(child.id) as { n: number };

  return {
    child,
    wallet: wallet(child.id),
    today: dayProgress(child.id, todayDate),
    weekPoints: weekPoints.total,
    openRequests: openRequests.n,
    pendingRedemptions: pendingRedemptions.n,
  };
}

export type ApprovalCounts = { tasks: number; redemptions: number; requests: number; total: number };

export function approvalCounts(): ApprovalCounts {
  const db = getDb();
  const tasks = (db.prepare("SELECT COUNT(*) AS n FROM task_instances WHERE status = 'SUBMITTED'").get() as { n: number }).n;
  const redemptions = (db.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'REQUESTED'").get() as { n: number }).n;
  const requests = (db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'OPEN'").get() as { n: number }).n;
  return { tasks, redemptions, requests, total: tasks + redemptions + requests };
}

/** Points per day for the last `days` days — powers the little activity bars. */
export function pointsTrend(childId: number, todayDate: ISODate, days = 14): { date: ISODate; points: number }[] {
  const from = addDays(todayDate, -(days - 1));
  const rows = getDb()
    .prepare(
      `SELECT date(created_at) AS day, COALESCE(SUM(amount), 0) AS total
         FROM ledger
        WHERE child_id = ? AND currency = 'POINTS' AND date(created_at) >= date(?)
        GROUP BY day`,
    )
    .all(childId, from) as { day: string; total: number }[];

  const byDay = new Map(rows.map((r) => [r.day, r.total]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, points: byDay.get(date) ?? 0 };
  });
}
