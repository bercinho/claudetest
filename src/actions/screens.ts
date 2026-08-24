"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, getSettings } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { formatMinutes, getBudget, screenDay, tasksOutstanding } from "@/lib/screens";
import { type ActionState, guard, int, ok, optionalDate, str, ValidationError } from "@/lib/form";
import type { ScreenClaim } from "@/lib/types";
import * as notify from "@/lib/notify";

function refresh(): void {
  for (const path of ["/", "/screens", "/approvals"]) revalidatePath(path);
}

function today(): string {
  return nowIn(getSettings().timezone).date;
}

// ---------------------------------------------------------------------------
// The standing allowance
// ---------------------------------------------------------------------------

export async function saveScreenBudget(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const values = {
      child_id: int(form, "childId", { min: 1 }),
      weekday_minutes: int(form, "weekdayMinutes", { min: 0, max: 1440, fallback: 60 }),
      weekend_minutes: int(form, "weekendMinutes", { min: 0, max: 1440, fallback: 120 }),
      auto_approve_minutes: int(form, "autoApproveMinutes", { min: 0, max: 1440, fallback: 0 }),
      require_tasks_done: String(form.get("requireTasksDone") ?? "") === "on" ? 1 : 0,
      active: String(form.get("active") ?? "") === "on" ? 1 : 0,
    };

    getDb()
      .prepare(
        `INSERT INTO screen_budgets (child_id, weekday_minutes, weekend_minutes, auto_approve_minutes,
                                     require_tasks_done, active)
         VALUES (@child_id, @weekday_minutes, @weekend_minutes, @auto_approve_minutes, @require_tasks_done, @active)
         ON CONFLICT(child_id) DO UPDATE SET
           weekday_minutes = excluded.weekday_minutes,
           weekend_minutes = excluded.weekend_minutes,
           auto_approve_minutes = excluded.auto_approve_minutes,
           require_tasks_done = excluded.require_tasks_done,
           active = excluded.active`,
      )
      .run(values);

    refresh();
    return ok("Screen time settings saved");
  });
}

/** A one-off change to a single day: a treat, or time taken away. */
export async function grantScreenMinutes(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const childId = int(form, "childId", { min: 1 });
    const minutes = int(form, "minutes", { min: -1440, max: 1440 });
    if (minutes === 0) throw new ValidationError("Enter how many minutes to add or take away");

    const date = optionalDate(form, "date") ?? today();
    getDb()
      .prepare("INSERT INTO screen_grants (child_id, date, minutes, reason, created_by) VALUES (?, ?, ?, ?, ?)")
      .run(childId, date, minutes, str(form, "reason", { max: 200 }), parent.id);

    notify.screenMinutesAdjusted(childId, minutes, str(form, "reason", { max: 200 }));
    refresh();
    return ok(minutes > 0 ? `${formatMinutes(minutes)} added` : `${formatMinutes(-minutes)} taken away`);
  });
}

export async function undoScreenGrant(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM screen_grants WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

// ---------------------------------------------------------------------------
// Claiming time
// ---------------------------------------------------------------------------

/**
 * The child asks for time. Small claims can be set to go through on their own;
 * everything else waits for a parent, who can grant less than was asked for.
 */
export async function claimScreenTime(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const childId = int(form, "childId", { min: 1 });
    const actor = await requireSelfOrParent(childId);
    const date = today();

    const minutes = int(form, "minutes", { min: 1, max: 1440 });
    const budget = getBudget(childId);
    if (budget.active !== 1) throw new ValidationError("Screen time is not being tracked at the moment");

    const day = screenDay(childId, date);
    if (minutes > day.remaining) {
      throw new ValidationError(
        day.remaining === 0
          ? "There is no screen time left today"
          : `Only ${formatMinutes(day.remaining)} left today`,
      );
    }

    const outstanding = budget.require_tasks_done === 1 ? tasksOutstanding(childId, date) : 0;
    // A parent claiming on the child's behalf is the decision, so it stands.
    const auto =
      actor.role === "PARENT" || (outstanding === 0 && minutes <= budget.auto_approve_minutes);

    getDb()
      .prepare(
        `INSERT INTO screen_claims (child_id, date, what, requested_minutes, granted_minutes, status,
                                    child_note, decided_at, decided_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        childId,
        date,
        str(form, "what", { max: 80 }),
        minutes,
        auto ? minutes : 0,
        auto ? "APPROVED" : "REQUESTED",
        str(form, "note", { max: 300 }),
        auto ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
        auto ? actor.id : null,
      );

    if (!auto) notify.screenTimeAsked(childId, minutes, str(form, "what", { max: 80 }));

    refresh();
    if (auto) return ok(`${formatMinutes(minutes)} it is — enjoy.`);
    if (outstanding > 0) {
      return ok(
        `Sent to your parent. ${outstanding} task${outstanding === 1 ? "" : "s"} still to do today, so this one needs asking.`,
      );
    }
    return ok("Sent to your parent to approve");
  });
}

/** Approve as asked, approve less, or say no. */
export async function decideScreenClaim(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const id = int(form, "id", { min: 1 });
    const claim = getDb().prepare("SELECT * FROM screen_claims WHERE id = ?").get(id) as ScreenClaim | undefined;
    if (!claim || claim.status !== "REQUESTED") throw new ValidationError("Already decided");

    const note = str(form, "note", { max: 300 });
    if (String(form.get("decision")) !== "approve") {
      getDb()
        .prepare(
          "UPDATE screen_claims SET status = 'DENIED', parent_note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ? AND status = 'REQUESTED'",
        )
        .run(note, parent.id, id);
      notify.screenTimeDecided({
        childId: claim.child_id,
        approved: false,
        granted: 0,
        requested: claim.requested_minutes,
        note,
      });
      refresh();
      return ok("Declined");
    }

    const granted = int(form, "minutes", { min: 0, max: 1440, fallback: claim.requested_minutes });
    if (granted === 0) throw new ValidationError("Grant at least a minute, or decline instead");

    // The day may have moved on since he asked, so check again before granting.
    const day = screenDay(claim.child_id, claim.date);
    if (granted > day.remaining) {
      throw new ValidationError(`Only ${formatMinutes(day.remaining)} left that day`);
    }

    getDb()
      .prepare(
        `UPDATE screen_claims
            SET status = 'APPROVED', granted_minutes = ?, parent_note = ?,
                decided_at = datetime('now'), decided_by = ?
          WHERE id = ? AND status = 'REQUESTED'`,
      )
      .run(granted, note, parent.id, id);

    notify.screenTimeDecided({
      childId: claim.child_id,
      approved: true,
      granted,
      requested: claim.requested_minutes,
      note,
    });
    refresh();
    return ok(
      granted < claim.requested_minutes
        ? `Reduced to ${formatMinutes(granted)}`
        : `${formatMinutes(granted)} approved`,
    );
  });
}

/**
 * Takes back time that is no longer being used — a child cancelling their own
 * pending ask, or a parent calling time on a session already granted.
 */
export async function cancelScreenClaim(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const claim = getDb().prepare("SELECT * FROM screen_claims WHERE id = ?").get(id) as ScreenClaim | undefined;
  if (!claim) return;
  const actor = await requireSelfOrParent(claim.child_id);

  // A child may withdraw an ask; only a parent can end an approved session.
  const allowed = claim.status === "REQUESTED" || actor.role === "PARENT";
  if (!allowed) return;

  getDb()
    .prepare("UPDATE screen_claims SET status = 'CANCELLED' WHERE id = ? AND status IN ('REQUESTED', 'APPROVED')")
    .run(id);
  refresh();
}
