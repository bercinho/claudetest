"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, getSettings, transaction } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { post } from "@/lib/ledger";
import { getGrade, getSubject, getTerm } from "@/lib/queries";
import * as notify from "@/lib/notify";
import {
  type ActionState,
  guard,
  int,
  ok,
  oneOf,
  optionalDate,
  str,
  ValidationError,
} from "@/lib/form";

const GRADE_KINDS = ["TEST", "ORAL", "HOMEWORK", "PROJECT", "EXAM", "OTHER"] as const;

function refresh(): void {
  for (const path of ["/", "/school", "/approvals", "/week", "/activity"]) revalidatePath(path);
}

function decimal(form: FormData, key: string, label: string): number {
  const raw = str(form, key, { required: true }).replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ValidationError(`${label} must be a number`);
  return value;
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

export async function saveTerm(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const id = int(form, "id", { fallback: 0 });
    const name = str(form, "name", { required: true, max: 60 });
    const start = optionalDate(form, "startDate");
    const end = optionalDate(form, "endDate");

    if (!start || !end) throw new ValidationError("A term needs a start and an end date");
    if (end < start) throw new ValidationError("The term cannot end before it starts");

    const db = getDb();
    if (id > 0) {
      db.prepare("UPDATE terms SET name = ?, start_date = ?, end_date = ? WHERE id = ?").run(name, start, end, id);
    } else {
      db.prepare("INSERT INTO terms (name, start_date, end_date) VALUES (?, ?, ?)").run(name, start, end);
    }

    refresh();
    return ok(id > 0 ? "Term updated" : `Term "${name}" created`);
  });
}

export async function setTermActive(form: FormData): Promise<void> {
  await requireParent();
  getDb()
    .prepare("UPDATE terms SET active = ? WHERE id = ?")
    .run(form.get("active") === "1" ? 1 : 0, Number(form.get("id")));
  refresh();
}

export async function deleteTerm(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM terms WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

export async function saveSubject(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const id = int(form, "id", { fallback: 0 });
    const values = {
      term_id: int(form, "termId", { min: 1 }),
      child_id: int(form, "childId", { min: 1 }),
      name: str(form, "name", { required: true, max: 60 }),
      teacher: str(form, "teacher", { max: 60 }),
      emoji: str(form, "emoji", { max: 8 }) || "📘",
    };

    if (!getTerm(values.term_id)) throw new ValidationError("Pick a term first");

    const db = getDb();
    if (id > 0) {
      db.prepare("UPDATE subjects SET name = @name, teacher = @teacher, emoji = @emoji, child_id = @child_id WHERE id = @id").run(
        { ...values, id },
      );
    } else {
      db.prepare(
        "INSERT INTO subjects (term_id, child_id, name, teacher, emoji) VALUES (@term_id, @child_id, @name, @teacher, @emoji)",
      ).run(values);
    }

    refresh();
    return ok(id > 0 ? "Subject updated" : `${values.name} added`);
  });
}

export async function setSubjectActive(form: FormData): Promise<void> {
  await requireParent();
  getDb()
    .prepare("UPDATE subjects SET active = ? WHERE id = ?")
    .run(form.get("active") === "1" ? 1 : 0, Number(form.get("id")));
  refresh();
}

export async function deleteSubject(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM subjects WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * Records a mark. A parent's entry counts immediately and can carry points; a
 * child's entry waits for a parent to confirm it, which is where points are
 * decided.
 */
export async function saveGrade(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const subjectId = int(form, "subjectId", { min: 1 });
    const subject = getSubject(subjectId);
    if (!subject) throw new ValidationError("That subject no longer exists");

    const actor = await requireSelfOrParent(subject.child_id);
    const settings = getSettings();
    const isParent = actor.role === "PARENT";

    const outOf = decimal(form, "outOf", "Out of");
    const value = decimal(form, "value", "Mark");
    if (outOf <= 0) throw new ValidationError("“Out of” must be greater than zero");
    if (value < 0 || value > outOf) throw new ValidationError(`The mark must be between 0 and ${outOf}`);

    const values = {
      subject_id: subjectId,
      child_id: subject.child_id,
      title: str(form, "title", { max: 80 }),
      kind: oneOf(form, "kind", GRADE_KINDS, "TEST"),
      value,
      out_of: outOf,
      weight: int(form, "weight", { min: 1, max: 10, fallback: 1 }),
      date: optionalDate(form, "date") ?? nowIn(settings.timezone).date,
      note: str(form, "note", { max: 300 }),
      recorded_by: actor.id,
      confirmed: isParent ? 1 : 0,
      confirmed_by: isParent ? actor.id : null,
    };

    const points = isParent ? int(form, "points", { min: -1000, max: 1000, fallback: 0 }) : 0;

    transaction(() => {
      const info = getDb()
        .prepare(
          `INSERT INTO grades (subject_id, child_id, title, kind, value, out_of, weight, date, note,
                               recorded_by, confirmed, confirmed_by, confirmed_at)
           VALUES (@subject_id, @child_id, @title, @kind, @value, @out_of, @weight, @date, @note,
                   @recorded_by, @confirmed, @confirmed_by, CASE WHEN @confirmed = 1 THEN datetime('now') END)`,
        )
        .run(values);

      if (points !== 0) {
        post({
          childId: subject.child_id,
          currency: "POINTS",
          amount: points,
          reason: `${subject.name}: ${values.value}/${values.out_of}${values.title ? ` — ${values.title}` : ""}`,
          source: "GRADE",
          sourceId: Number(info.lastInsertRowid),
          createdBy: actor.id,
        });
      }
    });

    if (!isParent) notify.gradeEntered(subject.child_id, subject.name, `${value}/${outOf}`);

    refresh();
    return ok(isParent ? "Mark recorded" : "Sent to your parent to confirm");
  });
}

export async function confirmGrade(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const parent = await requireParent();
    const id = int(form, "id", { min: 1 });
    const grade = getGrade(id);
    if (!grade) throw new ValidationError("That mark no longer exists");
    if (grade.confirmed === 1) throw new ValidationError("Already confirmed");

    const points = int(form, "points", { min: -1000, max: 1000, fallback: 0 });
    const subject = getSubject(grade.subject_id);

    transaction(() => {
      getDb()
        .prepare(
          "UPDATE grades SET confirmed = 1, confirmed_by = ?, confirmed_at = datetime('now') WHERE id = ? AND confirmed = 0",
        )
        .run(parent.id, id);

      if (points !== 0) {
        post({
          childId: grade.child_id,
          currency: "POINTS",
          amount: points,
          reason: `${subject?.name ?? "School"}: ${grade.value}/${grade.out_of}${grade.title ? ` — ${grade.title}` : ""}`,
          source: "GRADE",
          sourceId: id,
          createdBy: parent.id,
        });
      }
    });

    notify.gradeConfirmed(grade.child_id, subject?.name ?? "School", points);
    refresh();
    return ok("Mark confirmed");
  });
}

export async function deleteGrade(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const grade = getGrade(id);
  if (!grade) return;

  // A child may withdraw a mark they entered while it is still unconfirmed.
  const actor = await requireSelfOrParent(grade.child_id);
  if (actor.role !== "PARENT" && grade.confirmed === 1) return;

  getDb().prepare("DELETE FROM grades WHERE id = ?").run(id);
  refresh();
}
