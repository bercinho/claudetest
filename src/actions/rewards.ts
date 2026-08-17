"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, getSettings, transaction } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { grantRewardScreenTime } from "@/lib/screens";
import { postBoth, wallet } from "@/lib/ledger";
import { getReward } from "@/lib/queries";
import { type ActionState, guard, int, money, ok, str, ValidationError } from "@/lib/form";
import type { Redemption } from "@/lib/types";

function refresh(): void {
  for (const path of ["/", "/rewards", "/approvals", "/activity", "/money", "/screens"]) revalidatePath(path);
}

export async function saveReward(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const id = int(form, "id", { fallback: 0 });
    const childIdRaw = int(form, "childId", { min: 0, fallback: 0 });
    const stockRaw = str(form, "stock");

    const values = {
      title: str(form, "title", { required: true, max: 80 }),
      details: str(form, "details", { max: 500 }),
      cost_points: int(form, "costPoints", { min: 0, max: 100_000, fallback: 0 }),
      cost_money_cents: money(form, "costMoney", { min: 0 }),
      child_id: childIdRaw === 0 ? null : childIdRaw,
      stock: stockRaw === "" ? null : int(form, "stock", { min: 0, max: 1000 }),
      screen_minutes: int(form, "screenMinutes", { min: 0, max: 1440, fallback: 0 }),
    };

    if (values.cost_points === 0 && values.cost_money_cents === 0) {
      throw new ValidationError("A reward needs a price in points, money, or both");
    }

    const db = getDb();
    if (id > 0) {
      db.prepare(
        `UPDATE rewards SET title = @title, details = @details, cost_points = @cost_points,
                            cost_money_cents = @cost_money_cents, child_id = @child_id, stock = @stock,
                            screen_minutes = @screen_minutes
          WHERE id = @id`,
      ).run({ ...values, id });
    } else {
      db.prepare(
        `INSERT INTO rewards (title, details, cost_points, cost_money_cents, child_id, stock, screen_minutes)
         VALUES (@title, @details, @cost_points, @cost_money_cents, @child_id, @stock, @screen_minutes)`,
      ).run(values);
    }

    refresh();
    return ok(id > 0 ? "Reward updated" : "Reward added");
  });
}

export async function setRewardActive(form: FormData): Promise<void> {
  await requireParent();
  getDb()
    .prepare("UPDATE rewards SET active = ? WHERE id = ?")
    .run(form.get("active") === "1" ? 1 : 0, Number(form.get("id")));
  refresh();
}

export async function deleteReward(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM rewards WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

/**
 * A child asks to spend on a reward. The cost is checked here and again on
 * approval, and only charged once the parent says yes.
 */
export async function requestRedemption(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const rewardId = int(form, "rewardId", { min: 1 });
    const childId = int(form, "childId", { min: 1 });
    const note = str(form, "note", { max: 300 });
    const actor = await requireSelfOrParent(childId);

    const reward = getReward(rewardId);
    if (!reward || !reward.active) throw new ValidationError("That reward is not available");
    if (reward.child_id !== null && reward.child_id !== childId) {
      throw new ValidationError("That reward is not for this child");
    }
    if (reward.stock !== null && reward.stock <= 0) throw new ValidationError("That reward is sold out");

    const balance = wallet(childId);
    if (balance.points < reward.cost_points) throw new ValidationError("Not enough points yet");
    if (balance.spendable_cents < reward.cost_money_cents) throw new ValidationError("Not enough pocket money yet");

    // A parent redeeming on the child's behalf does not need to approve themselves.
    const immediate = actor.role === "PARENT";

    transaction(() => {
      const info = getDb()
        .prepare(
          `INSERT INTO redemptions (reward_id, reward_title, child_id, cost_points, cost_money_cents,
                                    child_note, status, decided_at, decided_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          reward.id,
          reward.title,
          childId,
          reward.cost_points,
          reward.cost_money_cents,
          note,
          immediate ? "APPROVED" : "REQUESTED",
          immediate ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
          immediate ? actor.id : null,
        );

      if (immediate) {
        chargeForRedemption(
          {
            id: Number(info.lastInsertRowid),
            reward_id: reward.id,
            reward_title: reward.title,
            child_id: childId,
            cost_points: reward.cost_points,
            cost_money_cents: reward.cost_money_cents,
          },
          actor.id,
        );
      }
    });

    refresh();
    return ok(actor.role === "PARENT" ? `Redeemed: ${reward.title}` : "Sent to your parent for approval");
  });
}

type Chargeable = Pick<
  Redemption,
  "id" | "reward_id" | "reward_title" | "child_id" | "cost_points" | "cost_money_cents"
>;

function chargeForRedemption(redemption: Chargeable, parentId: number): void {
  transaction(() => {
    // A reward can hand over screen time as well as costing points or money.
    const reward = redemption.reward_id === null ? null : getReward(redemption.reward_id);
    if (reward && reward.screen_minutes > 0) {
      grantRewardScreenTime({
        childId: redemption.child_id,
        minutes: reward.screen_minutes,
        rewardTitle: redemption.reward_title,
        redemptionId: redemption.id,
        date: nowIn(getSettings().timezone).date,
        createdBy: parentId,
      });
    }

    postBoth({
      childId: redemption.child_id,
      points: -redemption.cost_points,
      moneyCents: -redemption.cost_money_cents,
      reason: `Reward: ${redemption.reward_title}`,
      source: "REWARD",
      sourceId: redemption.id,
      createdBy: parentId,
    });
    if (redemption.reward_id !== null) {
      getDb()
        .prepare("UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock IS NOT NULL AND stock > 0")
        .run(redemption.reward_id);
    }
  });
}

export async function decideRedemption(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const id = int(form, "id", { min: 1 });
    const approve = String(form.get("decision")) === "approve";
    const note = str(form, "note", { max: 300 });

    const redemption = getDb().prepare("SELECT * FROM redemptions WHERE id = ?").get(id) as Redemption | undefined;
    if (!redemption || redemption.status !== "REQUESTED") throw new ValidationError("Already decided");

    if (!approve) {
      getDb()
        .prepare(
          "UPDATE redemptions SET status = 'DENIED', parent_note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ?",
        )
        .run(note, parent.id, id);
      refresh();
      return ok("Declined");
    }

    const balance = wallet(redemption.child_id);
    if (balance.points < redemption.cost_points) throw new ValidationError("They no longer have enough points");
    if (balance.spendable_cents < redemption.cost_money_cents) {
      throw new ValidationError("They no longer have enough pocket money");
    }

    transaction(() => {
      getDb()
        .prepare(
          "UPDATE redemptions SET status = 'APPROVED', parent_note = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ? AND status = 'REQUESTED'",
        )
        .run(note, parent.id, id);
      chargeForRedemption(redemption, parent.id);
    });

    refresh();
    return ok(`Approved: ${redemption.reward_title}`);
  });
}

export async function cancelRedemption(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const redemption = getDb().prepare("SELECT * FROM redemptions WHERE id = ?").get(id) as Redemption | undefined;
  if (!redemption) return;
  await requireSelfOrParent(redemption.child_id);

  getDb().prepare("UPDATE redemptions SET status = 'CANCELLED' WHERE id = ? AND status = 'REQUESTED'").run(id);
  refresh();
}
