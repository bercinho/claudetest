import "server-only";

import { getDb } from "./db";
import { wallet, type Wallet } from "./ledger";
import { addDays, startOfWeek, type ISODate } from "./dates";
import type {
  Allowance,
  FamilyRequest,
  Goal,
  Grade,
  Policy,
  Redemption,
  Reward,
  ScheduleEventView,
  ScheduleSlot,
  SportProfile,
  SportReport,
  Subject,
  Task,
  TaskInstanceView,
  Term,
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

export type ApprovalCounts = {
  tasks: number;
  redemptions: number;
  requests: number;
  grades: number;
  screens: number;
  total: number;
};

export function approvalCounts(): ApprovalCounts {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const tasks = count("SELECT COUNT(*) AS n FROM task_instances WHERE status = 'SUBMITTED'");
  const redemptions = count("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'REQUESTED'");
  const requests = count("SELECT COUNT(*) AS n FROM requests WHERE status = 'OPEN'");
  const grades = count("SELECT COUNT(*) AS n FROM grades WHERE confirmed = 0");
  const screens = count("SELECT COUNT(*) AS n FROM screen_claims WHERE status = 'REQUESTED'");

  return {
    tasks,
    redemptions,
    requests,
    grades,
    screens,
    total: tasks + redemptions + requests + grades + screens,
  };
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

// ---------------------------------------------------------------------------
// School
// ---------------------------------------------------------------------------

export function listTerms(): Term[] {
  return getDb().prepare("SELECT * FROM terms ORDER BY start_date DESC").all() as Term[];
}

export function getTerm(id: number): Term | null {
  return (getDb().prepare("SELECT * FROM terms WHERE id = ?").get(id) as Term | undefined) ?? null;
}

/** The term covering today, or failing that the most recent active one. */
export function currentTerm(todayDate: ISODate): Term | null {
  const db = getDb();
  const covering = db
    .prepare("SELECT * FROM terms WHERE active = 1 AND start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1")
    .get(todayDate, todayDate) as Term | undefined;
  if (covering) return covering;

  return (db.prepare("SELECT * FROM terms WHERE active = 1 ORDER BY start_date DESC LIMIT 1").get() as Term | undefined) ?? null;
}

export function listSubjects(termId: number, childId?: number, includeInactive = false): Subject[] {
  const clauses = ["term_id = ?"];
  const params: unknown[] = [termId];
  if (childId) {
    clauses.push("child_id = ?");
    params.push(childId);
  }
  if (!includeInactive) clauses.push("active = 1");

  return getDb()
    .prepare(`SELECT * FROM subjects WHERE ${clauses.join(" AND ")} ORDER BY active DESC, name`)
    .all(...params) as Subject[];
}

export function getSubject(id: number): Subject | null {
  return (getDb().prepare("SELECT * FROM subjects WHERE id = ?").get(id) as Subject | undefined) ?? null;
}

export function listGrades(subjectId: number): Grade[] {
  return getDb()
    .prepare("SELECT * FROM grades WHERE subject_id = ? ORDER BY date DESC, id DESC")
    .all(subjectId) as Grade[];
}

/** Every mark in a term, so a page can group them by subject with one query. */
export function gradesForTerm(termId: number, childId?: number): Grade[] {
  const params: unknown[] = [termId];
  let where = "s.term_id = ?";
  if (childId) {
    where += " AND g.child_id = ?";
    params.push(childId);
  }
  return getDb()
    .prepare(`SELECT g.* FROM grades g JOIN subjects s ON s.id = g.subject_id WHERE ${where} ORDER BY g.date DESC, g.id DESC`)
    .all(...params) as Grade[];
}

export function getGrade(id: number): Grade | null {
  return (getDb().prepare("SELECT * FROM grades WHERE id = ?").get(id) as Grade | undefined) ?? null;
}

export type PendingGrade = Grade & { subject_name: string; subject_emoji: string; child_name: string; child_emoji: string };

/** Marks a child entered that a parent has not confirmed yet. */
export function pendingGrades(childId?: number): PendingGrade[] {
  const params: unknown[] = [];
  let where = "g.confirmed = 0";
  if (childId) {
    where += " AND g.child_id = ?";
    params.push(childId);
  }
  return getDb()
    .prepare(
      `SELECT g.*, s.name AS subject_name, s.emoji AS subject_emoji, u.name AS child_name, u.emoji AS child_emoji
         FROM grades g
         JOIN subjects s ON s.id = g.subject_id
         JOIN users u ON u.id = g.child_id
        WHERE ${where}
        ORDER BY g.date DESC, g.id DESC`,
    )
    .all(...params) as PendingGrade[];
}

// ---------------------------------------------------------------------------
// Sport and the weekly schedule
// ---------------------------------------------------------------------------

export function getSportProfile(childId: number): SportProfile | null {
  return (
    (getDb().prepare("SELECT * FROM sport_profiles WHERE child_id = ?").get(childId) as SportProfile | undefined) ?? null
  );
}

export function listSlots(childId?: number, includeInactive = false): ScheduleSlot[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (childId) {
    clauses.push("child_id = ?");
    params.push(childId);
  }
  if (!includeInactive) clauses.push("active = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return getDb()
    .prepare(`SELECT * FROM schedule_slots ${where} ORDER BY active DESC, day_of_week, start_time`)
    .all(...params) as ScheduleSlot[];
}

export function getSlot(id: number): ScheduleSlot | null {
  return (getDb().prepare("SELECT * FROM schedule_slots WHERE id = ?").get(id) as ScheduleSlot | undefined) ?? null;
}

const EVENT_SELECT = `SELECT e.*, u.name AS child_name, u.emoji AS child_emoji,
                             s.name AS subject_name, s.emoji AS subject_emoji,
                             (SELECT COUNT(*) FROM sport_reports r WHERE r.event_id = e.id) AS has_report
                        FROM schedule_events e
                        JOIN users u ON u.id = e.child_id
                        LEFT JOIN subjects s ON s.id = e.subject_id`;

export function eventsBetween(
  from: ISODate,
  to: ISODate,
  options: { childId?: number; kinds?: string[] } = {},
): ScheduleEventView[] {
  const clauses = ["e.date >= ?", "e.date <= ?"];
  const params: unknown[] = [from, to];
  if (options.childId) {
    clauses.push("e.child_id = ?");
    params.push(options.childId);
  }
  if (options.kinds?.length) {
    clauses.push(`e.kind IN (${options.kinds.map(() => "?").join(", ")})`);
    params.push(...options.kinds);
  }

  return getDb()
    .prepare(`${EVENT_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY e.date, e.start_time, e.title`)
    .all(...params) as ScheduleEventView[];
}

export function getEvent(id: number): ScheduleEventView | null {
  return (getDb().prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id) as ScheduleEventView | undefined) ?? null;
}

export const SPORT_KINDS = ["TRAINING", "MATCH", "TOURNAMENT"] as const;

/**
 * Sport sessions that have already finished but whose attendance was never
 * recorded — the nudge list on the sport page. Uses the clock as well as the
 * date, so this evening's training is not asked about this morning.
 */
export function sportEventsAwaitingRecord(
  todayDate: ISODate,
  nowTime: string,
  childId?: number,
): ScheduleEventView[] {
  const params: unknown[] = [todayDate, todayDate, nowTime];
  let where = `(e.date < ? OR (e.date = ? AND e.end_time <= ?))
               AND e.attendance = 'PLANNED' AND e.kind IN ('TRAINING', 'MATCH', 'TOURNAMENT')`;
  if (childId) {
    where += " AND e.child_id = ?";
    params.push(childId);
  }
  return getDb()
    .prepare(`${EVENT_SELECT} WHERE ${where} ORDER BY e.date DESC, e.start_time DESC LIMIT 30`)
    .all(...params) as ScheduleEventView[];
}

export function getSportReport(eventId: number): SportReport | null {
  return (
    (getDb().prepare("SELECT * FROM sport_reports WHERE event_id = ?").get(eventId) as SportReport | undefined) ?? null
  );
}

export type SportReportView = SportReport & {
  date: string;
  title: string;
  kind: string;
  location: string;
  attendance: string;
};

export function recentSportReports(childId: number, limit = 20): SportReportView[] {
  return getDb()
    .prepare(
      `SELECT r.*, e.date, e.title, e.kind, e.location, e.attendance
         FROM sport_reports r
         JOIN schedule_events e ON e.id = r.event_id
        WHERE e.child_id = ?
        ORDER BY e.date DESC, e.id DESC
        LIMIT ?`,
    )
    .all(childId, limit) as SportReportView[];
}

export type SportStats = {
  sessions: number;
  attended: number;
  missed: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  minutes: number;
  averageRating: number | null;
};

/** Season totals from `from` onwards. */
export function sportStats(childId: number, from: ISODate, to: ISODate): SportStats {
  const db = getDb();
  const attendance = db
    .prepare(
      `SELECT attendance, COUNT(*) AS n
         FROM schedule_events
        WHERE child_id = ? AND date >= ? AND date <= ? AND kind IN ('TRAINING', 'MATCH', 'TOURNAMENT')
        GROUP BY attendance`,
    )
    .all(childId, from, to) as { attendance: string; n: number }[];

  const count = (status: string) => attendance.find((row) => row.attendance === status)?.n ?? 0;

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS matches,
              COALESCE(SUM(r.outcome = 'WIN'), 0)  AS wins,
              COALESCE(SUM(r.outcome = 'DRAW'), 0) AS draws,
              COALESCE(SUM(r.outcome = 'LOSS'), 0) AS losses,
              COALESCE(SUM(r.goals), 0)   AS goals,
              COALESCE(SUM(r.assists), 0) AS assists,
              COALESCE(SUM(r.minutes), 0) AS minutes,
              AVG(r.coach_rating)         AS rating
         FROM sport_reports r
         JOIN schedule_events e ON e.id = r.event_id
        WHERE e.child_id = ? AND e.date >= ? AND e.date <= ?`,
    )
    .get(childId, from, to) as {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goals: number;
    assists: number;
    minutes: number;
    rating: number | null;
  };

  return {
    sessions: attendance.reduce((sum, row) => sum + row.n, 0) - count("CANCELLED"),
    attended: count("PRESENT"),
    missed: count("ABSENT"),
    matches: totals.matches,
    wins: totals.wins,
    draws: totals.draws,
    losses: totals.losses,
    goals: totals.goals,
    assists: totals.assists,
    minutes: totals.minutes,
    averageRating: totals.rating === null ? null : Math.round(totals.rating * 10) / 10,
  };
}

/** The next thing on the calendar from now, for the dashboard one-liner. */
export function nextEvent(childId: number, todayDate: ISODate, nowTime: string): ScheduleEventView | null {
  return (
    (getDb()
      .prepare(
        `${EVENT_SELECT}
          WHERE e.child_id = ? AND e.attendance != 'CANCELLED'
            AND (e.date > ? OR (e.date = ? AND e.end_time >= ?))
          ORDER BY e.date, e.start_time LIMIT 1`,
      )
      .get(childId, todayDate, todayDate, nowTime) as ScheduleEventView | undefined) ?? null
  );
}
