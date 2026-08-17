"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, transaction } from "@/lib/db";
import { post, wallet } from "@/lib/ledger";
import { getGoal } from "@/lib/queries";
import { type ActionState, guard, int, money, ok, oneOf, str, ValidationError } from "@/lib/form";

function refresh(): void {
  for (const path of ["/", "/money", "/activity"]) revalidatePath(path);
}

/** A parent hands out or takes back points/money outside of any rule. */
export async function adjustBalance(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const childId = int(form, "childId", { min: 1 });
    const direction = oneOf(form, "direction", ["ADD", "REMOVE"] as const);
    const points = int(form, "points", { min: 0, max: 100_000, fallback: 0 });
    const cents = money(form, "money", { min: 0 });
    const reason = str(form, "reason", { required: true, max: 200 });

    if (points === 0 && cents === 0) throw new ValidationError("Enter points, money, or both");

    const sign = direction === "REMOVE" ? -1 : 1;
    transaction(() => {
      post({
        childId,
        currency: "POINTS",
        amount: sign * points,
        reason,
        source: "MANUAL",
        createdBy: parent.id,
      });
      post({
        childId,
        currency: "MONEY",
        amount: sign * cents,
        reason,
        source: "MANUAL",
        createdBy: parent.id,
      });
    });

    refresh();
    return ok("Balance adjusted");
  });
}

export async function saveAllowance(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const childId = int(form, "childId", { min: 1 });
    const cadence = oneOf(form, "cadence", ["WEEKLY", "MONTHLY"] as const);
    const payday = int(form, "payday", { min: 1, max: cadence === "WEEKLY" ? 7 : 28 });

    const values = {
      child_id: childId,
      base_cents: money(form, "base", { min: 0 }),
      cadence,
      payday,
      bonus_per_point_cents: money(form, "bonusPerPoint", { min: 0 }),
      min_points: int(form, "minPoints", { min: 0, max: 100_000, fallback: 0 }),
      active: String(form.get("active") ?? "") === "on" ? 1 : 0,
    };

    getDb()
      .prepare(
        `INSERT INTO allowances (child_id, base_cents, cadence, payday, bonus_per_point_cents, min_points, active)
         VALUES (@child_id, @base_cents, @cadence, @payday, @bonus_per_point_cents, @min_points, @active)
         ON CONFLICT(child_id) DO UPDATE SET
           base_cents = excluded.base_cents,
           cadence = excluded.cadence,
           payday = excluded.payday,
           bonus_per_point_cents = excluded.bonus_per_point_cents,
           min_points = excluded.min_points,
           active = excluded.active`,
      )
      .run(values);

    refresh();
    return ok("Pocket money settings saved");
  });
}

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

export async function createGoal(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const childId = int(form, "childId", { min: 1 });
    await requireSelfOrParent(childId);

    const target = money(form, "target", { min: 0 });
    if (target <= 0) throw new ValidationError("Set a target amount");

    getDb()
      .prepare("INSERT INTO goals (child_id, title, target_cents) VALUES (?, ?, ?)")
      .run(childId, str(form, "title", { required: true, max: 80 }), target);

    refresh();
    return ok("Savings goal created");
  });
}

export async function moveGoalMoney(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const goalId = int(form, "goalId", { min: 1 });
    const goal = getGoal(goalId);
    if (!goal) throw new ValidationError("That goal no longer exists");
    const actor = await requireSelfOrParent(goal.child_id);

    const direction = oneOf(form, "direction", ["IN", "OUT"] as const);
    const amount = money(form, "amount", { min: 0 });
    if (amount <= 0) throw new ValidationError("Enter an amount");

    const balance = wallet(goal.child_id);
    if (direction === "IN" && amount > balance.spendable_cents) {
      throw new ValidationError("That is more than the spendable balance");
    }
    if (direction === "OUT" && amount > goal.saved_cents) {
      throw new ValidationError("That is more than this goal holds");
    }

    // Goal money stays in the ledger total but leaves the spendable balance, so
    // only `saved_cents` moves here — no ledger entry is needed.
    const delta = direction === "IN" ? amount : -amount;
    transaction(() => {
      getDb().prepare("UPDATE goals SET saved_cents = saved_cents + ? WHERE id = ?").run(delta, goalId);
      const updated = getGoal(goalId);
      if (updated && updated.status !== "CLOSED") {
        const reached = updated.saved_cents >= updated.target_cents;
        getDb().prepare("UPDATE goals SET status = ? WHERE id = ?").run(reached ? "REACHED" : "ACTIVE", goalId);
      }
    });

    refresh();
    return ok(
      direction === "IN"
        ? `Moved into "${goal.title}"`
        : `Moved out of "${goal.title}"${actor.role === "PARENT" ? "" : " — back to spending money"}`,
    );
  });
}

/** Marks a goal as bought: the saved money is spent and the goal is closed. */
export async function spendGoal(form: FormData): Promise<void> {
  const goalId = Number(form.get("goalId"));
  const goal = getGoal(goalId);
  if (!goal || goal.status === "CLOSED") return;
  const actor = await requireSelfOrParent(goal.child_id);

  transaction(() => {
    post({
      childId: goal.child_id,
      currency: "MONEY",
      amount: -goal.saved_cents,
      reason: `Bought: ${goal.title}`,
      source: "GOAL",
      sourceId: goal.id,
      createdBy: actor.id,
    });
    getDb()
      .prepare("UPDATE goals SET status = 'CLOSED', saved_cents = 0, closed_at = datetime('now') WHERE id = ?")
      .run(goalId);
  });

  refresh();
}

/** Cancels a goal and releases whatever it held back into spending money. */
export async function closeGoal(form: FormData): Promise<void> {
  const goalId = Number(form.get("goalId"));
  const goal = getGoal(goalId);
  if (!goal || goal.status === "CLOSED") return;
  await requireSelfOrParent(goal.child_id);

  getDb()
    .prepare("UPDATE goals SET status = 'CLOSED', saved_cents = 0, closed_at = datetime('now') WHERE id = ?")
    .run(goalId);
  refresh();
}
