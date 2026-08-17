import Link from "next/link";
import { deleteSlot, saveEvent, saveSlot, setSlotActive } from "@/actions/schedule";
import { ActionForm, ConfirmSubmit, RevealOnValue, SubmitButton } from "@/components/forms";
import { DayCard } from "@/components/schedule";
import { Disclosure, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { addDays, dayNames, fullDate, isoWeekKey, nowIn, startOfWeek, weekdayName } from "@/lib/dates";
import { EVENT_KIND } from "@/lib/labels";
import { currentTerm, eventsBetween, listChildren, listSlots, listSubjects } from "@/lib/queries";
import type { ScheduleSlot, Subject, Term, User } from "@/lib/types";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; child?: string }>;
}) {
  const user = await requireUser();
  const settings = getSettings();
  const { date: today, time: now } = nowIn(settings.timezone);
  const params = await searchParams;

  const children = listChildren();
  const isParent = user.role === "PARENT";

  // A parent looks at one child at a time; a child only ever sees themselves.
  const selectedChild = isParent
    ? children.find((child) => child.id === Number(params.child)) ?? children[0]
    : (user as User);

  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.w ?? "") ? startOfWeek(params.w!) : startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (!selectedChild) {
    return (
      <>
        <PageHeader title="The week" />
        <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>
      </>
    );
  }

  const events = eventsBetween(weekStart, weekEnd, { childId: selectedChild.id });
  const byDate = new Map<string, typeof events>();
  for (const event of events) {
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  const term = currentTerm(today);
  const subjects = term ? listSubjects(term.id, selectedChild.id) : [];
  const slots = listSlots(selectedChild.id, isParent);

  const href = (week: string) =>
    `/week?w=${week}${isParent && children.length > 1 ? `&child=${selectedChild.id}` : ""}`;

  return (
    <>
      <PageHeader
        title="The week"
        subtitle={`${fullDate(weekStart)} – ${fullDate(weekEnd)} · ${isoWeekKey(weekStart)}`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={href(addDays(weekStart, -7))} className="btn btn-quiet btn-sm">
          ← Previous
        </Link>
        <Link href={href(startOfWeek(today))} className="btn btn-quiet btn-sm">
          This week
        </Link>
        <Link href={href(addDays(weekStart, 7))} className="btn btn-quiet btn-sm">
          Next →
        </Link>

        {isParent && children.length > 1 && (
          <div className="ml-auto flex gap-1.5">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/week?w=${weekStart}&child=${child.id}`}
                className={`btn btn-sm ${child.id === selectedChild.id ? "btn-primary" : "btn-quiet"}`}
              >
                {child.emoji} {child.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mb-7 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {days.map((date) => (
          <DayCard
            key={date}
            date={date}
            label={`${weekdayName(date)}${date === today ? " · today" : ""}`}
            events={byDate.get(date) ?? []}
            today={today}
            now={now}
            viewer={user}
          />
        ))}
      </div>

      <Section title="Add something one-off">
        <Disclosure label="+ Exam, match or extra session" tone="primary">
          <EventForm child={selectedChild} subjects={subjects} defaultDate={today} />
        </Disclosure>
      </Section>

      <Section title="Repeats every week" count={slots.filter((slot) => slot.active).length}>
        {isParent && (
          <div className="mb-3">
            <Disclosure label="+ Add a weekly lesson or training">
              <SlotForm child={selectedChild} subjects={subjects} term={term} today={today} />
            </Disclosure>
          </div>
        )}

        {slots.length === 0 ? (
          <EmptyState icon="🗓️">
            Nothing repeats yet. {isParent ? "Add the timetable above." : "Ask a parent to set up the timetable."}
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {dayNames().map((name, index) => {
              const daySlots = slots.filter((slot) => slot.day_of_week === index + 1);
              if (daySlots.length === 0) return null;
              return (
                <div key={name} className="card">
                  <h3 className="mb-2 text-sm font-bold">{name}</h3>
                  <ul className="grid gap-1.5">
                    {daySlots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        isParent={isParent}
                        child={selectedChild}
                        subjects={subjects}
                        term={term}
                        today={today}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

function SlotRow({
  slot,
  isParent,
  child,
  subjects,
  term,
  today,
}: {
  slot: ScheduleSlot;
  isParent: boolean;
  child: User;
  subjects: Subject[];
  term: Term | null;
  today: string;
}) {
  return (
    <li className={`rounded-lg bg-surface-2 px-2.5 py-2 ${slot.active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-2">
        <span aria-hidden>{EVENT_KIND[slot.kind === "OTHER" ? "OTHER" : slot.kind].icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{slot.title}</div>
          <div className="text-xs text-ink-muted tabular-nums">
            {slot.start_time}–{slot.end_time}
            {slot.location && <span className="tracking-normal"> · {slot.location}</span>}
          </div>
          {!slot.active && <Pill tone="warn">paused</Pill>}
        </div>

        {isParent && (
          <div className="flex shrink-0 gap-1">
            <form action={setSlotActive}>
              <input type="hidden" name="id" value={slot.id} />
              <input type="hidden" name="active" value={slot.active ? "0" : "1"} />
              <SubmitButton variant="ghost" size="sm">
                {slot.active ? "Pause" : "Resume"}
              </SubmitButton>
            </form>
            <form action={deleteSlot}>
              <input type="hidden" name="id" value={slot.id} />
              <ConfirmSubmit message={`Delete "${slot.title}" from the weekly timetable?`}>✕</ConfirmSubmit>
            </form>
          </div>
        )}
      </div>

      {isParent && (
        <details className="disclosure mt-1">
          <summary className="btn btn-ghost btn-sm px-0 text-xs">Edit</summary>
          <div className="mt-2">
            <SlotForm slot={slot} child={child} subjects={subjects} term={term} today={today} />
          </div>
        </details>
      )}
    </li>
  );
}

function SlotForm({
  slot,
  child,
  subjects,
  term,
  today,
}: {
  slot?: ScheduleSlot;
  child: User;
  subjects: Subject[];
  term: Term | null;
  today: string;
}) {
  const key = slot?.id ?? "new";
  const kind = slot?.kind ?? "LESSON";

  return (
    <ActionForm action={saveSlot} className="card grid gap-3" resetOnSuccess={!slot} onSuccessCollapse={!slot}>
      {slot && <input type="hidden" name="id" value={slot.id} />}
      <input type="hidden" name="childId" value={child.id} />
      <input type="hidden" name="termId" value={slot?.term_id ?? term?.id ?? 0} />

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="label" htmlFor={`sk-${key}`}>
            What
          </label>
          <select id={`sk-${key}`} name="kind" className="field" defaultValue={kind}>
            <option value="LESSON">Lesson</option>
            <option value="TRAINING">Training</option>
            <option value="OTHER">Something else</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`st-${key}`}>
            Title
          </label>
          <input
            id={`st-${key}`}
            name="title"
            className="field"
            defaultValue={slot?.title ?? ""}
            placeholder="Maths / Waterpolo training"
            maxLength={80}
          />
        </div>
      </div>

      <RevealOnValue name="kind" values={["LESSON"]} initial={kind}>
        <label className="label" htmlFor={`ss-${key}`}>
          Subject (links the lesson to its marks)
        </label>
        <select id={`ss-${key}`} name="subjectId" className="field" defaultValue={slot?.subject_id ?? 0}>
          <option value={0}>Not linked</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.emoji} {subject.name}
            </option>
          ))}
        </select>
      </RevealOnValue>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor={`sd-${key}`}>
            Day
          </label>
          <select id={`sd-${key}`} name="dayOfWeek" className="field" defaultValue={slot?.day_of_week ?? 1}>
            {dayNames().map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`sfrom-${key}`}>
            From
          </label>
          <input
            id={`sfrom-${key}`}
            name="startTime"
            type="time"
            className="field"
            defaultValue={slot?.start_time ?? "08:00"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`sto-${key}`}>
            To
          </label>
          <input
            id={`sto-${key}`}
            name="endTime"
            type="time"
            className="field"
            defaultValue={slot?.end_time ?? "08:45"}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`sl-${key}`}>
            Where (optional)
          </label>
          <input
            id={`sl-${key}`}
            name="location"
            className="field"
            defaultValue={slot?.location ?? ""}
            placeholder="Room 12 / Városi uszoda"
            maxLength={80}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`ssd-${key}`}>
              From date
            </label>
            <input
              id={`ssd-${key}`}
              name="startDate"
              type="date"
              className="field"
              defaultValue={slot?.start_date ?? term?.start_date ?? today}
            />
          </div>
          <div>
            <label className="label" htmlFor={`sed-${key}`}>
              Until
            </label>
            <input
              id={`sed-${key}`}
              name="endDate"
              type="date"
              className="field"
              defaultValue={slot?.end_date ?? term?.end_date ?? ""}
            />
          </div>
        </div>
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">{slot ? "Save changes" : "Add to the week"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function EventForm({
  child,
  subjects,
  defaultDate,
}: {
  child: User;
  subjects: Subject[];
  defaultDate: string;
}) {
  return (
    <ActionForm action={saveEvent} className="card grid gap-3" resetOnSuccess onSuccessCollapse>
      <input type="hidden" name="childId" value={child.id} />

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="label" htmlFor="ek">
            What
          </label>
          <select id="ek" name="kind" className="field" defaultValue="EXAM">
            <option value="EXAM">Exam</option>
            <option value="MATCH">Match</option>
            <option value="TOURNAMENT">Tournament</option>
            <option value="TRAINING">Extra training</option>
            <option value="LESSON">Extra lesson</option>
            <option value="OTHER">Something else</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="et">
            Title
          </label>
          <input
            id="et"
            name="title"
            className="field"
            placeholder="Maths test — quadratics / Away vs. Eger"
            maxLength={80}
          />
        </div>
      </div>

      <RevealOnValue name="kind" values={["EXAM", "LESSON"]} initial="EXAM">
        <label className="label" htmlFor="es">
          Subject
        </label>
        <select id="es" name="subjectId" className="field" defaultValue={0}>
          <option value={0}>Not linked</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.emoji} {subject.name}
            </option>
          ))}
        </select>
      </RevealOnValue>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="ed">
            Date
          </label>
          <input id="ed" name="date" type="date" className="field" defaultValue={defaultDate} />
        </div>
        <div>
          <label className="label" htmlFor="ef">
            From
          </label>
          <input id="ef" name="startTime" type="time" className="field" defaultValue="08:00" />
        </div>
        <div>
          <label className="label" htmlFor="ee">
            To
          </label>
          <input id="ee" name="endTime" type="time" className="field" defaultValue="09:00" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="el">
          Where (optional)
        </label>
        <input id="el" name="location" className="field" placeholder="Room 12 / Eger" maxLength={80} />
      </div>

      <div>
        <label className="label" htmlFor="en">
          Notes (optional)
        </label>
        <textarea id="en" name="note" className="field" rows={2} maxLength={500} />
      </div>

      <div>
        <SubmitButton pendingLabel="Adding…">Add to the calendar</SubmitButton>
      </div>
    </ActionForm>
  );
}
