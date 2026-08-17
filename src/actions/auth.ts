"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { endSession, hashPin, isValidPin, startSession, verifyPin } from "@/lib/auth";
import { getDb, setSetting } from "@/lib/db";
import { hasAnyUser } from "@/lib/queries";
import { type ActionState, fail, guard, str, ValidationError } from "@/lib/form";

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    const userId = Number(str(form, "userId", { required: true }));
    const pin = str(form, "pin", { required: true });

    const row = getDb()
      .prepare("SELECT id, pin_hash FROM users WHERE id = ? AND active = 1")
      .get(userId) as { id: number; pin_hash: string } | undefined;

    if (!row || !verifyPin(pin, row.pin_hash)) return fail("That PIN does not match");

    await startSession(row.id);
    return null; // success — fall through to the redirect below
  });

  if (result) return result;
  redirect("/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

/** First-run setup: creates the first parent account and names the family. */
export async function completeSetup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    if (hasAnyUser()) return fail("This family is already set up");

    const familyName = str(form, "familyName", { required: true, max: 60 });
    const name = str(form, "name", { required: true, max: 40 });
    const pin = str(form, "pin", { required: true });
    const confirm = str(form, "confirmPin", { required: true });

    if (!isValidPin(pin)) throw new ValidationError("The PIN must be 4–8 digits");
    if (pin !== confirm) throw new ValidationError("The two PINs do not match");

    const info = getDb()
      .prepare("INSERT INTO users (name, role, pin_hash, emoji, color) VALUES (?, 'PARENT', ?, '🧑‍🍼', 'violet')")
      .run(name, hashPin(pin));

    setSetting("family_name", familyName);
    await startSession(Number(info.lastInsertRowid));
    return null;
  });

  if (result) return result;
  revalidatePath("/", "layout");
  redirect("/family");
}
