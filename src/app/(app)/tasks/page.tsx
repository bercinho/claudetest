import { deleteTask, setTaskActive } from "@/actions/tasks";
import { ConfirmSubmit, SubmitButton } from "@/components/forms";
import { TaskForm } from "@/components/task-form";
import { TaskInstanceList } from "@/components/task-list";
import { Disclosure, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { addDays, humanDate, maskToDayNames, nowIn } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { instancesBetween, listChildren, listTasks } from "@/lib/queries";
import type { Settings } from "@/lib/db";
import type { Task, User } from "@/lib/types";

const RECURRENCE_LABEL: Record<Task["recurrence"], string> = {
  ONCE: "One-off",
  DAILY: "Every day",
  WEEKDAYS: "Mon–Fri",
  WEEKLY: "Weekly",
  CUSTOM: "Chosen days",
};

export default async function TasksPage() {
  const user = await requireUser();
  const settings = getSettings();
  const today = nowIn(settings.timezone).date;

  if (user.role === "CHILD") {
    const upcoming = instancesBetween(today, addDays(today, 6), user.id);
    const byDate = groupByDate(upcoming);

    return (
      <>
        <PageHeader title="My tasks" subtitle="The next seven days" />
        {byDate.length === 0 ? (
          <EmptyState icon="🌤️">No tasks scheduled — enjoy it.</EmptyState>
        ) : (
          byDate.map(([date, instances]) => (
            <Section key={date} title={humanDate(date, today)}>
              <TaskInstanceList instances={instances} role="CHILD" settings={settings} today={today} />
            </Section>
          ))
        )}
      </>
    );
  }

  const children = listChildren();
  const tasks = listTasks(undefined, true);

  if (children.length === 0) {
    return (
      <>
        <PageHeader title="Tasks" />
        <EmptyState icon="👋">Add a child on the Family page first.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tasks" subtitle="Chores, homework and habits — one-off or repeating." />

      <Section title="New task">
        <Disclosure label="+ Add a task" tone="primary">
          <TaskForm people={children} defaultChildId={children[0].id} today={today} />
        </Disclosure>
      </Section>

      {children.map((child) => {
        const theirs = tasks.filter((task) => task.child_id === child.id);
        return (
          <Section key={child.id} title={`${child.emoji} ${child.name}`} count={theirs.filter((t) => t.active).length}>
            {theirs.length === 0 ? (
              <EmptyState icon="📋">No tasks yet for {child.name}.</EmptyState>
            ) : (
              <ul className="grid gap-2">
                {theirs.map((task) => (
                  <TaskRow key={task.id} task={task} settings={settings} childrenList={children} today={today} />
                ))}
              </ul>
            )}
          </Section>
        );
      })}

      <Section title="Next seven days">
        <UpcomingSchedule settings={settings} today={today} />
      </Section>
    </>
  );
}

function TaskRow({
  task,
  settings,
  childrenList,
  today,
}: {
  task: Task;
  settings: Settings;
  childrenList: User[];
  today: string;
}) {
  const schedule =
    task.recurrence === "WEEKLY" || task.recurrence === "CUSTOM"
      ? maskToDayNames(task.days_mask)
      : task.recurrence === "ONCE"
        ? task.start_date
        : RECURRENCE_LABEL[task.recurrence];

  return (
    <li className={`card-tight px-3.5 py-3 ${task.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{task.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <Pill>{RECURRENCE_LABEL[task.recurrence]}</Pill>
            <span>{schedule}</span>
            <span>· by {task.due_time}</span>
            {task.points > 0 && <Pill tone="points">+{task.points}</Pill>}
            {task.money_cents > 0 && <Pill tone="money">+{formatMoney(task.money_cents, settings)}</Pill>}
            {task.penalty_points > 0 && <Pill tone="bad">−{task.penalty_points} if missed</Pill>}
            {task.auto_approve === 1 && <Pill tone="good">no review</Pill>}
            {!task.active && <Pill tone="warn">paused</Pill>}
          </div>
          {task.details && <p className="mt-1 text-xs text-ink-muted">{task.details}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <form action={setTaskActive}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="active" value={task.active ? "0" : "1"} />
            <SubmitButton variant="quiet" size="sm">
              {task.active ? "Pause" : "Resume"}
            </SubmitButton>
          </form>
          <form action={deleteTask}>
            <input type="hidden" name="id" value={task.id} />
            <ConfirmSubmit message={`Delete "${task.title}" and its history?`}>Delete</ConfirmSubmit>
          </form>
        </div>
      </div>

      <details className="disclosure mt-2">
        <summary className="btn btn-ghost btn-sm px-0">Edit</summary>
        <div className="mt-2">
          <TaskForm people={childrenList} task={task} today={today} />
        </div>
      </details>
    </li>
  );
}

async function UpcomingSchedule({ settings, today }: { settings: Settings; today: string }) {
  const instances = instancesBetween(today, addDays(today, 6));
  if (instances.length === 0) return <EmptyState icon="🗓️">Nothing scheduled yet.</EmptyState>;

  return (
    <div className="grid gap-4">
      {groupByDate(instances).map(([date, dayInstances]) => (
        <div key={date}>
          <h3 className="mb-1.5 text-sm font-semibold">{humanDate(date, today)}</h3>
          <TaskInstanceList instances={dayInstances} role="PARENT" settings={settings} today={today} showChild />
        </div>
      ))}
    </div>
  );
}

function groupByDate<T extends { due_date: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.due_date) ?? [];
    list.push(item);
    map.set(item.due_date, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
