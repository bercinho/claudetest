import { saveTask } from "@/actions/tasks";
import { ActionForm, RevealOnValue, SubmitButton } from "@/components/forms";
import { dayNames } from "@/lib/dates";
import type { Task, User } from "@/lib/types";

const RECURRENCE_OPTIONS = [
  { value: "ONCE", label: "One-off" },
  { value: "DAILY", label: "Every day" },
  { value: "WEEKDAYS", label: "School days (Mon–Fri)" },
  { value: "WEEKLY", label: "Chosen days, every week" },
  { value: "CUSTOM", label: "Chosen days" },
] as const;

export function TaskForm({
  people,
  task,
  defaultChildId,
  today,
}: {
  people: User[];
  task?: Task;
  defaultChildId?: number;
  today: string;
}) {
  const recurrence = task?.recurrence ?? "DAILY";
  const mask = task?.days_mask ?? 0;

  return (
    <ActionForm action={saveTask} className="card grid gap-3" onSuccessCollapse={!task} resetOnSuccess={!task}>
      {task && <input type="hidden" name="id" value={task.id} />}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor={`title-${task?.id ?? "new"}`}>
            Task
          </label>
          <input
            id={`title-${task?.id ?? "new"}`}
            name="title"
            className="field"
            defaultValue={task?.title ?? ""}
            placeholder="Make the bed"
            maxLength={80}
          />
        </div>
        <div>
          <label className="label" htmlFor={`child-${task?.id ?? "new"}`}>
            Who
          </label>
          <select
            id={`child-${task?.id ?? "new"}`}
            name="childId"
            className="field"
            defaultValue={task?.child_id ?? defaultChildId}
          >
            {people.map((child) => (
              <option key={child.id} value={child.id}>
                {child.emoji} {child.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`details-${task?.id ?? "new"}`}>
          Details (optional)
        </label>
        <input
          id={`details-${task?.id ?? "new"}`}
          name="details"
          className="field"
          defaultValue={task?.details ?? ""}
          placeholder="Sheets straight, pillows on top"
          maxLength={500}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor={`points-${task?.id ?? "new"}`}>
            Points
          </label>
          <input
            id={`points-${task?.id ?? "new"}`}
            name="points"
            type="number"
            min={0}
            className="field"
            defaultValue={task?.points ?? 5}
          />
        </div>
        <div>
          <label className="label" htmlFor={`money-${task?.id ?? "new"}`}>
            Money
          </label>
          <input
            id={`money-${task?.id ?? "new"}`}
            name="money"
            className="field"
            inputMode="decimal"
            defaultValue={task ? (task.money_cents / 100).toFixed(2) : "0"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`penalty-${task?.id ?? "new"}`}>
            Missed penalty
          </label>
          <input
            id={`penalty-${task?.id ?? "new"}`}
            name="penaltyPoints"
            type="number"
            min={0}
            className="field"
            defaultValue={task?.penalty_points ?? 0}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor={`recurrence-${task?.id ?? "new"}`}>
            Repeats
          </label>
          <select
            id={`recurrence-${task?.id ?? "new"}`}
            name="recurrence"
            className="field"
            defaultValue={recurrence}
          >
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`dueTime-${task?.id ?? "new"}`}>
            Due by
          </label>
          <input
            id={`dueTime-${task?.id ?? "new"}`}
            name="dueTime"
            type="time"
            className="field"
            defaultValue={task?.due_time ?? "20:00"}
          />
        </div>
      </div>

      <RevealOnValue name="recurrence" values={["WEEKLY", "CUSTOM"]} initial={recurrence}>
        <span className="label">On these days</span>
        <div className="flex flex-wrap gap-1.5">
          {dayNames().map((day, index) => (
            <label
              key={day}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium"
            >
              <input
                type="checkbox"
                name="days"
                value={index + 1}
                defaultChecked={(mask & (1 << index)) !== 0}
                className="accent-[var(--color-accent)]"
              />
              {day}
            </label>
          ))}
        </div>
      </RevealOnValue>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`start-${task?.id ?? "new"}`}>
            Starts
          </label>
          <input
            id={`start-${task?.id ?? "new"}`}
            name="startDate"
            type="date"
            className="field"
            defaultValue={task?.start_date ?? today}
          />
        </div>
        <div>
          <label className="label" htmlFor={`end-${task?.id ?? "new"}`}>
            Ends (optional)
          </label>
          <input
            id={`end-${task?.id ?? "new"}`}
            name="endDate"
            type="date"
            className="field"
            defaultValue={task?.end_date ?? ""}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="autoApprove"
          defaultChecked={task ? task.auto_approve === 1 : false}
          className="accent-[var(--color-accent)]"
        />
        Trust it — pay out as soon as he ticks it off, no review
      </label>

      <div>
        <SubmitButton pendingLabel="Saving…">{task ? "Save changes" : "Create task"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
