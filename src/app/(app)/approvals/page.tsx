import { redirect } from "next/navigation";
import { reviewTask } from "@/actions/tasks";
import { decideRedemption } from "@/actions/rewards";
import { decideRequest } from "@/actions/requests";
import { confirmGrade, deleteGrade } from "@/actions/school";
import { decideScreenClaim } from "@/actions/screens";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatGrade, gradeRatio, gradeTone, suggestedPoints } from "@/lib/grades";
import { listRedemptions, listRequests, pendingGrades, submittedInstances } from "@/lib/queries";
import { formatMinutes, pendingClaims } from "@/lib/screens";
import { GRADE_KIND_LABEL, REQUEST_KIND_LABEL } from "@/lib/labels";

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (user.role !== "PARENT") redirect("/");

  const settings = getSettings();
  const tasks = submittedInstances();
  const redemptions = listRedemptions({ status: "REQUESTED" });
  const requests = listRequests({ status: "OPEN" });
  const grades = pendingGrades();
  const screens = pendingClaims();
  const nothingToDo =
    tasks.length === 0 &&
    redemptions.length === 0 &&
    requests.length === 0 &&
    grades.length === 0 &&
    screens.length === 0;

  return (
    <>
      <PageHeader title="Approvals" subtitle="Everything waiting on a decision from you." />

      {nothingToDo && <EmptyState icon="☕">All caught up. Nothing needs a decision right now.</EmptyState>}

      {tasks.length > 0 && (
        <Section title="Completed tasks" count={tasks.length}>
          <ul className="grid gap-2">
            {tasks.map((task) => (
              <li key={task.id} className="card">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      <span>
                        {task.child_emoji} {task.child_name}
                      </span>
                      <span>· due {task.due_date}</span>
                      {task.submitted_at && <span>· said done {formatTimestamp(task.submitted_at, settings.timezone)}</span>}
                      {task.points > 0 && <Pill tone="points">+{task.points}</Pill>}
                      {task.money_cents > 0 && <Pill tone="money">+{formatMoney(task.money_cents, settings)}</Pill>}
                    </div>
                    {task.child_note && <p className="mt-1.5 text-sm italic">“{task.child_note}”</p>}
                  </div>
                </div>

                <form action={reviewTask} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="instanceId" value={task.id} />
                  <div className="w-24">
                    <label className="label" htmlFor={`pts-${task.id}`}>
                      Award
                    </label>
                    <input
                      id={`pts-${task.id}`}
                      name="points"
                      type="number"
                      className="field"
                      defaultValue={task.points}
                    />
                  </div>
                  <div className="min-w-[8rem] flex-1">
                    <label className="label" htmlFor={`note-${task.id}`}>
                      Note (optional)
                    </label>
                    <input id={`note-${task.id}`} name="note" className="field" maxLength={300} />
                  </div>
                  <button type="submit" name="decision" value="approve" className="btn btn-good btn-sm">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="reject" className="btn btn-bad btn-sm">
                    Send back
                  </button>
                  <button type="submit" name="decision" value="skip" className="btn btn-quiet btn-sm">
                    Skip it
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      )}



      {screens.length > 0 && (
        <Section title="Screen time" count={screens.length}>
          <ul className="grid gap-2">
            {screens.map((claim) => (
              <li key={claim.id} className="card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span aria-hidden>🎮</span>
                  <span className="font-semibold tabular-nums">{formatMinutes(claim.requested_minutes)}</span>
                  <span className="min-w-0 flex-1">{claim.what || "Screen time"}</span>
                  <span className="text-xs text-ink-muted">
                    {claim.child_emoji} {claim.child_name} · {claim.date}
                  </span>
                </div>
                {claim.child_note && <p className="mt-1.5 text-sm italic">“{claim.child_note}”</p>}

                <ActionForm action={decideScreenClaim} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={claim.id} />
                  <div className="w-24">
                    <label className="label" htmlFor={`smin-${claim.id}`}>
                      Grant
                    </label>
                    <input
                      id={`smin-${claim.id}`}
                      name="minutes"
                      type="number"
                      min={0}
                      className="field"
                      defaultValue={claim.requested_minutes}
                    />
                  </div>
                  <div className="min-w-[8rem] flex-1">
                    <label className="label" htmlFor={`snote-${claim.id}`}>
                      Note (optional)
                    </label>
                    <input id={`snote-${claim.id}`} name="note" className="field" maxLength={300} />
                  </div>
                  <button type="submit" name="decision" value="approve" className="btn btn-good btn-sm">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="deny" className="btn btn-bad btn-sm">
                    Decline
                  </button>
                </ActionForm>
                <p className="mt-1.5 text-xs text-ink-muted">Lower the number to grant less than he asked for.</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {grades.length > 0 && (
        <Section title="School marks to confirm" count={grades.length}>
          <ul className="grid gap-2">
            {grades.map((grade) => {
              const ratio = gradeRatio(grade.value, grade.out_of, settings);
              const tone = gradeTone(ratio);
              return (
                <li key={grade.id} className="card">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 font-bold tabular-nums ${
                        tone === "good"
                          ? "bg-good-soft text-good"
                          : tone === "warn"
                            ? "bg-warn-soft text-warn"
                            : "bg-bad-soft text-bad"
                      }`}
                    >
                      {formatGrade(grade.value, grade.out_of)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {grade.subject_emoji} {grade.subject_name}
                        {grade.title && <span className="font-normal"> — {grade.title}</span>}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {grade.child_emoji} {grade.child_name} · {GRADE_KIND_LABEL[grade.kind]} · {grade.date}
                        {grade.weight > 1 && ` · counts ${grade.weight}×`}
                      </span>
                    </span>
                  </div>
                  {grade.note && <p className="mt-1.5 text-sm italic">“{grade.note}”</p>}

                  <ActionForm action={confirmGrade} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={grade.id} />
                    <div className="w-28">
                      <label className="label" htmlFor={`gpts-${grade.id}`}>
                        Points
                      </label>
                      <input
                        id={`gpts-${grade.id}`}
                        name="points"
                        type="number"
                        className="field"
                        defaultValue={suggestedPoints(ratio)}
                      />
                    </div>
                    <SubmitButton variant="good" size="sm" pendingLabel="Saving…">
                      Confirm mark
                    </SubmitButton>
                  </ActionForm>

                  <form action={deleteGrade} className="mt-2">
                    <input type="hidden" name="id" value={grade.id} />
                    <ConfirmSubmit message="Throw this mark away? It was entered by your child.">
                      Not right — remove it
                    </ConfirmSubmit>
                  </form>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {redemptions.length > 0 && (
        <Section title="Reward requests" count={redemptions.length}>
          <ul className="grid gap-2">
            {redemptions.map((redemption) => (
              <li key={redemption.id} className="card">
                <div className="font-medium">🎁 {redemption.reward_title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <span>
                    {redemption.child_emoji} {redemption.child_name}
                  </span>
                  <span>· {formatTimestamp(redemption.created_at, settings.timezone)}</span>
                  {redemption.cost_points > 0 && <Pill tone="points">−{redemption.cost_points}</Pill>}
                  {redemption.cost_money_cents > 0 && (
                    <Pill tone="money">−{formatMoney(redemption.cost_money_cents, settings)}</Pill>
                  )}
                </div>
                {redemption.child_note && <p className="mt-1.5 text-sm italic">“{redemption.child_note}”</p>}

                <ActionForm action={decideRedemption} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={redemption.id} />
                  <div className="min-w-[8rem] flex-1">
                    <label className="label" htmlFor={`rnote-${redemption.id}`}>
                      Note (optional)
                    </label>
                    <input id={`rnote-${redemption.id}`} name="note" className="field" maxLength={300} />
                  </div>
                  <button type="submit" name="decision" value="approve" className="btn btn-good btn-sm">
                    Approve
                  </button>
                  <button type="submit" name="decision" value="deny" className="btn btn-bad btn-sm">
                    Decline
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {requests.length > 0 && (
        <Section title="Requests" count={requests.length}>
          <ul className="grid gap-2">
            {requests.map((request) => (
              <li key={request.id} className="card">
                <div className="font-medium">{request.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <Pill>{REQUEST_KIND_LABEL[request.kind]}</Pill>
                  <span>
                    {request.child_emoji} {request.child_name}
                  </span>
                  <span>· {formatTimestamp(request.created_at, settings.timezone)}</span>
                  {request.amount_cents > 0 && (
                    <Pill tone="money">{formatMoney(request.amount_cents, settings)}</Pill>
                  )}
                </div>
                {request.details && <p className="mt-1.5 text-sm">{request.details}</p>}

                <ActionForm action={decideRequest} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={request.id} />
                  <div className="min-w-[8rem] flex-1">
                    <label className="label" htmlFor={`qnote-${request.id}`}>
                      Your answer (optional)
                    </label>
                    <input id={`qnote-${request.id}`} name="note" className="field" maxLength={500} />
                  </div>
                  <button type="submit" name="decision" value="approve" className="btn btn-good btn-sm">
                    {request.kind === "MONEY" ? "Approve & pay" : "Approve"}
                  </button>
                  <button type="submit" name="decision" value="deny" className="btn btn-bad btn-sm">
                    Decline
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
