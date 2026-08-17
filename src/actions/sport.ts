"use server";

import { revalidatePath } from "next/cache";
import { requireParent, requireSelfOrParent } from "@/lib/auth";
import { getDb, transaction } from "@/lib/db";
import { post } from "@/lib/ledger";
import { getEvent } from "@/lib/queries";
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

function refresh(): void {
  for (const path of ["/", "/sport", "/week", "/activity"]) revalidatePath(path);
}

export async function saveSportProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireParent();
    const values = {
      child_id: int(form, "childId", { min: 1 }),
      sport: str(form, "sport", { max: 40 }),
      team: str(form, "team", { max: 60 }),
      coach: str(form, "coach", { max: 60 }),
      level: str(form, "level", { max: 40 }),
      season_start: optionalDate(form, "seasonStart"),
      season_end: optionalDate(form, "seasonEnd"),
      notes: str(form, "notes", { max: 500 }),
    };

    if (values.season_start && values.season_end && values.season_end < values.season_start) {
      throw new ValidationError("The season cannot end before it starts");
    }

    getDb()
      .prepare(
        `INSERT INTO sport_profiles (child_id, sport, team, coach, level, season_start, season_end, notes)
         VALUES (@child_id, @sport, @team, @coach, @level, @season_start, @season_end, @notes)
         ON CONFLICT(child_id) DO UPDATE SET
           sport = excluded.sport, team = excluded.team, coach = excluded.coach, level = excluded.level,
           season_start = excluded.season_start, season_end = excluded.season_end, notes = excluded.notes`,
      )
      .run(values);

    refresh();
    return ok("Sport profile saved");
  });
}

/**
 * Records how a session or match went. Attendance is set at the same time, so
 * one form closes the whole thing off. A parent may attach points.
 */
export async function saveSportReport(_prev: ActionState, form: FormData): Promise<ActionState> {
  return guard(async () => {
    const eventId = int(form, "eventId", { min: 1 });
    const event = getEvent(eventId);
    if (!event) throw new ValidationError("That session no longer exists");

    const actor = await requireSelfOrParent(event.child_id);
    const isParent = actor.role === "PARENT";
    const isMatch = event.kind === "MATCH" || event.kind === "TOURNAMENT";

    const attendance = oneOf(form, "attendance", ["PRESENT", "ABSENT", "EXCUSED", "CANCELLED"] as const, "PRESENT");
    const scoreFor = str(form, "scoreFor") === "" ? null : int(form, "scoreFor", { min: 0, max: 999 });
    const scoreAgainst = str(form, "scoreAgainst") === "" ? null : int(form, "scoreAgainst", { min: 0, max: 999 });
    const ratingRaw = int(form, "coachRating", { min: 0, max: 5, fallback: 0 });

    const outcome =
      isMatch && scoreFor !== null && scoreAgainst !== null
        ? scoreFor > scoreAgainst
          ? "WIN"
          : scoreFor < scoreAgainst
            ? "LOSS"
            : "DRAW"
        : null;

    const values = {
      event_id: eventId,
      opponent: str(form, "opponent", { max: 80 }),
      score_for: scoreFor,
      score_against: scoreAgainst,
      outcome,
      goals: int(form, "goals", { min: 0, max: 999, fallback: 0 }),
      assists: int(form, "assists", { min: 0, max: 999, fallback: 0 }),
      minutes: int(form, "minutes", { min: 0, max: 600, fallback: 0 }),
      coach_rating: ratingRaw === 0 ? null : ratingRaw,
      coach_feedback: str(form, "coachFeedback", { max: 1000 }),
      own_note: str(form, "ownNote", { max: 1000 }),
      recorded_by: actor.id,
    };

    const points = isParent ? int(form, "points", { min: -1000, max: 1000, fallback: 0 }) : 0;

    transaction(() => {
      getDb()
        .prepare(
          `INSERT INTO sport_reports (event_id, opponent, score_for, score_against, outcome, goals, assists,
                                      minutes, coach_rating, coach_feedback, own_note, recorded_by)
           VALUES (@event_id, @opponent, @score_for, @score_against, @outcome, @goals, @assists,
                   @minutes, @coach_rating, @coach_feedback, @own_note, @recorded_by)
           ON CONFLICT(event_id) DO UPDATE SET
             opponent = excluded.opponent, score_for = excluded.score_for,
             score_against = excluded.score_against, outcome = excluded.outcome,
             goals = excluded.goals, assists = excluded.assists, minutes = excluded.minutes,
             coach_rating = excluded.coach_rating, coach_feedback = excluded.coach_feedback,
             own_note = excluded.own_note, recorded_by = excluded.recorded_by`,
        )
        .run(values);

      getDb().prepare("UPDATE schedule_events SET attendance = ? WHERE id = ?").run(attendance, eventId);

      if (points !== 0) {
        post({
          childId: event.child_id,
          currency: "POINTS",
          amount: points,
          reason: `${event.title} (${event.date})`,
          source: "SPORT",
          sourceId: eventId,
          createdBy: actor.id,
        });
      }
    });

    refresh();
    return ok("Session recorded");
  });
}

export async function deleteSportReport(form: FormData): Promise<void> {
  await requireParent();
  getDb().prepare("DELETE FROM sport_reports WHERE event_id = ?").run(Number(form.get("eventId")));
  refresh();
}
