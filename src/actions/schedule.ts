"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, getSettings } from "@/lib/db";
import { nowIn } from "@/lib/dates";
import { getEvent } from "@/lib/queries";
import { materializeSchedule } from "@/lib/scheduler";
import {
  type ActionState,
  guard,
  int,
  ok,
  oneOf,
  optionalDate,
  str,
  time,
  ValidationError,
} from "@/lib/form";

const SLOT_KINDS = ["LESSON", "TRAINING", "OTHER"] as const;
const EVENT_KINDS = ["LESSON", "TRAINING", "EXAM", "MATCH", "TOURNAMENT", "OTHER"] as const;
const ATTENDANCE = ["PLANNED", "PRESENT", "ABSENT", "EXCUSED", "CANCELLED"] as const;

function refresh(): void {
  for (const path of ["/", "/week", "/school", "/sport"]) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Weekly slots (the things that repeat)
// ---------------------------------------------------------------------------

export async function saveSlot(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const settings = getSettings();
    const today = nowIn(settings.timezone).date;
    const id = int(form, "id", { fallback: 0 });

    const subjectId = int(form, "subjectId", { min: 0, fallback: 0 });
    const termId = int(form, "termId", { min: 0, fallback: 0 });
    const startTime = time(form, "startTime", "08:00");
    const endTime = time(form, "endTime", "08:45");
    if (endTime <= startTime) throw new ValidationError("The end time must be after the start time");

    const values = {
      child_id: int(form, "childId", { min: 1 }),
      kind: oneOf(form, "kind", SLOT_KINDS),
      subject_id: subjectId === 0 ? null : subjectId,
      term_id: termId === 0 ? null : termId,
      title: str(form, "title", { required: true, max: 80 }),
      day_of_week: int(form, "dayOfWeek", { min: 1, max: 7 }),
      start_time: startTime,
      end_time: endTime,
      location: str(form, "location", { max: 80 }),
      note: str(form, "note", { max: 300 }),
      start_date: optionalDate(form, "startDate") ?? today,
      end_date: optionalDate(form, "endDate"),
    };

    if (values.end_date && values.end_date < values.start_date) {
      throw new ValidationError("The end date cannot be before the start date");
    }

    const db = getDb();
    if (id > 0) {
      db.prepare(
        `UPDATE schedule_slots
            SET child_id = @child_id, kind = @kind, subject_id = @subject_id, term_id = @term_id,
                title = @title, day_of_week = @day_of_week, start_time = @start_time, end_time = @end_time,
                location = @location, note = @note, start_date = @start_date, end_date = @end_date
          WHERE id = @id`,
      ).run({ ...values, id });

      // Regenerate the untouched future; anything already recorded stays put.
      db.prepare(
        "DELETE FROM schedule_events WHERE slot_id = ? AND date > ? AND attendance = 'PLANNED'",
      ).run(id, today);
    } else {
      db.prepare(
        `INSERT INTO schedule_slots (child_id, kind, subject_id, term_id, title, day_of_week, start_time,
                                     end_time, location, note, start_date, end_date)
         VALUES (@child_id, @kind, @subject_id, @term_id, @title, @day_of_week, @start_time,
                 @end_time, @location, @note, @start_date, @end_date)`,
      ).run(values);
    }

    materializeSchedule(today);
    refresh();
    return ok(id > 0 ? "Updated" : `${values.title} added to the week`);
  });
}

export async function setSlotActive(form: FormData): Promise<void> {
  await requireParent();
  const id = Number(form.get("id"));
  const active = form.get("active") === "1" ? 1 : 0;
  const today = nowIn(getSettings().timezone).date;

  getDb().prepare("UPDATE schedule_slots SET active = ? WHERE id = ?").run(active, id);
  if (!active) {
    getDb()
      .prepare("DELETE FROM schedule_events WHERE slot_id = ? AND date >= ? AND attendance = 'PLANNED'")
      .run(id, today);
  } else {
    materializeSchedule(today);
  }
  refresh();
}

export async function deleteSlot(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM schedule_slots WHERE id = ?").run(Number(form.get("id")));
  refresh();
}

// ---------------------------------------------------------------------------
// One-off events: exams, matches, tournaments, extra sessions
// ---------------------------------------------------------------------------

/**
 * A parent may remove anything from the calendar. A child may only take back a
 * one-off they added themselves — they cannot make an exam or a training
 * session disappear.
 */
function mayRemove(event: { slot_id: number | null; created_by: number | null }, actor: { id: number; role: string }) {
  return actor.role === "PARENT" || (event.slot_id === null && event.created_by === actor.id);
}

export async function saveEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const childId = int(form, "childId", { min: 1 });
    const actor = await requireSelfOrParent(childId);
    const settings = getSettings();

    const id = int(form, "id", { fallback: 0 });
    const subjectId = int(form, "subjectId", { min: 0, fallback: 0 });
    const startTime = time(form, "startTime", "08:00");
    const endTime = time(form, "endTime", startTime);
    if (endTime < startTime) throw new ValidationError("The end time must be after the start time");

    const values = {
      child_id: childId,
      kind: oneOf(form, "kind", EVENT_KINDS),
      subject_id: subjectId === 0 ? null : subjectId,
      title: str(form, "title", { required: true, max: 80 }),
      date: optionalDate(form, "date") ?? nowIn(settings.timezone).date,
      start_time: startTime,
      end_time: endTime,
      location: str(form, "location", { max: 80 }),
      note: str(form, "note", { max: 500 }),
    };

    const db = getDb();
    if (id > 0) {
      const existing = getEvent(id);
      if (!existing) throw new ValidationError("That entry no longer exists");
      const owner = await requireSelfOrParent(existing.child_id);
      if (!mayRemove(existing, owner)) throw new ValidationError("Only a parent can change that entry");
      db.prepare(
        `UPDATE schedule_events
            SET kind = @kind, subject_id = @subject_id, title = @title, date = @date,
                start_time = @start_time, end_time = @end_time, location = @location, note = @note
          WHERE id = @id`,
      ).run({ ...values, id });
    } else {
      db.prepare(
        `INSERT INTO schedule_events (child_id, slot_id, kind, subject_id, title, date, start_time,
                                      end_time, location, note, created_by)
         VALUES (@child_id, NULL, @kind, @subject_id, @title, @date, @start_time, @end_time,
                 @location, @note, @created_by)`,
      ).run({ ...values, created_by: actor.id });
    }

    refresh();
    return ok(id > 0 ? "Updated" : `${values.title} added`);
  });
}

export async function deleteEvent(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const event = getEvent(id);
  if (!event) return;
  const actor = await requireSelfOrParent(event.child_id);
  if (!mayRemove(event, actor)) return;

  // Deleting a generated occurrence would only bring it straight back, so mark
  // it cancelled instead.
  if (event.slot_id !== null) {
    getDb().prepare("UPDATE schedule_events SET attendance = 'CANCELLED' WHERE id = ?").run(id);
  } else {
    getDb().prepare("DELETE FROM schedule_events WHERE id = ?").run(id);
  }
  refresh();
}

/** Marks who turned up. Both the child and a parent may record this. */
export async function setAttendance(form: FormData): Promise<void> {
  const id = Number(form.get("id"));
  const event = getEvent(id);
  if (!event) return;
  await requireSelfOrParent(event.child_id);

  const value = String(form.get("attendance"));
  if (!(ATTENDANCE as readonly string[]).includes(value)) return;

  getDb().prepare("UPDATE schedule_events SET attendance = ? WHERE id = ?").run(value, id);
  refresh();
  revalidatePath("/activity");
}
