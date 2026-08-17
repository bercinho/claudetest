import Link from "next/link";
import { saveSportProfile, saveSportReport } from "@/actions/sport";
import { ActionForm, SubmitButton } from "@/components/forms";
import { EventRow } from "@/components/schedule";
import { Disclosure, EmptyState, PageHeader, Pill, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { addDays, humanDate, nowIn } from "@/lib/dates";
import { EVENT_KIND } from "@/lib/labels";
import {
  SPORT_KINDS,
  eventsBetween,
  getSportProfile,
  getSportReport,
  listChildren,
  recentSportReports,
  sportEventsAwaitingRecord,
  sportStats,
} from "@/lib/queries";
import type { ScheduleEventView, SportProfile, User } from "@/lib/types";

export default async function SportPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser();
  const settings = getSettings();
  const { date: today, time: now } = nowIn(settings.timezone);
  const params = await searchParams;

  const isParent = user.role === "PARENT";
  const children = listChildren();
  const child = isParent ? children.find((c) => c.id === Number(params.child)) ?? children[0] : (user as User);

  if (!child) {
    return (
      <>
        <PageHeader title="Sport" />
        <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>
      </>
    );
  }

  const profile = getSportProfile(child.id);
  const seasonStart = profile?.season_start ?? addDays(today, -365);
  const seasonEnd = profile?.season_end ?? addDays(today, 365);
  const stats = sportStats(child.id, seasonStart, seasonEnd);

  const upcoming = eventsBetween(today, addDays(today, 21), {
    childId: child.id,
    kinds: [...SPORT_KINDS],
  })
    .filter((event) => event.date > today || event.end_time >= now)
    .slice(0, 10);

  const toRecord = sportEventsAwaitingRecord(today, now, child.id);
  const reports = recentSportReports(child.id, 15);

  const attendanceRate =
    stats.attended + stats.missed > 0 ? Math.round((stats.attended / (stats.attended + stats.missed)) * 100) : null;

  return (
    <>
      <PageHeader
        title={profile?.sport ? profile.sport : "Sport"}
        subtitle={
          profile && (profile.team || profile.coach)
            ? [profile.team, profile.level, profile.coach && `coach ${profile.coach}`].filter(Boolean).join(" · ")
            : "Training, matches, results and coach feedback."
        }
      />

      {isParent && children.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {children.map((option) => (
            <Link
              key={option.id}
              href={`/sport?child=${option.id}`}
              className={`btn btn-sm ${option.id === child.id ? "btn-primary" : "btn-quiet"}`}
            >
              {option.emoji} {option.name}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Turned up"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          hint={`${stats.attended} of ${stats.attended + stats.missed} sessions`}
        />
        <Stat label="Record" value={`${stats.wins}–${stats.draws}–${stats.losses}`} hint="win / draw / loss" />
        <Stat label="Goals" value={stats.goals} hint={stats.assists > 0 ? `${stats.assists} assists` : undefined} />
        <Stat
          label="Coach rating"
          value={stats.averageRating === null ? "—" : `${stats.averageRating}/5`}
          hint="season average"
        />
      </div>

      {isParent && (
        <Section title="Setup">
          <Disclosure label="⚙️ Sport, team and season">
            <ProfileForm child={child} profile={profile} today={today} />
          </Disclosure>
          <p className="mt-2 text-xs text-ink-muted">
            Regular training goes in the{" "}
            <Link href={`/week?child=${child.id}`} className="font-semibold text-accent">
              weekly timetable
            </Link>
            ; matches and tournaments are added there as one-offs.
          </p>
        </Section>
      )}

      <Section title="Waiting to be recorded" count={toRecord.length}>
        {toRecord.length === 0 ? (
          <EmptyState icon="✅">Everything that has happened is written up.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {toRecord.map((event) => (
              <SessionCard key={event.id} event={event} today={today} isParent={isParent} open />
            ))}
          </div>
        )}
      </Section>

      <Section title="Coming up" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <EmptyState icon="🏊">Nothing in the diary for the next three weeks.</EmptyState>
        ) : (
          <ul className="grid gap-1.5">
            {upcoming.map((event) => (
              <EventRow key={event.id} event={event} today={today} now={now} viewer={user} showDate canEdit={false} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Season so far" count={reports.length}>
        {reports.length === 0 ? (
          <EmptyState icon="📊">No sessions written up yet.</EmptyState>
        ) : (
          <div className="grid gap-2">
            {reports.map((report) => (
              <article key={report.event_id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden>{EVENT_KIND[report.kind as keyof typeof EVENT_KIND]?.icon ?? "🏊"}</span>
                  <span className="min-w-0 flex-1 font-medium">{report.title}</span>
                  <span className="text-xs text-ink-muted tabular-nums">{humanDate(report.date, today)}</span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {report.outcome && (
                    <Pill tone={report.outcome === "WIN" ? "good" : report.outcome === "LOSS" ? "bad" : "warn"}>
                      {report.outcome === "WIN" ? "Won" : report.outcome === "LOSS" ? "Lost" : "Drew"}{" "}
                      {report.score_for}–{report.score_against}
                    </Pill>
                  )}
                  {report.opponent && <Pill>vs {report.opponent}</Pill>}
                  {report.goals > 0 && <Pill tone="points">{report.goals} goals</Pill>}
                  {report.assists > 0 && <Pill>{report.assists} assists</Pill>}
                  {report.minutes > 0 && <Pill>{report.minutes} min</Pill>}
                  {report.coach_rating && <Pill tone="good">coach {report.coach_rating}/5</Pill>}
                </div>

                {report.coach_feedback && (
                  <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <span className="font-semibold">Coach:</span> {report.coach_feedback}
                  </p>
                )}
                {report.own_note && <p className="mt-1.5 text-sm italic text-ink-muted">“{report.own_note}”</p>}

                <details className="disclosure mt-2">
                  <summary className="btn btn-ghost btn-sm px-0">Edit write-up</summary>
                  <div className="mt-2">
                    <ReportForm
                      eventId={report.event_id}
                      kind={report.kind}
                      isParent={isParent}
                      existing={{
                        opponent: report.opponent,
                        score_for: report.score_for,
                        score_against: report.score_against,
                        goals: report.goals,
                        assists: report.assists,
                        minutes: report.minutes,
                        coach_rating: report.coach_rating,
                        coach_feedback: report.coach_feedback,
                        own_note: report.own_note,
                        attendance: report.attendance,
                      }}
                    />
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function SessionCard({
  event,
  today,
  isParent,
  open = false,
}: {
  event: ScheduleEventView;
  today: string;
  isParent: boolean;
  open?: boolean;
}) {
  const existing = getSportReport(event.id);

  return (
    <article id={`event-${event.id}`} className="card">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden>{EVENT_KIND[event.kind].icon}</span>
        <span className="min-w-0 flex-1 font-medium">{event.title}</span>
        <span className="text-xs text-ink-muted tabular-nums">
          {humanDate(event.date, today)} {event.start_time}
        </span>
      </div>
      {event.location && <p className="mt-0.5 text-xs text-ink-muted">{event.location}</p>}

      <details className="disclosure mt-3" open={open}>
        <summary className="btn btn-primary btn-sm">{existing ? "Edit write-up" : "Write it up"}</summary>
        <div className="mt-2">
          <ReportForm
            eventId={event.id}
            kind={event.kind}
            isParent={isParent}
            existing={
              existing
                ? { ...existing, attendance: event.attendance }
                : { attendance: "PRESENT" }
            }
          />
        </div>
      </details>
    </article>
  );
}

type ExistingReport = {
  opponent?: string;
  score_for?: number | null;
  score_against?: number | null;
  goals?: number;
  assists?: number;
  minutes?: number;
  coach_rating?: number | null;
  coach_feedback?: string;
  own_note?: string;
  attendance?: string;
};

function ReportForm({
  eventId,
  kind,
  isParent,
  existing,
}: {
  eventId: number;
  kind: string;
  isParent: boolean;
  existing: ExistingReport;
}) {
  const isMatch = kind === "MATCH" || kind === "TOURNAMENT";

  return (
    <ActionForm action={saveSportReport} className="card grid gap-3" onSuccessCollapse>
      <input type="hidden" name="eventId" value={eventId} />

      <div>
        <label className="label" htmlFor={`att-${eventId}`}>
          Attendance
        </label>
        <select
          id={`att-${eventId}`}
          name="attendance"
          className="field"
          defaultValue={existing.attendance === "PLANNED" ? "PRESENT" : existing.attendance ?? "PRESENT"}
        >
          <option value="PRESENT">Was there</option>
          <option value="ABSENT">Missed it</option>
          <option value="EXCUSED">Excused</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {isMatch && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor={`opp-${eventId}`}>
              Opponent
            </label>
            <input
              id={`opp-${eventId}`}
              name="opponent"
              className="field"
              defaultValue={existing.opponent ?? ""}
              maxLength={80}
            />
          </div>
          <div>
            <label className="label" htmlFor={`sf-${eventId}`}>
              Us
            </label>
            <input
              id={`sf-${eventId}`}
              name="scoreFor"
              type="number"
              min={0}
              className="field"
              defaultValue={existing.score_for ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor={`sa-${eventId}`}>
              Them
            </label>
            <input
              id={`sa-${eventId}`}
              name="scoreAgainst"
              type="number"
              min={0}
              className="field"
              defaultValue={existing.score_against ?? ""}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`g-${eventId}`}>
            Goals
          </label>
          <input
            id={`g-${eventId}`}
            name="goals"
            type="number"
            min={0}
            className="field"
            defaultValue={existing.goals ?? 0}
          />
        </div>
        <div>
          <label className="label" htmlFor={`a-${eventId}`}>
            Assists
          </label>
          <input
            id={`a-${eventId}`}
            name="assists"
            type="number"
            min={0}
            className="field"
            defaultValue={existing.assists ?? 0}
          />
        </div>
        <div>
          <label className="label" htmlFor={`m-${eventId}`}>
            Minutes
          </label>
          <input
            id={`m-${eventId}`}
            name="minutes"
            type="number"
            min={0}
            className="field"
            defaultValue={existing.minutes ?? 0}
          />
        </div>
        <div>
          <label className="label" htmlFor={`cr-${eventId}`}>
            Coach 1–5
          </label>
          <input
            id={`cr-${eventId}`}
            name="coachRating"
            type="number"
            min={0}
            max={5}
            className="field"
            defaultValue={existing.coach_rating ?? 0}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`cf-${eventId}`}>
          Feedback from the coach
        </label>
        <textarea
          id={`cf-${eventId}`}
          name="coachFeedback"
          className="field"
          rows={2}
          maxLength={1000}
          defaultValue={existing.coach_feedback ?? ""}
          placeholder="Strong legs today, needs to look up before passing."
        />
      </div>

      <div>
        <label className="label" htmlFor={`on-${eventId}`}>
          His own note
        </label>
        <textarea
          id={`on-${eventId}`}
          name="ownNote"
          className="field"
          rows={2}
          maxLength={1000}
          defaultValue={existing.own_note ?? ""}
        />
      </div>

      {isParent && (
        <div className="w-32">
          <label className="label" htmlFor={`pts-${eventId}`}>
            Points to award
          </label>
          <input id={`pts-${eventId}`} name="points" type="number" className="field" defaultValue={0} />
        </div>
      )}

      <div>
        <SubmitButton pendingLabel="Saving…">Save write-up</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ProfileForm({ child, profile, today }: { child: User; profile: SportProfile | null; today: string }) {
  return (
    <ActionForm action={saveSportProfile} className="card grid gap-3">
      <input type="hidden" name="childId" value={child.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sp-sport">
            Sport
          </label>
          <input
            id="sp-sport"
            name="sport"
            className="field"
            defaultValue={profile?.sport ?? "Waterpolo"}
            maxLength={40}
          />
        </div>
        <div>
          <label className="label" htmlFor="sp-team">
            Club or team
          </label>
          <input id="sp-team" name="team" className="field" defaultValue={profile?.team ?? ""} maxLength={60} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sp-coach">
            Coach
          </label>
          <input id="sp-coach" name="coach" className="field" defaultValue={profile?.coach ?? ""} maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="sp-level">
            Level
          </label>
          <input
            id="sp-level"
            name="level"
            className="field"
            defaultValue={profile?.level ?? ""}
            placeholder="Semi-pro, U16"
            maxLength={40}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="sp-from">
            Season starts
          </label>
          <input
            id="sp-from"
            name="seasonStart"
            type="date"
            className="field"
            defaultValue={profile?.season_start ?? today}
          />
        </div>
        <div>
          <label className="label" htmlFor="sp-to">
            Season ends
          </label>
          <input id="sp-to" name="seasonEnd" type="date" className="field" defaultValue={profile?.season_end ?? ""} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="sp-notes">
          Notes
        </label>
        <textarea
          id="sp-notes"
          name="notes"
          className="field"
          rows={2}
          maxLength={500}
          defaultValue={profile?.notes ?? ""}
        />
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </ActionForm>
  );
}
