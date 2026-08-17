"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, transaction } from "@/lib/db";
import { post } from "@/lib/ledger";
import { type ActionState, guard, int, money, ok, oneOf, str, ValidationError } from "@/lib/form";
import type { FamilyRequest } from "@/lib/types";

const KINDS = ["MONEY", "PERMISSION", "PURCHASE", "SCREEN_TIME", "OTHER"] as const;

function refresh(): void {
  for (const path of ["/", "/requests", "/approvals", "/activity", "/money"]) revalidatePath(path);
}

export async function createRequest(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const childId = int(form, "childId", { min: 1 });
    await requireSelfOrParent(childId);

    const kind = oneOf(form, "kind", KINDS);
    const amount = kind === "MONEY" ? money(form, "amount", { min: 0 }) : 0;
    if (kind === "MONEY" && amount <= 0) throw new ValidationError("Say how much you are asking for");

    getDb()
      .prepare(
        `INSERT INTO requests (child_id, kind, title, details, amount_cents)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(childId, kind, str(form, "title", { required: true, max: 80 }), str(form, "details", { max: 800 }), amount);

    refresh();
    return ok("Request sent");
  });
}

export async function decideRequest(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const id = int(form, "id", { min: 1 });
    const approve = String(form.get("decision")) === "approve";
    const note = str(form, "note", { max: 500 });

    const request = getDb().prepare("SELECT * FROM requests WHERE id = ?").get(id) as FamilyRequest | undefined;
    if (!request || request.status !== "OPEN") throw new ValidationError("Already decided");

    transaction(() => {
      getDb()
        .prepare(
          `UPDATE requests SET status = ?, parent_note = ?, decided_at = datetime('now'), decided_by = ?
            WHERE id = ? AND status = 'OPEN'`,
        )
        .run(approve ? "APPROVED" : "DENIED", note, parent.id, id);

      if (approve && request.kind === "MONEY" && request.amount_cents > 0) {
        post({
          childId: request.child_id,
          currency: "MONEY",
          amount: request.amount_cents,
          reason: `Request granted: ${request.title}`,
          source: "REQUEST",
          sourceId: id,
          createdBy: parent.id,
        });
      }
    });

    refresh();
    return ok(approve ? "Approved" : "Declined");
  });
}

export async function withdrawRequest(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const request = getDb().prepare("SELECT * FROM requests WHERE id = ?").get(id) as FamilyRequest | undefined;
  if (!request) return;
  await requireSelfOrParent(request.child_id);

  getDb().prepare("UPDATE requests SET status = 'WITHDRAWN' WHERE id = ? AND status = 'OPEN'").run(id);
  refresh();
}
