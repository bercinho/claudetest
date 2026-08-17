"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/auth";
import { getDb, transaction } from "@/lib/db";
import { postBoth } from "@/lib/ledger";
import { type ActionState, guard, int, money, ok, oneOf, str, ValidationError } from "@/lib/form";
import type { Policy } from "@/lib/types";

function refresh(): void {
  for (const path of ["/", "/policies", "/activity"]) revalidatePath(path);
}

export async function savePolicy(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const id = int(form, "id", { fallback: 0 });
    const childIdRaw = int(form, "childId", { min: 0, fallback: 0 });

    const values = {
      title: str(form, "title", { required: true, max: 80 }),
      details: str(form, "details", { max: 500 }),
      kind: oneOf(form, "kind", ["REWARD", "PENALTY"] as const),
      points: int(form, "points", { min: 0, max: 10_000, fallback: 0 }),
      money_cents: money(form, "money", { min: 0 }),
      child_id: childIdRaw === 0 ? null : childIdRaw, // 0 means "everyone"
    };

    if (values.points === 0 && values.money_cents === 0) {
      throw new ValidationError("A policy needs points, money, or both");
    }

    const db = getDb();
    if (id > 0) {
      db.prepare(
        `UPDATE policies SET title = @title, details = @details, kind = @kind, points = @points,
                             money_cents = @money_cents, child_id = @child_id
          WHERE id = @id`,
      ).run({ ...values, id });
    } else {
      db.prepare(
        `INSERT INTO policies (title, details, kind, points, money_cents, child_id)
         VALUES (@title, @details, @kind, @points, @money_cents, @child_id)`,
      ).run(values);
    }

    refresh();
    return ok(id > 0 ? "Policy updated" : "Policy added");
  });
}

export async function setPolicyActive(form: FormData): Promise<void> {
  await requireParent();
  getDb()
    .prepare("UPDATE policies SET active = ? WHERE id = ?")
    .run(form.get("active") === "1" ? 1 : 0, Number(form.get("id")));
  refresh();
}

export async function deletePolicy(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM policies WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

/** One-tap enforcement: records the application and moves the balances. */
export async function applyPolicy(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const policyId = int(form, "policyId", { min: 1 });
    const childId = int(form, "childId", { min: 1 });
    const note = str(form, "note", { max: 300 });

    const policy = getDb().prepare("SELECT * FROM policies WHERE id = ?").get(policyId) as Policy | undefined;
    if (!policy) throw new ValidationError("That policy no longer exists");
    if (policy.child_id !== null && policy.child_id !== childId) {
      throw new ValidationError("That policy does not apply to this child");
    }

    const sign = policy.kind === "PENALTY" ? -1 : 1;
    const pointsDelta = sign * policy.points;
    const moneyDelta = sign * policy.money_cents;

    transaction(() => {
      getDb()
        .prepare(
          `INSERT INTO policy_applications (policy_id, policy_title, child_id, applied_by, note, points_delta, money_delta_cents)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(policy.id, policy.title, childId, parent.id, note, pointsDelta, moneyDelta);

      postBoth({
        childId,
        points: pointsDelta,
        moneyCents: moneyDelta,
        reason: note ? `${policy.title} — ${note}` : policy.title,
        source: "POLICY",
        sourceId: policy.id,
        createdBy: parent.id,
      });
    });

    refresh();
    return ok(`${policy.kind === "PENALTY" ? "Penalty" : "Reward"} applied: ${policy.title}`);
  });
}

/** Undoes a policy application by posting the mirror-image entries. */
export async function revertPolicyApplication(form: FormData): Promise<void> {
  const parent = await requireParent();
  const id = Number(form.get("id"));

  const application = getDb()
    .prepare("SELECT * FROM policy_applications WHERE id = ?")
    .get(id) as
    | { id: number; policy_title: string; child_id: number; points_delta: number; money_delta_cents: number }
    | undefined;
  if (!application) return;

  transaction(() => {
    postBoth({
      childId: application.child_id,
      points: -application.points_delta,
      moneyCents: -application.money_delta_cents,
      reason: `Reverted: ${application.policy_title}`,
      source: "POLICY",
      sourceId: null,
      createdBy: parent.id,
    });
    getDb().prepare("DELETE FROM policy_applications WHERE id = ?").run(id);
  });

  refresh();
}
