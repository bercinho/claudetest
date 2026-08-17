"use server";

import { revalidatePath } from "next/cache";
import { hashPin, isValidPin, requireParent, requireUser, verifyPin } from "@/lib/auth";
import { getDb, setSetting } from "@/lib/db";
import { getUser } from "@/lib/queries";
import { type ActionState, guard, int, money, ok, oneOf, str, ValidationError } from "@/lib/form";

const COLORS = ["sky", "violet", "emerald", "amber", "rose", "teal"] as const;

function refresh(): void {
  revalidatePath("/", "layout");
}

export async function saveMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const id = int(form, "id", { fallback: 0 });
    const name = str(form, "name", { required: true, max: 40 });
    const role = oneOf(form, "role", ["PARENT", "CHILD"] as const);
    const emoji = str(form, "emoji", { max: 8 }) || (role === "PARENT" ? "🧑‍🍼" : "🧒");
    const color = oneOf(form, "color", COLORS, "sky");

    const db = getDb();
    if (id > 0) {
      const existing = getUser(id);
      if (!existing) throw new ValidationError("That family member no longer exists");
      if (existing.role === "PARENT" && role === "CHILD" && countParents() <= 1) {
        throw new ValidationError("There must always be at least one parent");
      }
      db.prepare("UPDATE users SET name = ?, role = ?, emoji = ?, color = ? WHERE id = ?").run(
        name,
        role,
        emoji,
        color,
        id,
      );
      refresh();
      return ok("Profile updated");
    }

    const pin = str(form, "pin", { required: true });
    if (!isValidPin(pin)) throw new ValidationError("The PIN must be 4–8 digits");

    const info = db
      .prepare("INSERT INTO users (name, role, pin_hash, emoji, color) VALUES (?, ?, ?, ?, ?)")
      .run(name, role, hashPin(pin), emoji, color);

    if (role === "CHILD") {
      // Give every child a pocket-money row so the settings page has something to edit.
      db.prepare("INSERT OR IGNORE INTO allowances (child_id, base_cents, active) VALUES (?, ?, 0)").run(
        Number(info.lastInsertRowid),
        money(form, "allowance", { min: 0 }),
      );
    }

    refresh();
    return ok(`${name} added`);
  });
}

function countParents(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'PARENT' AND active = 1").get() as { n: number })
    .n;
}

export async function changePin(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const actor = await requireUser();
    const targetId = int(form, "id", { min: 1 });
    const target = getUser(targetId);
    if (!target) throw new ValidationError("That family member no longer exists");

    // Anyone can change their own PIN if they know it; a parent can reset a child's.
    const isSelf = actor.id === targetId;
    const parentResettingChild = actor.role === "PARENT" && target.role === "CHILD";
    if (!isSelf && !parentResettingChild) throw new ValidationError("You cannot change that PIN");

    const newPin = str(form, "newPin", { required: true });
    if (!isValidPin(newPin)) throw new ValidationError("The PIN must be 4–8 digits");
    if (newPin !== str(form, "confirmPin", { required: true })) throw new ValidationError("The two PINs do not match");

    if (isSelf) {
      const stored = getDb().prepare("SELECT pin_hash FROM users WHERE id = ?").get(actor.id) as { pin_hash: string };
      if (!verifyPin(str(form, "currentPin", { required: true }), stored.pin_hash)) {
        throw new ValidationError("Your current PIN is not right");
      }
    }

    getDb().prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(hashPin(newPin), targetId);
    refresh();
    return ok("PIN updated");
  });
}

export async function setMemberActive(form: FormData): Promise<void> {
  await requireParent();
  const id = Number(form.get("id"));
  const active = form.get("active") === "1" ? 1 : 0;

  const target = getUser(id);
  if (!target) return;
  if (!active && target.role === "PARENT" && countParents() <= 1) return;

  getDb().prepare("UPDATE users SET active = ? WHERE id = ?").run(active, id);
  refresh();
}

export async function saveSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();

    setSetting("family_name", str(form, "familyName", { required: true, max: 60 }));
    setSetting("currency_symbol", str(form, "currencySymbol", { required: true, max: 4 }));
    setSetting("currency_position", oneOf(form, "currencyPosition", ["before", "after"] as const, "before"));
    setSetting("points_label", str(form, "pointsLabel", { required: true, max: 20 }));

    const gradeMin = int(form, "gradeMin", { min: 0, max: 100, fallback: 1 });
    const gradeMax = int(form, "gradeMax", { min: 1, max: 100, fallback: 5 });
    if (gradeMax <= gradeMin) throw new ValidationError("The best mark must be higher than the worst one");
    setSetting("grade_min", String(gradeMin));
    setSetting("grade_max", String(gradeMax));
    setSetting("grade_best_is_high", oneOf(form, "gradeDirection", ["true", "false"] as const, "true"));

    const timezone = str(form, "timezone", { required: true, max: 60 });
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new ValidationError(`"${timezone}" is not a known timezone`);
    }
    setSetting("timezone", timezone);

    refresh();
    return ok("Settings saved");
  });
}
