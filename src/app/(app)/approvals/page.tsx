import { redirect } from "next/navigation";
import { reviewTask } from "@/actions/tasks";
import { decideRedemption } from "@/actions/rewards";
import { decideRequest } from "@/actions/requests";
import { ActionForm } from "@/components/forms";
import { EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listRedemptions, listRequests, submittedInstances } from "@/lib/queries";
import { REQUEST_KIND_LABEL } from "@/lib/labels";

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (user.role !== "PARENT") redirect("/");

  const settings = getSettings();
  const tasks = submittedInstances();
  const redemptions = listRedemptions({ status: "REQUESTED" });
  const requests = listRequests({ status: "OPEN" });
  const nothingToDo = tasks.length === 0 && redemptions.length === 0 && requests.length === 0;

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
