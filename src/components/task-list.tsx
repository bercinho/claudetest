import { submitTask, unsubmitTask } from "@/actions/tasks";
import { SubmitButton } from "@/components/forms";
import { Pill } from "@/components/ui";
import type { Settings } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import type { Role, TaskInstanceView, TaskStatus } from "@/lib/types";

const STATUS_STYLE: Record<TaskStatus, { icon: string; label: string; tone: "good" | "warn" | "bad" | "default" }> = {
  PENDING: { icon: "○", label: "To do", tone: "default" },
  SUBMITTED: { icon: "◔", label: "Waiting for review", tone: "warn" },
  APPROVED: { icon: "●", label: "Done", tone: "good" },
  REJECTED: { icon: "✕", label: "Not accepted", tone: "bad" },
  MISSED: { icon: "!", label: "Missed", tone: "bad" },
  SKIPPED: { icon: "–", label: "Skipped", tone: "default" },
};

export function TaskInstanceRow({
  instance,
  role,
  settings,
  today,
  showChild = false,
  showDate = false,
}: {
  instance: TaskInstanceView;
  role: Role;
  settings: Settings;
  /** Today's date in the family timezone — occurrences dated later cannot be ticked off yet. */
  today: string;
  showChild?: boolean;
  showDate?: boolean;
}) {
  const style = STATUS_STYLE[instance.status];
  const done = instance.status === "APPROVED";
  const openStatus =
    instance.status === "PENDING" || instance.status === "MISSED" || instance.status === "REJECTED";
  const canSubmit = openStatus && instance.due_date <= today;

  return (
    <li className="card-tight flex items-start gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-good-soft text-good"
            : style.tone === "bad"
              ? "bg-bad-soft text-bad"
              : style.tone === "warn"
                ? "bg-warn-soft text-warn"
                : "bg-surface-2 text-ink-muted"
        }`}
      >
        {style.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className={`font-medium ${done ? "text-ink-muted line-through" : ""}`}>{instance.title}</div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          {showChild && (
            <span>
              {instance.child_emoji} {instance.child_name}
            </span>
          )}
          {showDate && <span>{instance.due_date}</span>}
          <span>by {instance.due_time}</span>
          {instance.points > 0 && <Pill tone="points">+{instance.points}</Pill>}
          {instance.money_cents > 0 && <Pill tone="money">+{formatMoney(instance.money_cents, settings)}</Pill>}
          {instance.penalty_points > 0 && !done && <Pill tone="bad">−{instance.penalty_points} if missed</Pill>}
          {instance.status !== "PENDING" && <Pill tone={style.tone}>{style.label}</Pill>}
        </div>

        {instance.details && <p className="mt-1.5 text-xs text-ink-muted">{instance.details}</p>}
        {instance.parent_note && (
          <p className="mt-1.5 text-xs italic text-ink-muted">Note from parent: {instance.parent_note}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {canSubmit && (
          <form action={submitTask}>
            <input type="hidden" name="instanceId" value={instance.id} />
            <SubmitButton variant={role === "PARENT" ? "good" : "primary"} size="sm" pendingLabel="…">
              {role === "PARENT" ? "Mark done" : instance.status === "PENDING" ? "I did it" : "Done late"}
            </SubmitButton>
          </form>
        )}

        {openStatus && !canSubmit && <span className="text-xs text-ink-muted">not yet</span>}

        {instance.status === "SUBMITTED" && role === "CHILD" && (
          <form action={unsubmitTask}>
            <input type="hidden" name="instanceId" value={instance.id} />
            <SubmitButton variant="ghost" size="sm">
              Undo
            </SubmitButton>
          </form>
        )}

        {done && instance.points_awarded !== instance.points && instance.points_awarded > 0 && (
          <Pill tone="good">+{instance.points_awarded} awarded</Pill>
        )}
      </div>
    </li>
  );
}

export function TaskInstanceList({
  instances,
  role,
  settings,
  today,
  showChild = false,
  showDate = false,
}: {
  instances: TaskInstanceView[];
  role: Role;
  settings: Settings;
  today: string;
  showChild?: boolean;
  showDate?: boolean;
}) {
  return (
    <ul className="grid gap-2">
      {instances.map((instance) => (
        <TaskInstanceRow
          key={instance.id}
          instance={instance}
          role={role}
          settings={settings}
          today={today}
          showChild={showChild}
          showDate={showDate}
        />
      ))}
    </ul>
  );
}
