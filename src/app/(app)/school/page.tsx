import Link from "next/link";
import {
  deleteGrade,
  deleteSubject,
  saveGrade,
  saveSubject,
  saveTerm,
  setSubjectActive,
  setTermActive,
} from "@/actions/school";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Disclosure, EmptyState, PageHeader, Pill, ProgressBar, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings, type Settings } from "@/lib/db";
import { addDays, nowIn } from "@/lib/dates";
import { average, formatGrade, gradeRatio, gradeTone, type Average } from "@/lib/grades";
import { EVENT_KIND, GRADE_KIND_LABEL } from "@/lib/labels";
import {
  currentTerm,
  eventsBetween,
  getTerm,
  gradesForTerm,
  listChildren,
  listSubjects,
  listTerms,
} from "@/lib/queries";
import type { Grade, Subject, Term, User } from "@/lib/types";

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string; child?: string }>;
}) {
  const user = await requireUser();
  const settings = getSettings();
  const today = nowIn(settings.timezone).date;
  const params = await searchParams;

  const isParent = user.role === "PARENT";
  const children = listChildren();
  const selectedChild = isParent
    ? children.find((child) => child.id === Number(params.child)) ?? children[0]
    : (user as User);

  const terms = listTerms();
  const term = (params.term ? getTerm(Number(params.term)) : null) ?? currentTerm(today);

  if (!isParent && !term) {
    return (
      <>
        <PageHeader title="School" />
        <EmptyState icon="🎓">No term has been set up yet.</EmptyState>
      </>
    );
  }

  if (isParent && children.length === 0) {
    return (
      <>
        <PageHeader title="School" />
        <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>
      </>
    );
  }

  const subjects = term && selectedChild ? listSubjects(term.id, selectedChild.id, isParent) : [];
  const grades = term && selectedChild ? gradesForTerm(term.id, selectedChild.id) : [];
  const gradesBySubject = new Map<number, Grade[]>();
  for (const grade of grades) {
    const list = gradesBySubject.get(grade.subject_id) ?? [];
    list.push(grade);
    gradesBySubject.set(grade.subject_id, list);
  }

  const overall = average(grades, settings);
  const upcomingExams =
    selectedChild && term
      ? eventsBetween(today, addDays(today, 28), { childId: selectedChild.id, kinds: ["EXAM"] })
      : [];

  return (
    <>
      <PageHeader
        title="School"
        subtitle={term ? `${term.name} · ${term.start_date} → ${term.end_date}` : "No term set up yet"}
      />

      {(terms.length > 1 || (isParent && children.length > 1)) && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {terms.map((option) => (
            <Link
              key={option.id}
              href={`/school?term=${option.id}${selectedChild ? `&child=${selectedChild.id}` : ""}`}
              className={`btn btn-sm ${option.id === term?.id ? "btn-primary" : "btn-quiet"}`}
            >
              {option.name}
            </Link>
          ))}
          {isParent &&
            children.length > 1 &&
            children.map((child) => (
              <Link
                key={child.id}
                href={`/school?child=${child.id}${term ? `&term=${term.id}` : ""}`}
                className={`btn btn-sm ${child.id === selectedChild?.id ? "btn-primary" : "btn-quiet"}`}
              >
                {child.emoji} {child.name}
              </Link>
            ))}
        </div>
      )}

      {term && selectedChild && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Term average"
            value={overall ? overall.onScale.toFixed(2) : "—"}
            hint={
              overall ? `${overall.percent}% · ${overall.count} ${overall.count === 1 ? "mark" : "marks"}` : "no marks yet"
            }
          />
          <Stat label="Subjects" value={subjects.filter((subject) => subject.active).length} />
          <Stat label="Marks" value={grades.filter((grade) => grade.confirmed === 1).length} />
          <Stat label="Exams ahead" value={upcomingExams.length} hint="next four weeks" />
        </div>
      )}

      {upcomingExams.length > 0 && (
        <Section title="Coming up">
          <ul className="grid gap-1.5">
            {upcomingExams.map((exam) => (
              <li key={exam.id} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <span aria-hidden>{EVENT_KIND.EXAM.icon}</span>
                <span className="min-w-0 flex-1 truncate">{exam.title}</span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                  {exam.date} {exam.start_time}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {isParent && (
        <Section title="Set up">
          <div className="grid gap-3 sm:grid-cols-2">
            <Disclosure label="🗓️ Terms">
              <div className="grid gap-2">
                {terms.map((option) => (
                  <div key={option.id} className="card-tight flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{option.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {option.start_date} → {option.end_date}
                      </span>
                    </span>
                    {!option.active && <Pill tone="warn">archived</Pill>}
                    <form action={setTermActive}>
                      <input type="hidden" name="id" value={option.id} />
                      <input type="hidden" name="active" value={option.active ? "0" : "1"} />
                      <SubmitButton variant="ghost" size="sm">
                        {option.active ? "Archive" : "Restore"}
                      </SubmitButton>
                    </form>
                  </div>
                ))}
                <TermForm today={today} />
              </div>
            </Disclosure>

            {term && selectedChild && (
              <Disclosure label="📘 Add a subject">
                <SubjectForm term={term} child={selectedChild} />
              </Disclosure>
            )}
          </div>
        </Section>
      )}

      {term && selectedChild && (
        <Section title="Subjects" count={subjects.filter((subject) => subject.active).length}>
          {subjects.length === 0 ? (
            <EmptyState icon="📘">
              {isParent ? "Add the subjects he takes this term." : "No subjects set up for this term yet."}
            </EmptyState>
          ) : (
            <div className="grid gap-3">
              {subjects.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  grades={gradesBySubject.get(subject.id) ?? []}
                  settings={settings}
                  isParent={isParent}
                  today={today}
                  term={term}
                  child={selectedChild}
                />
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function SubjectCard({
  subject,
  grades,
  settings,
  isParent,
  today,
  term,
  child,
}: {
  subject: Subject;
  grades: Grade[];
  settings: Settings;
  isParent: boolean;
  today: string;
  term: Term;
  child: User;
}) {
  const avg = average(grades, settings);
  const pending = grades.filter((grade) => grade.confirmed === 0);

  return (
    <article className={`card ${subject.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="text-xl">
          {subject.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{subject.name}</h3>
          {subject.teacher && <p className="text-xs text-ink-muted">{subject.teacher}</p>}
        </div>
        <AverageBadge average={avg} settings={settings} />

        {isParent && (
          <div className="flex shrink-0 gap-1">
            <form action={setSubjectActive}>
              <input type="hidden" name="id" value={subject.id} />
              <input type="hidden" name="active" value={subject.active ? "0" : "1"} />
              <SubmitButton variant="ghost" size="sm">
                {subject.active ? "Archive" : "Restore"}
              </SubmitButton>
            </form>
            <form action={deleteSubject}>
              <input type="hidden" name="id" value={subject.id} />
              <ConfirmSubmit message={`Delete ${subject.name} and every mark in it?`}>✕</ConfirmSubmit>
            </form>
          </div>
        )}
      </div>

      {avg && (
        <div className="mt-3">
          <ProgressBar value={avg.percent} max={100} tone={avg.percent >= 70 ? "good" : "accent"} />
        </div>
      )}

      {pending.length > 0 && (
        <p className="mt-3 text-xs text-warn">
          {pending.length} mark{pending.length === 1 ? "" : "s"} waiting for a parent to confirm — not counted yet.
        </p>
      )}

      {grades.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {grades.map((grade) => (
            <GradeRow key={grade.id} grade={grade} settings={settings} isParent={isParent} />
          ))}
        </ul>
      )}

      <details className="disclosure mt-3">
        <summary className="btn btn-quiet btn-sm">+ Record a mark</summary>
        <div className="mt-2">
          <GradeForm subject={subject} settings={settings} isParent={isParent} today={today} />
        </div>
      </details>

      {isParent && (
        <details className="disclosure mt-2">
          <summary className="btn btn-ghost btn-sm px-0">Edit subject</summary>
          <div className="mt-2">
            <SubjectForm term={term} child={child} subject={subject} />
          </div>
        </details>
      )}
    </article>
  );
}

function AverageBadge({ average: avg, settings }: { average: Average | null; settings: Settings }) {
  if (!avg) return <Pill>no marks yet</Pill>;
  const tone = gradeTone(avg.percent / 100);
  return (
    <span className="text-right">
      <span
        className={`block text-xl font-bold tabular-nums ${
          tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-bad"
        }`}
      >
        {avg.onScale.toFixed(2)}
      </span>
      <span className="block text-[0.7rem] text-ink-muted">
        of {settings.gradeMax} · {avg.count} {avg.count === 1 ? "mark" : "marks"}
      </span>
    </span>
  );
}

function GradeRow({ grade, settings, isParent }: { grade: Grade; settings: Settings; isParent: boolean }) {
  const ratio = gradeRatio(grade.value, grade.out_of, settings);
  const tone = gradeTone(ratio);

  return (
    <li className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
      <span
        className={`shrink-0 rounded-md px-2 py-0.5 font-bold tabular-nums ${
          tone === "good" ? "bg-good-soft text-good" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad"
        }`}
      >
        {formatGrade(grade.value, grade.out_of)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{grade.title || GRADE_KIND_LABEL[grade.kind]}</span>
        <span className="block text-xs text-ink-muted">
          {GRADE_KIND_LABEL[grade.kind]} · {grade.date}
          {grade.weight > 1 && ` · counts ${grade.weight}×`}
          {grade.note && ` · ${grade.note}`}
        </span>
      </span>
      {grade.confirmed === 0 && <Pill tone="warn">to confirm</Pill>}
      {(isParent || grade.confirmed === 0) && (
        <form action={deleteGrade}>
          <input type="hidden" name="id" value={grade.id} />
          <ConfirmSubmit variant="ghost" message="Delete this mark?">
            ✕
          </ConfirmSubmit>
        </form>
      )}
    </li>
  );
}

function GradeForm({
  subject,
  settings,
  isParent,
  today,
}: {
  subject: Subject;
  settings: Settings;
  isParent: boolean;
  today: string;
}) {
  return (
    <ActionForm action={saveGrade} className="card grid gap-3" resetOnSuccess onSuccessCollapse>
      <input type="hidden" name="subjectId" value={subject.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`gv-${subject.id}`}>
            Mark
          </label>
          <input
            id={`gv-${subject.id}`}
            name="value"
            className="field"
            inputMode="decimal"
            placeholder={String(settings.gradeMax)}
          />
        </div>
        <div>
          <label className="label" htmlFor={`go-${subject.id}`}>
            Out of
          </label>
          <input
            id={`go-${subject.id}`}
            name="outOf"
            className="field"
            inputMode="decimal"
            defaultValue={settings.gradeMax}
          />
        </div>
        <div>
          <label className="label" htmlFor={`gk-${subject.id}`}>
            Type
          </label>
          <select id={`gk-${subject.id}`} name="kind" className="field" defaultValue="TEST">
            {Object.entries(GRADE_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`gw-${subject.id}`}>
            Counts
          </label>
          <input
            id={`gw-${subject.id}`}
            name="weight"
            type="number"
            min={1}
            max={10}
            className="field"
            defaultValue={1}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor={`gt-${subject.id}`}>
            What it was for (optional)
          </label>
          <input
            id={`gt-${subject.id}`}
            name="title"
            className="field"
            placeholder="Quadratic equations"
            maxLength={80}
          />
        </div>
        <div>
          <label className="label" htmlFor={`gd-${subject.id}`}>
            Date
          </label>
          <input id={`gd-${subject.id}`} name="date" type="date" className="field" defaultValue={today} />
        </div>
      </div>

      {isParent ? (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label className="label" htmlFor={`gn-${subject.id}`}>
              Note (optional)
            </label>
            <input id={`gn-${subject.id}`} name="note" className="field" maxLength={300} />
          </div>
          <div>
            <label className="label" htmlFor={`gp-${subject.id}`}>
              Points to award
            </label>
            <input id={`gp-${subject.id}`} name="points" type="number" className="field" defaultValue={0} />
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="label" htmlFor={`gn-${subject.id}`}>
              Note (optional)
            </label>
            <input id={`gn-${subject.id}`} name="note" className="field" maxLength={300} />
          </div>
          <p className="text-xs text-ink-muted">
            Marks you enter go to a parent to confirm before they count towards your average.
          </p>
        </>
      )}

      <div>
        <SubmitButton pendingLabel="Saving…">Record</SubmitButton>
      </div>
    </ActionForm>
  );
}

function SubjectForm({ term, child, subject }: { term: Term; child: User; subject?: Subject }) {
  const key = subject?.id ?? "new";
  return (
    <ActionForm action={saveSubject} className="card grid gap-3" resetOnSuccess={!subject} onSuccessCollapse={!subject}>
      {subject && <input type="hidden" name="id" value={subject.id} />}
      <input type="hidden" name="termId" value={term.id} />
      <input type="hidden" name="childId" value={child.id} />

      <div className="grid grid-cols-[3rem_1fr] gap-3">
        <div>
          <label className="label" htmlFor={`sube-${key}`}>
            Icon
          </label>
          <input
            id={`sube-${key}`}
            name="emoji"
            className="field text-center"
            defaultValue={subject?.emoji ?? "📘"}
            maxLength={8}
          />
        </div>
        <div>
          <label className="label" htmlFor={`subn-${key}`}>
            Subject
          </label>
          <input
            id={`subn-${key}`}
            name="name"
            className="field"
            defaultValue={subject?.name ?? ""}
            placeholder="Mathematics"
            maxLength={60}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`subt-${key}`}>
          Teacher (optional)
        </label>
        <input
          id={`subt-${key}`}
          name="teacher"
          className="field"
          defaultValue={subject?.teacher ?? ""}
          maxLength={60}
        />
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">{subject ? "Save" : "Add subject"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function TermForm({ today }: { today: string }) {
  return (
    <ActionForm action={saveTerm} className="card grid gap-3" resetOnSuccess>
      <div>
        <label className="label" htmlFor="term-name">
          New term
        </label>
        <input id="term-name" name="name" className="field" placeholder="2026/27 Autumn" maxLength={60} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="term-start">
            Starts
          </label>
          <input id="term-start" name="startDate" type="date" className="field" defaultValue={today} />
        </div>
        <div>
          <label className="label" htmlFor="term-end">
            Ends
          </label>
          <input id="term-end" name="endDate" type="date" className="field" />
        </div>
      </div>
      <div>
        <SubmitButton pendingLabel="Creating…">Create term</SubmitButton>
      </div>
    </ActionForm>
  );
}
