"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, getSettings, transaction } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { postBoth, reverseMissPenalty } from "@/lib/ledger";
import { instanceById } from "@/lib/queries";
import * as notify from "@/lib/notify";
import { materializeTasks } from "@/lib/scheduler";
import {
  type ActionState,
  bool,
  guard,
  int,
  money,
  ok,
  oneOf,
  optionalDate,
  str,
  time,
  ValidationError,
} from "@/lib/form";
import type { Recurrence } from "@/lib/types";

const RECURRENCES = ["ONCE", "DAILY", "WEEKDAYS", "WEEKLY", "CUSTOM"] as const;

function refresh(): void {
  for (const path of ["/", "/tasks", "/approvals", "/activity"]) revalidatePath(path);
}

function daysMaskFrom(form: FormData, recurrence: Recurrence): number {
  if (recurrence !== "WEEKLY" && recurrence !== "CUSTOM") return 0;
  const mask = form
    .getAll("days")
    .map((value) => Number(value))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .reduce((acc, day) => acc | (1 << (day - 1)), 0);
  if (mask === 0) throw new ValidationError("Pick at least one day of the week");
  return mask;
}

export async function saveTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const { timezone } = getSettings();
    const id = int(form, "id", { fallback: 0 });

    const recurrence = oneOf(form, "recurrence", RECURRENCES);
    const values = {
      title: str(form, "title", { required: true, max: 80 }),
      details: str(form, "details", { max: 500 }),
      child_id: int(form, "childId", { min: 1 }),
      points: int(form, "points", { min: 0, max: 10_000, fallback: 0 }),
      money_cents: money(form, "money", { min: 0 }),
      penalty_points: int(form, "penaltyPoints", { min: 0, max: 10_000, fallback: 0 }),
      recurrence,
      days_mask: daysMaskFrom(form, recurrence),
      due_time: time(form, "dueTime"),
      start_date: optionalDate(form, "startDate") ?? nowIn(timezone).date,
      end_date: optionalDate(form, "endDate"),
      auto_approve: bool(form, "autoApprove") ? 1 : 0,
    };

    if (values.end_date && values.end_date < values.start_date) {
      throw new ValidationError("The end date cannot be before the start date");
    }

    const db = getDb();
    if (id > 0) {
      db.prepare(
        `UPDATE tasks SET title = @title, details = @details, child_id = @child_id, points = @points,
                          money_cents = @money_cents, penalty_points = @penalty_points, recurrence = @recurrence,
                          days_mask = @days_mask, due_time = @due_time, start_date = @start_date,
                          end_date = @end_date, auto_approve = @auto_approve
          WHERE id = @id`,
      ).run({ ...values, id });

      // Keep future occurrences in step with the edited definition; past ones are history.
      db.prepare(
        `DELETE FROM task_instances
          WHERE task_id = ? AND status = 'PENDING' AND due_date > ?`,
      ).run(id, nowIn(timezone).date);
    } else {
      db.prepare(
        `INSERT INTO tasks (title, details, child_id, points, money_cents, penalty_points, recurrence,
                            days_mask, due_time, start_date, end_date, auto_approve, created_by)
         VALUES (@title, @details, @child_id, @points, @money_cents, @penalty_points, @recurrence,
                 @days_mask, @due_time, @start_date, @end_date, @auto_approve, @created_by)`,
      ).run({ ...values, created_by: parent.id });
    }

    materializeTasks(nowIn(timezone).date);
    refresh();
    return ok(id > 0 ? "Task updated" : "Task created");
  });
}

export async function setTaskActive(form: FormData): Promise<void> {
  await requireParent();
  const id = Number(form.get("id"));
  const active = form.get("active") === "1" ? 1 : 0;

  transaction(() => {
    getDb().prepare("UPDATE tasks SET active = ? WHERE id = ?").run(active, id);
    if (!active) {
      // Drop not-yet-started occurrences so a paused task stops nagging.
      getDb().prepare("DELETE FROM task_instances WHERE task_id = ? AND status = 'PENDING'").run(id);
    }
  });

  if (active) materializeTasks(nowIn(getSettings().timezone).date);
  refresh();
}

export async function deleteTask(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

/** A child (or a parent on their behalf) marks an occurrence as done. */
export async function submitTask(form: FormData): Promise<void> {
  const instanceId = Number(form.get("instanceId"));
  const instance = instanceById(instanceId);
  if (!instance) return;

  const actor = await requireSelfOrParent(instance.child_id);
  if (instance.status === "APPROVED") return;

  const note = String(form.get("note") ?? "").slice(0, 300);
  const db = getDb();

  const autoApprove = instance.auto_approve === 1 || actor.role === "PARENT";
  transaction(() => {
    if (autoApprove) {
      const changed = db
        .prepare(
          `UPDATE task_instances
              SET status = 'APPROVED', child_note = ?, submitted_at = COALESCE(submitted_at, datetime('now')),
                  reviewed_at = datetime('now'), reviewed_by = ?,
                  points_awarded = ?, money_awarded_cents = ?
            WHERE id = ? AND status != 'APPROVED'`,
        )
        .run(note, actor.id, instance.points, instance.money_cents, instanceId).changes;

      if (changed > 0) {
        postBoth({
          childId: instance.child_id,
          points: instance.points,
          moneyCents: instance.money_cents,
          reason: `Task: ${instance.title}`,
          source: "TASK",
          sourceId: instanceId,
          createdBy: actor.id,
        });
        reverseMissPenalty({
          instanceId,
          childId: instance.child_id,
          title: instance.title,
          createdBy: actor.id,
        });
      }
    } else {
      const submitted = db
        .prepare(
          `UPDATE task_instances
              SET status = 'SUBMITTED', child_note = ?, submitted_at = datetime('now')
            WHERE id = ? AND status IN ('PENDING', 'MISSED', 'REJECTED')`,
        )
        .run(note, instanceId).changes;
      if (submitted > 0) notify.taskSubmitted(instance.child_id, instance.title);
    }
  });

  refresh();
}

/** A child takes back a submission that has not been reviewed yet. */
export async function unsubmitTask(form: FormData): Promise<void> {
  const instanceId = Number(form.get("instanceId"));
  const instance = instanceById(instanceId);
  if (!instance) return;
  await requireSelfOrParent(instance.child_id);

  getDb()
    .prepare("UPDATE task_instances SET status = 'PENDING', submitted_at = NULL WHERE id = ? AND status = 'SUBMITTED'")
    .run(instanceId);
  refresh();
}

export async function reviewTask(form: FormData): Promise<void> {
  const parent = await requireParent();
  const instanceId = Number(form.get("instanceId"));
  const decision = String(form.get("decision"));
  const note = String(form.get("note") ?? "").slice(0, 300);
  const instance = instanceById(instanceId);
  if (!instance || instance.status === "APPROVED") return;

  const db = getDb();

  if (decision === "approve") {
    // A parent may bump the payout at review time.
    const bonusPoints = Number(form.get("points") ?? instance.points);
    const points = Number.isFinite(bonusPoints) ? Math.trunc(bonusPoints) : instance.points;

    transaction(() => {
      const changed = db
        .prepare(
          `UPDATE task_instances
              SET status = 'APPROVED', reviewed_at = datetime('now'), reviewed_by = ?, parent_note = ?,
                  points_awarded = ?, money_awarded_cents = ?
            WHERE id = ? AND status != 'APPROVED'`,
        )
        .run(parent.id, note, points, instance.money_cents, instanceId).changes;

      if (changed > 0) {
        postBoth({
          childId: instance.child_id,
          points,
          moneyCents: instance.money_cents,
          reason: `Task: ${instance.title}`,
          source: "TASK",
          sourceId: instanceId,
          createdBy: parent.id,
        });
        reverseMissPenalty({
          instanceId,
          childId: instance.child_id,
          title: instance.title,
          createdBy: parent.id,
        });
      }
    });
    notify.taskReviewed(instance.child_id, instance.title, "approve", note);
  } else if (decision === "reject") {
    db.prepare(
      `UPDATE task_instances
          SET status = 'REJECTED', reviewed_at = datetime('now'), reviewed_by = ?, parent_note = ?
        WHERE id = ?`,
    ).run(parent.id, note, instanceId);
    notify.taskReviewed(instance.child_id, instance.title, "reject", note);
  } else if (decision === "skip") {
    db.prepare(
      `UPDATE task_instances
          SET status = 'SKIPPED', reviewed_at = datetime('now'), reviewed_by = ?, parent_note = ?
        WHERE id = ?`,
    ).run(parent.id, note, instanceId);
  }

  refresh();
}

/** Adds a one-off task for today straight from the dashboard. */
export async function quickAddTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const { timezone } = getSettings();
    const today = nowIn(timezone).date;

    const title = str(form, "title", { required: true, max: 80 });
    const childId = int(form, "childId", { min: 1 });
    const points = int(form, "points", { min: 0, max: 10_000, fallback: 0 });

    const info = getDb()
      .prepare(
        `INSERT INTO tasks (title, child_id, points, recurrence, due_time, start_date, created_by)
         VALUES (?, ?, ?, 'ONCE', '20:00', ?, ?)`,
      )
      .run(title, childId, points, today, parent.id);

    getDb()
      .prepare("INSERT OR IGNORE INTO task_instances (task_id, child_id, due_date, due_time) VALUES (?, ?, ?, '20:00')")
      .run(Number(info.lastInsertRowid), childId, today);

    refresh();
    return ok(`Added "${title}"`);
  });
}
