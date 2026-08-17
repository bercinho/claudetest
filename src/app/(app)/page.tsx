import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { addDays, fullDate, nowIn } from "@/lib/dates";
import { wallet } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import {
  approvalCounts,
  childSummary,
  instancesBetween,
  listChildren,
  listPolicies,
  listRedemptions,
  listRequests,
  pointsTrend,
} from "@/lib/queries";
import { quickAddTask } from "@/actions/tasks";
import { ActionForm, SubmitButton } from "@/components/forms";
import { QuickPolicies } from "@/components/quick-policies";
import { TaskInstanceList } from "@/components/task-list";
import {
  Avatar,
  Disclosure,
  EmptyState,
  PageHeader,
  PointsSparkline,
  ProgressBar,
  Section,
  Stat,
} from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = getSettings();
  const today = nowIn(settings.timezone).date;

  return user.role === "PARENT" ? (
    <ParentDashboard settings={settings} today={today} />
  ) : (
    <ChildDashboard childId={user.id} name={user.name} settings={settings} today={today} />
  );
}

// ---------------------------------------------------------------------------

async function ParentDashboard({
  settings,
  today,
}: {
  settings: ReturnType<typeof getSettings>;
  today: string;
}) {
  const children = listChildren();
  const approvals = approvalCounts();

  if (children.length === 0) {
    return (
      <>
        <PageHeader title="Welcome" subtitle="One more step before the app has anything to track." />
        <EmptyState icon="👋">
          Add your son (and anyone else) on the <Link href="/family" className="font-semibold text-accent">Family</Link>{" "}
          page, then come back here.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Today" subtitle={fullDate(today)} />

      {approvals.total > 0 && (
        <Link
          href="/approvals"
          className="card mb-6 flex items-center gap-3 border-accent/40 bg-accent-soft hover:brightness-[1.02]"
        >
          <span aria-hidden className="text-2xl">
            🔔
          </span>
          <span className="text-sm">
            <span className="font-semibold">
              {approvals.total} thing{approvals.total === 1 ? "" : "s"} waiting for you
            </span>
            <span className="block text-ink-muted">
              {[
                approvals.tasks > 0 ? `${approvals.tasks} task${approvals.tasks === 1 ? "" : "s"}` : null,
                approvals.redemptions > 0 ? `${approvals.redemptions} reward` : null,
                approvals.requests > 0 ? `${approvals.requests} request${approvals.requests === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <span className="ml-auto text-sm font-semibold text-accent">Review →</span>
        </Link>
      )}

      <div className="mb-7 grid gap-4">
        {children.map((child) => {
          const summary = childSummary(child, today);
          const policies = listPolicies(child.id).slice(0, 8);
          const trend = pointsTrend(child.id, today, 14);
          const todaysTasks = instancesBetween(today, today, child.id);
          const openToday = todaysTasks.filter((task) => task.status === "PENDING").length;

          return (
            <article key={child.id} className="card">
              <div className="flex items-center gap-3">
                <Avatar emoji={child.emoji} color={child.color} size="lg" />
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{child.name}</h3>
                  <p className="text-xs text-ink-muted">
                    {summary.weekPoints >= 0 ? "+" : "−"}
                    {Math.abs(summary.weekPoints)} {settings.pointsLabel} this week
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-lg font-bold tabular-nums text-accent">
                    {summary.wallet.points} <span className="text-xs font-medium">{settings.pointsLabel}</span>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-ink-muted">
                    {formatMoney(summary.wallet.spendable_cents, settings)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-ink-muted">
                    <span>
                      Today: {summary.today.done}/{summary.today.total || 0} done
                    </span>
                    {summary.today.missed > 0 && <span className="text-bad">{summary.today.missed} missed</span>}
                  </div>
                  <ProgressBar value={summary.today.done} max={Math.max(1, summary.today.total)} tone="good" />
                </div>
                <div className="w-full sm:w-32">
                  <PointsSparkline data={trend} />
                </div>
              </div>

              {todaysTasks.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <Disclosure
                    label={openToday > 0 ? `📋 ${openToday} still to do today` : "📋 Today's list"}
                  >
                    <TaskInstanceList instances={todaysTasks} role="PARENT" settings={settings} today={today} />
                  </Disclosure>
                </div>
              )}

              {policies.length > 0 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="section-title mb-2">Apply a house rule</p>
                  <QuickPolicies childId={child.id} policies={policies} settings={settings} />
                </div>
              )}
            </article>
          );
        })}
      </div>

      <Section title="Add a one-off task for today">
        <div className="card">
          <ActionForm action={quickAddTask} resetOnSuccess className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label className="label" htmlFor="quick-title">
                Task
              </label>
              <input id="quick-title" name="title" className="field" placeholder="Tidy the desk" />
            </div>
            <div>
              <label className="label" htmlFor="quick-child">
                For
              </label>
              <select id="quick-child" name="childId" className="field">
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <label className="label" htmlFor="quick-points">
                Points
              </label>
              <input id="quick-points" name="points" className="field" type="number" min={0} defaultValue={5} />
            </div>
            <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------

async function ChildDashboard({
  childId,
  name,
  settings,
  today,
}: {
  childId: number;
  name: string;
  settings: ReturnType<typeof getSettings>;
  today: string;
}) {
  const purse = wallet(childId);
  const todaysTasks = instancesBetween(today, today, childId);
  const upcoming = instancesBetween(addDays(today, 1), addDays(today, 3), childId).filter(
    (task) => task.status === "PENDING",
  );
  const openRequests = listRequests({ childId, status: "OPEN" });
  const pendingRewards = listRedemptions({ childId, status: "REQUESTED" });
  const trend = pointsTrend(childId, today, 14);

  const doneToday = todaysTasks.filter((task) => task.status === "APPROVED").length;

  return (
    <>
      <PageHeader title={`Hi ${name} 👋`} subtitle={fullDate(today)} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={settings.pointsLabel} value={purse.points} />
        <Stat label="To spend" value={formatMoney(purse.spendable_cents, settings)} />
        <Stat label="Saved up" value={formatMoney(purse.saved_cents, settings)} hint="in your goals" />
        <Stat label="Done today" value={`${doneToday}/${todaysTasks.length}`} />
      </div>

      <Section title="Today's tasks" count={todaysTasks.length}>
        {todaysTasks.length === 0 ? (
          <EmptyState icon="🎉">Nothing on the list today.</EmptyState>
        ) : (
          <TaskInstanceList instances={todaysTasks} role="CHILD" settings={settings} today={today} />
        )}
      </Section>

      {upcoming.length > 0 && (
        <Section title="Coming up">
          <TaskInstanceList instances={upcoming} role="CHILD" settings={settings} today={today} showDate />
        </Section>
      )}

      {(openRequests.length > 0 || pendingRewards.length > 0) && (
        <Section title="Waiting on a parent">
          <ul className="grid gap-2">
            {pendingRewards.map((redemption) => (
              <li key={`r${redemption.id}`} className="card-tight px-3.5 py-2.5 text-sm">
                🎁 {redemption.reward_title} <span className="text-ink-muted">— waiting for approval</span>
              </li>
            ))}
            {openRequests.map((request) => (
              <li key={`q${request.id}`} className="card-tight px-3.5 py-2.5 text-sm">
                🙋 {request.title} <span className="text-ink-muted">— waiting for an answer</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Your last two weeks of ${settings.pointsLabel}`}>
        <div className="card">
          <PointsSparkline data={trend} />
        </div>
      </Section>
    </>
  );
}
