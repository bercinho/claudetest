import Link from "next/link";
import {
  cancelScreenClaim,
  claimScreenTime,
  decideScreenClaim,
  grantScreenMinutes,
  saveScreenBudget,
  undoScreenGrant,
} from "@/actions/screens";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Disclosure, EmptyState, PageHeader, Pill, ProgressBar, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { fullDate, humanDate, nowIn, weekdayName } from "@/lib/dates";
import { listChildren } from "@/lib/queries";
import {
  claimsForDay,
  formatMinutes,
  getBudget,
  isWeekend,
  recentClaims,
  recentGrants,
  screenDay,
  tasksOutstanding,
  usageTrend,
  type ScreenDay,
} from "@/lib/screens";
import type { ScreenBudget, ScreenClaim, User } from "@/lib/types";

const QUICK_CLAIMS = [15, 30, 45, 60];

export default async function ScreensPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser();
  const settings = getSettings();
  const today = nowIn(settings.timezone).date;
  const params = await searchParams;

  const isParent = user.role === "PARENT";
  const children = listChildren();
  const child = isParent ? children.find((c) => c.id === Number(params.child)) ?? children[0] : (user as User);

  if (!child) {
    return (
      <>
        <PageHeader title="Screen time" />
        <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>
      </>
    );
  }

  const budget = getBudget(child.id);
  const day = screenDay(child.id, today);
  const claims = claimsForDay(child.id, today);
  const outstanding = budget.require_tasks_done === 1 ? tasksOutstanding(child.id, today) : 0;
  const trend = usageTrend(child.id, today, 14);

  return (
    <>
      <PageHeader
        title="Screen &amp; play time"
        subtitle={`${fullDate(today)} · ${isWeekend(today) ? "weekend" : "school day"} allowance`}
      />

      {isParent && children.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {children.map((option) => (
            <Link
              key={option.id}
              href={`/screens?child=${option.id}`}
              className={`btn btn-sm ${option.id === child.id ? "btn-primary" : "btn-quiet"}`}
            >
              {option.emoji} {option.name}
            </Link>
          ))}
        </div>
      )}

      {!day.active && (
        <div className="card mb-5 border-warn/40 bg-warn-soft text-sm">
          Screen time is not being tracked for {child.name} at the moment.
          {isParent && " Turn it on in the settings below."}
        </div>
      )}

      <TodayCard day={day} />

      {day.active && (
        <Section title={isParent ? `Ask on ${child.name}'s behalf` : "Ask for time"}>
          <ClaimForm child={child} day={day} outstanding={outstanding} budget={budget} isParent={isParent} />
        </Section>
      )}

      <Section title="Today" count={claims.length}>
        {claims.length === 0 ? (
          <EmptyState icon="🌤️">Nothing claimed today yet.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} isParent={isParent} today={today} />
            ))}
          </ul>
        )}
      </Section>

      {isParent && (
        <Section title="Adjust today">
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionForm action={grantScreenMinutes} className="card grid gap-3" resetOnSuccess>
              <input type="hidden" name="childId" value={child.id} />
              <input type="hidden" name="date" value={today} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="grant-minutes">
                    Minutes
                  </label>
                  <input
                    id="grant-minutes"
                    name="minutes"
                    type="number"
                    className="field"
                    placeholder="30, or −30"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="grant-reason">
                    Why
                  </label>
                  <input
                    id="grant-reason"
                    name="reason"
                    className="field"
                    placeholder="Helped with the shopping"
                    maxLength={200}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-muted">
                A negative number takes time away. This changes today only — the standing allowance is unaffected.
              </p>
              <div>
                <SubmitButton pendingLabel="Saving…">Apply to today</SubmitButton>
              </div>
            </ActionForm>

            <div className="card">
              <p className="section-title mb-2">Recent adjustments</p>
              <GrantList childId={child.id} today={today} />
            </div>
          </div>
        </Section>
      )}

      <Section title="The last two weeks">
        <div className="card">
          <UsageChart trend={trend} allowance={Math.max(day.allowance, 1)} />
        </div>
      </Section>

      {isParent && (
        <Section title="Settings">
          <Disclosure label="⚙️ How much, and when it needs asking">
            <BudgetForm child={child} budget={budget} />
          </Disclosure>
        </Section>
      )}

      <Section title="Recent claims">
        <HistoryList childId={child.id} today={today} />
      </Section>
    </>
  );
}

function TodayCard({ day }: { day: ScreenDay }) {
  const spentPct = day.allowance === 0 ? 100 : Math.round((day.used / day.allowance) * 100);

  return (
    <div className="mb-6 grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Left today" value={formatMinutes(day.remaining)} />
        <Stat label="Used" value={formatMinutes(day.used)} hint={`${spentPct}% of today`} />
        <Stat
          label="Allowance"
          value={formatMinutes(day.allowance)}
          hint={
            day.adjustments === 0
              ? undefined
              : `${formatMinutes(day.base)} ${day.adjustments > 0 ? "+" : "−"} ${formatMinutes(Math.abs(day.adjustments))}`
          }
        />
        <Stat
          label="Waiting"
          value={day.awaiting === 0 ? "—" : formatMinutes(day.awaiting)}
          hint={day.awaiting === 0 ? "nothing to decide" : "asked for, not decided"}
        />
      </div>
      <div className="card-tight px-3.5 py-3">
        <ProgressBar
          value={day.used}
          max={Math.max(day.allowance, day.used, 1)}
          tone={day.remaining === 0 ? "accent" : "good"}
        />
      </div>
    </div>
  );
}

function ClaimForm({
  child,
  day,
  outstanding,
  budget,
  isParent,
}: {
  child: User;
  day: ScreenDay;
  outstanding: number;
  budget: ScreenBudget;
  isParent: boolean;
}) {
  if (day.remaining === 0) {
    return <EmptyState icon="🛑">Nothing left for today. Tomorrow is a new allowance.</EmptyState>;
  }

  return (
    <ActionForm action={claimScreenTime} className="card grid gap-3" resetOnSuccess>
      <input type="hidden" name="childId" value={child.id} />

      {outstanding > 0 && !isParent && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {outstanding} task{outstanding === 1 ? "" : "s"} still to do today, so this will need a parent to say yes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label className="label" htmlFor="claim-minutes">
            How long
          </label>
          <input
            id="claim-minutes"
            name="minutes"
            type="number"
            min={1}
            max={day.remaining}
            className="field"
            defaultValue={Math.min(30, day.remaining)}
          />
        </div>
        <div>
          <label className="label" htmlFor="claim-what">
            What for
          </label>
          <input
            id="claim-what"
            name="what"
            className="field"
            placeholder="Fortnite with Máté"
            maxLength={80}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-muted">Or ask for</span>
        {QUICK_CLAIMS.filter((minutes) => minutes <= day.remaining).map((minutes) => (
          <button
            key={minutes}
            type="submit"
            name="minutes"
            value={minutes}
            className={`btn btn-sm ${
              !isParent && budget.auto_approve_minutes >= minutes && outstanding === 0 ? "btn-good" : "btn-quiet"
            }`}
          >
            {formatMinutes(minutes)}
          </button>
        ))}
        {!isParent && budget.auto_approve_minutes > 0 && (
          <span className="text-xs text-ink-muted">
            · up to {formatMinutes(budget.auto_approve_minutes)} needs no asking
          </span>
        )}
      </div>

      <div>
        <SubmitButton pendingLabel="Asking…">{isParent ? "Grant it" : "Ask"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

const CLAIM_TONE = { REQUESTED: "warn", APPROVED: "good", DENIED: "bad", CANCELLED: "default" } as const;
const CLAIM_LABEL = { REQUESTED: "waiting", APPROVED: "approved", DENIED: "declined", CANCELLED: "cancelled" };

function ClaimRow({ claim, isParent, today }: { claim: ScreenClaim; isParent: boolean; today: string }) {
  const reduced = claim.status === "APPROVED" && claim.granted_minutes < claim.requested_minutes;

  return (
    <li className="card-tight px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-semibold tabular-nums">
          {claim.status === "APPROVED"
            ? formatMinutes(claim.granted_minutes)
            : formatMinutes(claim.requested_minutes)}
        </span>
        <span className="min-w-0 flex-1 text-sm">{claim.what || "Screen time"}</span>
        {reduced && <Pill tone="warn">asked {formatMinutes(claim.requested_minutes)}</Pill>}
        <Pill tone={CLAIM_TONE[claim.status]}>{CLAIM_LABEL[claim.status]}</Pill>

        {(claim.status === "REQUESTED" || (isParent && claim.status === "APPROVED")) && (
          <form action={cancelScreenClaim}>
            <input type="hidden" name="id" value={claim.id} />
            <ConfirmSubmit
              variant="quiet"
              message={
                claim.status === "APPROVED"
                  ? "End this session and give the minutes back to today's allowance?"
                  : "Withdraw this request?"
              }
            >
              {claim.status === "APPROVED" ? "That's enough" : "Withdraw"}
            </ConfirmSubmit>
          </form>
        )}
      </div>

      {claim.child_note && <p className="mt-1 text-sm italic text-ink-muted">“{claim.child_note}”</p>}
      {claim.parent_note && (
        <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm">
          <span className="font-semibold">Answer:</span> {claim.parent_note}
        </p>
      )}

      {isParent && claim.status === "REQUESTED" && (
        <ActionForm action={decideScreenClaim} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={claim.id} />
          <div className="w-24">
            <label className="label" htmlFor={`grant-${claim.id}`}>
              Grant
            </label>
            <input
              id={`grant-${claim.id}`}
              name="minutes"
              type="number"
              min={0}
              className="field"
              defaultValue={claim.requested_minutes}
            />
          </div>
          <div className="min-w-[8rem] flex-1">
            <label className="label" htmlFor={`cnote-${claim.id}`}>
              Note (optional)
            </label>
            <input id={`cnote-${claim.id}`} name="note" className="field" maxLength={300} />
          </div>
          <button type="submit" name="decision" value="approve" className="btn btn-good btn-sm">
            Approve
          </button>
          <button type="submit" name="decision" value="deny" className="btn btn-bad btn-sm">
            Decline
          </button>
        </ActionForm>
      )}

      {claim.date !== today && <p className="mt-1 text-xs text-ink-muted">{claim.date}</p>}
    </li>
  );
}

function GrantList({ childId, today }: { childId: number; today: string }) {
  const grants = recentGrants(childId, 8);
  if (grants.length === 0) return <p className="text-xs text-ink-muted">No adjustments yet.</p>;

  return (
    <ul className="grid gap-1.5">
      {grants.map((grant) => (
        <li key={grant.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm">
          <span className={`font-semibold tabular-nums ${grant.minutes < 0 ? "text-bad" : "text-good"}`}>
            {grant.minutes > 0 ? "+" : "−"}
            {formatMinutes(Math.abs(grant.minutes))}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {humanDate(grant.date, today)}
            {grant.reason && ` · ${grant.reason}`}
          </span>
          <form action={undoScreenGrant}>
            <input type="hidden" name="id" value={grant.id} />
            <ConfirmSubmit variant="ghost" message="Undo this adjustment?">
              ✕
            </ConfirmSubmit>
          </form>
        </li>
      ))}
    </ul>
  );
}

function UsageChart({
  trend,
  allowance,
}: {
  trend: { date: string; minutes: number }[];
  allowance: number;
}) {
  const peak = Math.max(allowance, ...trend.map((day) => day.minutes), 1);

  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {trend.map((day) => {
          const height = Math.max(2, Math.round((day.minutes / peak) * 88));
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`w-full rounded-sm ${day.minutes > allowance ? "bg-bad" : "bg-accent"}`}
                style={{ height }}
                title={`${day.date}: ${formatMinutes(day.minutes)}`}
              />
              <span className="text-[0.6rem] text-ink-muted">{weekdayName(day.date).charAt(0)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Minutes used per day, ending today on the right. Anything above today&apos;s allowance of{" "}
        {formatMinutes(allowance)} is shown in red.
      </p>
    </div>
  );
}

function HistoryList({ childId, today }: { childId: number; today: string }) {
  const claims = recentClaims(childId, 20).filter((claim) => claim.date !== today);
  if (claims.length === 0) return <EmptyState icon="🕓">Nothing before today yet.</EmptyState>;

  return (
    <ul className="grid gap-1.5">
      {claims.map((claim) => (
        <li key={claim.id} className="card-tight flex items-center gap-3 px-3.5 py-2 text-sm">
          <span className="w-16 shrink-0 font-semibold tabular-nums">
            {formatMinutes(claim.status === "APPROVED" ? claim.granted_minutes : claim.requested_minutes)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {claim.what || "Screen time"}
            <span className="block text-xs text-ink-muted">{humanDate(claim.date, today)}</span>
          </span>
          <Pill tone={CLAIM_TONE[claim.status]}>{CLAIM_LABEL[claim.status]}</Pill>
        </li>
      ))}
    </ul>
  );
}

function BudgetForm({ child, budget }: { child: User; budget: ScreenBudget }) {
  return (
    <ActionForm action={saveScreenBudget} className="card grid gap-3">
      <input type="hidden" name="childId" value={child.id} />

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="active"
          defaultChecked={budget.active === 1}
          className="accent-[var(--color-accent)]"
        />
        Track {child.name}&apos;s screen and play time
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="b-weekday">
            School day (minutes)
          </label>
          <input
            id="b-weekday"
            name="weekdayMinutes"
            type="number"
            min={0}
            className="field"
            defaultValue={budget.weekday_minutes}
          />
        </div>
        <div>
          <label className="label" htmlFor="b-weekend">
            Weekend day (minutes)
          </label>
          <input
            id="b-weekend"
            name="weekendMinutes"
            type="number"
            min={0}
            className="field"
            defaultValue={budget.weekend_minutes}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="b-auto">
          Goes through without asking, up to (minutes)
        </label>
        <input
          id="b-auto"
          name="autoApproveMinutes"
          type="number"
          min={0}
          className="field"
          defaultValue={budget.auto_approve_minutes}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requireTasksDone"
          defaultChecked={budget.require_tasks_done === 1}
          className="accent-[var(--color-accent)]"
        />
        Today&apos;s tasks first — while any are outstanding, every claim needs asking
      </label>

      <p className="text-xs text-ink-muted">
        Saturday and Sunday use the weekend figure. Approved time is deducted from the day it was claimed on, and the
        allowance starts fresh each day — nothing carries over.
      </p>

      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
