import { deletePolicy, revertPolicyApplication, savePolicy, setPolicyActive } from "@/actions/policies";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { QuickPolicies } from "@/components/quick-policies";
import { Disclosure, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings, type Settings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { formatMoney, formatPointsDelta } from "@/lib/money";
import { listChildren, listPolicies, recentPolicyApplications } from "@/lib/queries";
import type { Policy, User } from "@/lib/types";

export default async function PoliciesPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const children = listChildren();
  const policies = isParent ? listPolicies(undefined, true) : listPolicies(user.id);

  const rewards = policies.filter((policy) => policy.kind === "REWARD");
  const penalties = policies.filter((policy) => policy.kind === "PENALTY");

  return (
    <>
      <PageHeader
        title="House rules"
        subtitle={
          isParent
            ? "Standing agreements. Tap one to apply it — every use is recorded."
            : "The rules you and your parents agreed on."
        }
      />

      {isParent && (
        <Section title="New rule">
          <Disclosure label="+ Add a house rule" tone="primary">
            <PolicyForm childrenList={children} />
          </Disclosure>
        </Section>
      )}

      {isParent && children.length > 0 && policies.some((policy) => policy.active) && (
        <Section title="Apply now">
          <div className="grid gap-3">
            {children.map((child) => (
              <div key={child.id} className="card">
                <p className="mb-2 text-sm font-semibold">
                  {child.emoji} {child.name}
                </p>
                <QuickPolicies
                  childId={child.id}
                  policies={listPolicies(child.id)}
                  settings={settings}
                />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Earns a reward" count={rewards.length}>
        <PolicyList policies={rewards} settings={settings} isParent={isParent} childrenList={children} />
      </Section>

      <Section title="Costs something" count={penalties.length}>
        <PolicyList policies={penalties} settings={settings} isParent={isParent} childrenList={children} />
      </Section>

      <Section title="Recently applied">
        <AppliedList
          settings={settings}
          isParent={isParent}
          childId={isParent ? undefined : user.id}
        />
      </Section>
    </>
  );
}

function PolicyList({
  policies,
  settings,
  isParent,
  childrenList,
}: {
  policies: Policy[];
  settings: Settings;
  isParent: boolean;
  childrenList: User[];
}) {
  if (policies.length === 0) return <EmptyState icon="⚖️">Nothing here yet.</EmptyState>;

  return (
    <ul className="grid gap-2">
      {policies.map((policy) => {
        const who = policy.child_id ? childrenList.find((child) => child.id === policy.child_id) : null;
        return (
          <li key={policy.id} className={`card-tight px-3.5 py-3 ${policy.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{policy.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  {policy.points > 0 && (
                    <Pill tone={policy.kind === "REWARD" ? "points" : "bad"}>
                      {policy.kind === "REWARD" ? "+" : "−"}
                      {policy.points}
                    </Pill>
                  )}
                  {policy.money_cents > 0 && (
                    <Pill tone={policy.kind === "REWARD" ? "money" : "bad"}>
                      {policy.kind === "REWARD" ? "+" : "−"}
                      {formatMoney(policy.money_cents, settings)}
                    </Pill>
                  )}
                  <span>{who ? `${who.emoji} ${who.name} only` : "everyone"}</span>
                  {!policy.active && <Pill tone="warn">off</Pill>}
                </div>
                {policy.details && <p className="mt-1 text-xs text-ink-muted">{policy.details}</p>}
              </div>

              {isParent && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={setPolicyActive}>
                    <input type="hidden" name="id" value={policy.id} />
                    <input type="hidden" name="active" value={policy.active ? "0" : "1"} />
                    <SubmitButton variant="quiet" size="sm">
                      {policy.active ? "Turn off" : "Turn on"}
                    </SubmitButton>
                  </form>
                  <form action={deletePolicy}>
                    <input type="hidden" name="id" value={policy.id} />
                    <ConfirmSubmit message={`Delete the rule "${policy.title}"?`}>Delete</ConfirmSubmit>
                  </form>
                </div>
              )}
            </div>

            {isParent && (
              <details className="disclosure mt-2">
                <summary className="btn btn-ghost btn-sm px-0">Edit</summary>
                <div className="mt-2">
                  <PolicyForm policy={policy} childrenList={childrenList} />
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PolicyForm({ policy, childrenList }: { policy?: Policy; childrenList: User[] }) {
  const key = policy?.id ?? "new";
  return (
    <ActionForm action={savePolicy} className="card grid gap-3" resetOnSuccess={!policy} onSuccessCollapse={!policy}>
      {policy && <input type="hidden" name="id" value={policy.id} />}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor={`ptitle-${key}`}>
            Rule
          </label>
          <input
            id={`ptitle-${key}`}
            name="title"
            className="field"
            defaultValue={policy?.title ?? ""}
            placeholder="Homework done before dinner"
            maxLength={80}
          />
        </div>
        <div>
          <label className="label" htmlFor={`pkind-${key}`}>
            Type
          </label>
          <select id={`pkind-${key}`} name="kind" className="field" defaultValue={policy?.kind ?? "REWARD"}>
            <option value="REWARD">Earns a reward</option>
            <option value="PENALTY">Costs something</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`pdetails-${key}`}>
          What it means (optional)
        </label>
        <input
          id={`pdetails-${key}`}
          name="details"
          className="field"
          defaultValue={policy?.details ?? ""}
          maxLength={500}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor={`ppoints-${key}`}>
            Points
          </label>
          <input
            id={`ppoints-${key}`}
            name="points"
            type="number"
            min={0}
            className="field"
            defaultValue={policy?.points ?? 5}
          />
        </div>
        <div>
          <label className="label" htmlFor={`pmoney-${key}`}>
            Money
          </label>
          <input
            id={`pmoney-${key}`}
            name="money"
            className="field"
            inputMode="decimal"
            defaultValue={policy ? (policy.money_cents / 100).toFixed(2) : "0"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`pchild-${key}`}>
            Applies to
          </label>
          <select id={`pchild-${key}`} name="childId" className="field" defaultValue={policy?.child_id ?? 0}>
            <option value={0}>Everyone</option>
            {childrenList.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">{policy ? "Save changes" : "Add rule"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function AppliedList({
  settings,
  isParent,
  childId,
}: {
  settings: Settings;
  isParent: boolean;
  childId?: number;
}) {
  const applications = recentPolicyApplications(15, childId);
  if (applications.length === 0) return <EmptyState icon="🕊️">No house rules have been applied yet.</EmptyState>;

  return (
    <ul className="grid gap-1.5">
      {applications.map((application) => (
        <li key={application.id} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <span className="font-medium">{application.policy_title}</span>
            <span className="text-ink-muted"> · {application.child_name}</span>
            {application.note && <span className="text-ink-muted"> · “{application.note}”</span>}
            <div className="text-xs text-ink-muted">{formatTimestamp(application.created_at, settings.timezone)}</div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {application.points_delta !== 0 && (
              <Pill tone={application.points_delta > 0 ? "good" : "bad"}>
                {formatPointsDelta(application.points_delta)}
              </Pill>
            )}
            {application.money_delta_cents !== 0 && (
              <Pill tone={application.money_delta_cents > 0 ? "good" : "bad"}>
                {application.money_delta_cents > 0 ? "+" : "−"}
                {formatMoney(Math.abs(application.money_delta_cents), settings)}
              </Pill>
            )}
            {isParent && (
              <form action={revertPolicyApplication}>
                <input type="hidden" name="id" value={application.id} />
                <ConfirmSubmit variant="quiet" message="Undo this and give the points/money back?">
                  Undo
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
