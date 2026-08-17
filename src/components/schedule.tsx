import Link from "next/link";
import { deleteEvent, setAttendance } from "@/actions/schedule";
import { ConfirmSubmit } from "@/components/forms";
import { Pill } from "@/components/ui";
import { humanDate } from "@/lib/dates";
import { ATTENDANCE, EVENT_KIND, needsAttendance } from "@/lib/labels";
import type { Role, ScheduleEventView } from "@/lib/types";

export type Viewer = { id: number; role: Role };

const KIND_ACCENT: Record<string, string> = {
  LESSON: "border-l-sky-400",
  EXAM: "border-l-rose-400",
  TRAINING: "border-l-teal-400",
  MATCH: "border-l-violet-400",
  TOURNAMENT: "border-l-amber-400",
  OTHER: "border-l-slate-400",
};

export function EventRow({
  event,
  today,
  now,
  viewer,
  showChild = false,
  showDate = false,
  canEdit = true,
}: {
  event: ScheduleEventView;
  today: string;
  viewer: Viewer;
  /** Local HH:MM. Without it, tonight's training would be asked about this morning. */
  now: string;
  showChild?: boolean;
  /** Set when the row is not already inside a single day's column. */
  showDate?: boolean;
  canEdit?: boolean;
}) {
  const kind = EVENT_KIND[event.kind];
  const attendance = ATTENDANCE[event.attendance];
  const finished = event.date < today || (event.date === today && event.end_time <= now);
  const cancelled = event.attendance === "CANCELLED";
  const wantsAttendance = needsAttendance(event.kind) && finished && event.attendance === "PLANNED";
  // A child can only take back a one-off they added themselves.
  const mayRemove =
    canEdit && !cancelled && (viewer.role === "PARENT" || (event.slot_id === null && event.created_by === viewer.id));

  return (
    <li
      className={`card-tight border-l-4 px-3 py-2 ${KIND_ACCENT[event.kind] ?? KIND_ACCENT.OTHER} ${
        cancelled ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5">
          {event.subject_emoji && event.kind === "LESSON" ? event.subject_emoji : kind.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${cancelled ? "line-through" : ""}`}>{event.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            {showDate && <span className="font-medium text-ink">{humanDate(event.date, today)}</span>}
            <span className="tabular-nums">
              {event.start_time}
              {event.end_time !== event.start_time && `–${event.end_time}`}
            </span>
            {showChild && (
              <span>
                {event.child_emoji} {event.child_name}
              </span>
            )}
            {event.location && <span>· {event.location}</span>}
            {event.attendance !== "PLANNED" && <Pill tone={attendance.tone}>{attendance.label}</Pill>}
            {event.has_report > 0 && <Pill tone="good">recorded</Pill>}
          </div>
          {event.note && <p className="mt-1 text-xs text-ink-muted">{event.note}</p>}
        </div>

        {mayRemove && (
          <form action={deleteEvent} className="shrink-0">
            <input type="hidden" name="id" value={event.id} />
            <ConfirmSubmit
              variant="ghost"
              message={
                event.slot_id === null
                  ? `Remove "${event.title}"?`
                  : `Cancel "${event.title}" on ${event.date}? The weekly slot stays.`
              }
            >
              ✕
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {wantsAttendance && canEdit && (
        <form action={setAttendance} className="mt-2 flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="id" value={event.id} />
          <span className="text-xs text-ink-muted">Were you there?</span>
          <button type="submit" name="attendance" value="PRESENT" className="btn btn-good btn-sm">
            Yes
          </button>
          <button type="submit" name="attendance" value="ABSENT" className="btn btn-bad btn-sm">
            No
          </button>
          <button type="submit" name="attendance" value="EXCUSED" className="btn btn-quiet btn-sm">
            Excused
          </button>
          {EVENT_KIND[event.kind].sport && (
            <Link href={`/sport#event-${event.id}`} className="btn btn-quiet btn-sm">
              Record it
            </Link>
          )}
        </form>
      )}
    </li>
  );
}

export function DayCard({
  date,
  label,
  events,
  today,
  now,
  viewer,
  showChild = false,
  canEdit = true,
}: {
  date: string;
  label: string;
  events: ScheduleEventView[];
  today: string;
  now: string;
  viewer: Viewer;
  showChild?: boolean;
  canEdit?: boolean;
}) {
  const isToday = date === today;

  return (
    <div className={`card ${isToday ? "border-accent/50 bg-accent-soft/40" : ""}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className={`text-sm font-bold ${isToday ? "text-accent" : ""}`}>{label}</h3>
        <span className="text-xs text-ink-muted tabular-nums">{date.slice(5)}</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-ink-muted">Nothing planned.</p>
      ) : (
        <ul className="grid gap-1.5">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              today={today}
              now={now}
              viewer={viewer}
              showChild={showChild}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
