import { adjustBalance, closeGoal, createGoal, moveGoalMoney, saveAllowance, spendGoal } from "@/actions/money";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Disclosure, EmptyState, PageHeader, Pill, ProgressBar, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings, type Settings } from "@/lib/db";
import { dayNames, formatTimestamp, nowIn } from "@/lib/dates";
import { LEDGER_SOURCE_LABEL } from "@/lib/labels";
import { recentEntries, wallet } from "@/lib/ledger";
import { formatMoney, formatMoneyDelta, formatPointsDelta } from "@/lib/money";
import { getAllowance, listChildren, listGoals } from "@/lib/queries";
import type { Allowance, Goal, User } from "@/lib/types";

export default async function MoneyPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const children = isParent ? listChildren() : [user as User];

  return (
    <>
      <PageHeader
        title={isParent ? "Pocket money" : "My money"}
        subtitle={
          isParent
            ? "Allowance, bonuses, savings goals and one-off adjustments."
            : "What you have, what you are saving for, and where it came from."
        }
      />

      {children.length === 0 && <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>}

      {children.map((child) => {
        const purse = wallet(child.id);
        const allowance = getAllowance(child.id);
        const goals = listGoals(child.id);

        return (
          <section key={child.id} className="mb-9">
            {isParent && (
              <h2 className="mb-3 text-lg font-bold">
                {child.emoji} {child.name}
              </h2>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="To spend" value={formatMoney(purse.spendable_cents, settings)} />
              <Stat label="In goals" value={formatMoney(purse.saved_cents, settings)} />
              <Stat label="Total" value={formatMoney(purse.money_cents, settings)} />
              <Stat label={settings.pointsLabel} value={purse.points} />
            </div>

            {isParent && (
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <Disclosure label="⚙️ Allowance settings">
                  <AllowanceForm child={child} allowance={allowance} settings={settings} />
                </Disclosure>
                <Disclosure label="✍️ One-off adjustment">
                  <AdjustForm child={child} />
                </Disclosure>
              </div>
            )}

            {allowance && allowance.active === 1 && (
              <p className="mb-4 text-sm text-ink-muted">
                {formatMoney(allowance.base_cents, settings)}{" "}
                {allowance.cadence === "WEEKLY"
                  ? `every ${dayNames()[Math.min(6, Math.max(0, allowance.payday - 1))]}`
                  : `on day ${allowance.payday} of the month`}
                {allowance.bonus_per_point_cents > 0 &&
                  `, plus ${formatMoney(allowance.bonus_per_point_cents, settings)} per point earned`}
                {allowance.min_points > 0 && `, if at least ${allowance.min_points} points were earned`}.
                {allowance.last_paid_period && (
                  <span className="text-ink-muted/70"> Last paid: {allowance.last_paid_period}.</span>
                )}
              </p>
            )}

            <Section title="Savings goals" count={goals.filter((goal) => goal.status !== "CLOSED").length}>
              <div className="grid gap-2">
                {goals.length === 0 && <EmptyState icon="🎯">No savings goals yet.</EmptyState>}
                {goals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} settings={settings} spendable={purse.spendable_cents} />
                ))}
                <Disclosure label="+ New savings goal">
                  <ActionForm action={createGoal} className="card flex flex-wrap items-end gap-2" resetOnSuccess onSuccessCollapse>
                    <input type="hidden" name="childId" value={child.id} />
                    <div className="min-w-[10rem] flex-1">
                      <label className="label" htmlFor={`goal-title-${child.id}`}>
                        Saving up for
                      </label>
                      <input
                        id={`goal-title-${child.id}`}
                        name="title"
                        className="field"
                        placeholder="Nintendo game"
                        maxLength={80}
                      />
                    </div>
                    <div className="w-28">
                      <label className="label" htmlFor={`goal-target-${child.id}`}>
                        Target
                      </label>
                      <input
                        id={`goal-target-${child.id}`}
                        name="target"
                        className="field"
                        inputMode="decimal"
                        placeholder="45.00"
                      />
                    </div>
                    <SubmitButton pendingLabel="Adding…">Add goal</SubmitButton>
                  </ActionForm>
                </Disclosure>
              </div>
            </Section>

            <Section title="Where it came from">
              <LedgerList childId={child.id} settings={settings} />
            </Section>
          </section>
        );
      })}
    </>
  );
}

function GoalCard({ goal, settings, spendable }: { goal: Goal; settings: Settings; spendable: number }) {
  const reached = goal.saved_cents >= goal.target_cents;

  return (
    <div className="card">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">🎯 {goal.title}</span>
        <span className="text-sm tabular-nums text-ink-muted">
          {formatMoney(goal.saved_cents, settings)} / {formatMoney(goal.target_cents, settings)}
        </span>
      </div>

      <div className="mt-2">
        <ProgressBar value={goal.saved_cents} max={goal.target_cents} tone={reached ? "good" : "accent"} />
      </div>

      {reached && (
        <p className="mt-2">
          <Pill tone="good">Target reached 🎉</Pill>
        </p>
      )}

      <ActionForm action={moveGoalMoney} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
        <input type="hidden" name="goalId" value={goal.id} />
        <div className="w-28">
          <label className="label" htmlFor={`amount-${goal.id}`}>
            Amount
          </label>
          <input id={`amount-${goal.id}`} name="amount" className="field" inputMode="decimal" placeholder="5.00" />
        </div>
        <button type="submit" name="direction" value="IN" className="btn btn-primary btn-sm" disabled={spendable <= 0}>
          Put in
        </button>
        <button type="submit" name="direction" value="OUT" className="btn btn-quiet btn-sm">
          Take out
        </button>
      </ActionForm>

      <div className="mt-2 flex gap-1.5">
        <form action={spendGoal}>
          <input type="hidden" name="goalId" value={goal.id} />
          <ConfirmSubmit
            variant="good"
            message={`Mark "${goal.title}" as bought? ${formatMoney(goal.saved_cents, settings)} will be spent.`}
          >
            Bought it
          </ConfirmSubmit>
        </form>
        <form action={closeGoal}>
          <input type="hidden" name="goalId" value={goal.id} />
          <ConfirmSubmit variant="quiet" message={`Cancel "${goal.title}" and release the saved money?`}>
            Cancel goal
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}

function AllowanceForm({
  child,
  allowance,
  settings,
}: {
  child: User;
  allowance: Allowance | null;
  settings: Settings;
}) {
  return (
    <ActionForm action={saveAllowance} className="card grid gap-3">
      <input type="hidden" name="childId" value={child.id} />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="active"
          defaultChecked={allowance?.active === 1}
          className="accent-[var(--color-accent)]"
        />
        Pay {child.name} pocket money automatically
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`base-${child.id}`}>
            Base amount
          </label>
          <input
            id={`base-${child.id}`}
            name="base"
            className="field"
            inputMode="decimal"
            defaultValue={allowance ? (allowance.base_cents / 100).toFixed(2) : "5.00"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`cadence-${child.id}`}>
            How often
          </label>
          <select
            id={`cadence-${child.id}`}
            name="cadence"
            className="field"
            defaultValue={allowance?.cadence ?? "WEEKLY"}
          >
            <option value="WEEKLY">Every week</option>
            <option value="MONTHLY">Every month</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`payday-${child.id}`}>
          Payday (1–7 for weekdays Mon–Sun, or day of month)
        </label>
        <input
          id={`payday-${child.id}`}
          name="payday"
          type="number"
          min={1}
          max={28}
          className="field"
          defaultValue={allowance?.payday ?? 6}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`bonus-${child.id}`}>
            Bonus per point
          </label>
          <input
            id={`bonus-${child.id}`}
            name="bonusPerPoint"
            className="field"
            inputMode="decimal"
            defaultValue={allowance ? (allowance.bonus_per_point_cents / 100).toFixed(2) : "0.00"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`minpts-${child.id}`}>
            Minimum points for the base
          </label>
          <input
            id={`minpts-${child.id}`}
            name="minPoints"
            type="number"
            min={0}
            className="field"
            defaultValue={allowance?.min_points ?? 0}
          />
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        Points earned in the period before payday drive the bonus. With a minimum set, the base is withheld in a week
        where {child.name} earns fewer than that — the bonus still applies. Amounts are in {settings.currencySymbol}.
      </p>

      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

function AdjustForm({ child }: { child: User }) {
  return (
    <ActionForm action={adjustBalance} className="card grid gap-3" resetOnSuccess>
      <input type="hidden" name="childId" value={child.id} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor={`adj-dir-${child.id}`}>
            Direction
          </label>
          <select id={`adj-dir-${child.id}`} name="direction" className="field" defaultValue="ADD">
            <option value="ADD">Give</option>
            <option value="REMOVE">Take away</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`adj-pts-${child.id}`}>
            Points
          </label>
          <input id={`adj-pts-${child.id}`} name="points" type="number" min={0} className="field" defaultValue={0} />
        </div>
        <div>
          <label className="label" htmlFor={`adj-money-${child.id}`}>
            Money
          </label>
          <input id={`adj-money-${child.id}`} name="money" className="field" inputMode="decimal" defaultValue="0" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`adj-reason-${child.id}`}>
          Reason (he will see this)
        </label>
        <input
          id={`adj-reason-${child.id}`}
          name="reason"
          className="field"
          placeholder="Helped grandma with the shopping"
          maxLength={200}
        />
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">Apply</SubmitButton>
      </div>
    </ActionForm>
  );
}

function LedgerList({ childId, settings }: { childId: number; settings: Settings }) {
  const entries = recentEntries(childId, 25);
  if (entries.length === 0) return <EmptyState icon="🧾">Nothing has been earned or spent yet.</EmptyState>;

  return (
    <ul className="grid gap-1.5">
      {entries.map((entry) => {
        const source = LEDGER_SOURCE_LABEL[entry.source];
        return (
          <li key={entry.id} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
            <span aria-hidden>{source.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate">{entry.reason}</div>
              <div className="text-xs text-ink-muted">
                {source.label} · {formatTimestamp(entry.created_at, settings.timezone)}
              </div>
            </div>
            <span
              className={`shrink-0 font-semibold tabular-nums ${entry.amount < 0 ? "text-bad" : "text-good"}`}
            >
              {entry.currency === "MONEY"
                ? formatMoneyDelta(entry.amount, settings)
                : `${formatPointsDelta(entry.amount)} ${settings.pointsLabel}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
