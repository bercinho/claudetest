import { createRequest, withdrawRequest } from "@/actions/requests";
import { ActionForm, RevealOnValue, SubmitButton } from "@/components/forms";
import { EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { REQUEST_KIND_LABEL, REQUEST_KIND_OPTIONS } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { listChildren, listRequests } from "@/lib/queries";

const STATUS_TONE = { OPEN: "warn", APPROVED: "good", DENIED: "bad", WITHDRAWN: "default" } as const;
const STATUS_LABEL = { OPEN: "waiting", APPROVED: "approved", DENIED: "declined", WITHDRAWN: "withdrawn" };

export default async function RequestsPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const children = listChildren();
  const requests = listRequests(isParent ? { limit: 40 } : { childId: user.id, limit: 40 });

  return (
    <>
      <PageHeader
        title={isParent ? "Requests" : "Ask for something"}
        subtitle={
          isParent
            ? "Everything your children have asked for, and what you decided."
            : "Ask properly, get an answer you can point back to."
        }
      />

      {(!isParent || children.length > 0) && (
        <Section title="New request">
          <ActionForm action={createRequest} className="card grid gap-3" resetOnSuccess>
            {isParent ? (
              <div>
                <label className="label" htmlFor="req-child">
                  On behalf of
                </label>
                <select id="req-child" name="childId" className="field" defaultValue={children[0]?.id}>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.emoji} {child.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="childId" value={user.id} />
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div>
                <label className="label" htmlFor="req-kind">
                  What kind
                </label>
                <select id="req-kind" name="kind" className="field" defaultValue="PERMISSION">
                  {REQUEST_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="req-title">
                  What are you asking for
                </label>
                <input
                  id="req-title"
                  name="title"
                  className="field"
                  placeholder="Sleepover at Máté's on Saturday"
                  maxLength={80}
                />
              </div>
            </div>

            <RevealOnValue name="kind" values={["MONEY"]} initial="PERMISSION">
              <label className="label" htmlFor="req-amount">
                How much
              </label>
              <input id="req-amount" name="amount" className="field" inputMode="decimal" placeholder="5.00" />
            </RevealOnValue>

            <div>
              <label className="label" htmlFor="req-details">
                Why (this is the part that helps)
              </label>
              <textarea
                id="req-details"
                name="details"
                className="field"
                rows={3}
                maxLength={800}
                placeholder="Who, where, until when, and how I'll get home."
              />
            </div>

            <div>
              <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      )}

      <Section title="History" count={requests.filter((request) => request.status === "OPEN").length}>
        {requests.length === 0 ? (
          <EmptyState icon="🙋">Nothing has been asked yet.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {requests.map((request) => (
              <li key={request.id} className="card-tight px-3.5 py-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{request.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      <Pill>{REQUEST_KIND_LABEL[request.kind]}</Pill>
                      {isParent && (
                        <span>
                          {request.child_emoji} {request.child_name}
                        </span>
                      )}
                      <span>{formatTimestamp(request.created_at, settings.timezone)}</span>
                      {request.amount_cents > 0 && (
                        <Pill tone="money">{formatMoney(request.amount_cents, settings)}</Pill>
                      )}
                    </div>
                    {request.details && <p className="mt-1.5 text-sm text-ink-muted">{request.details}</p>}
                    {request.parent_note && (
                      <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm">
                        <span className="font-semibold">Answer:</span> {request.parent_note}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Pill tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Pill>
                    {request.status === "OPEN" && !isParent && (
                      <form action={withdrawRequest}>
                        <input type="hidden" name="id" value={request.id} />
                        <SubmitButton variant="ghost" size="sm">
                          Withdraw
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
