import type { Attendance, EventKind, GradeKind, LedgerSource, RequestKind } from "./types";

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  MONEY: "Money",
  PERMISSION: "Permission",
  PURCHASE: "Something to buy",
  SCREEN_TIME: "Screen time",
  OTHER: "Other",
};

export const REQUEST_KIND_OPTIONS: { value: RequestKind; label: string; hint: string }[] = [
  { value: "PERMISSION", label: "Permission", hint: "Can I go to Máté's after school?" },
  { value: "MONEY", label: "Money", hint: "An advance or a one-off top-up" },
  { value: "PURCHASE", label: "Something to buy", hint: "New football boots" },
  { value: "SCREEN_TIME", label: "Screen time", hint: "An extra half hour tonight" },
  { value: "OTHER", label: "Other", hint: "Anything else" },
];

export const LEDGER_SOURCE_LABEL: Record<LedgerSource, { label: string; icon: string }> = {
  TASK: { label: "Task", icon: "📋" },
  TASK_MISSED: { label: "Missed task", icon: "⌛" },
  POLICY: { label: "House rule", icon: "⚖️" },
  REWARD: { label: "Reward", icon: "🎁" },
  REQUEST: { label: "Request", icon: "🙋" },
  ALLOWANCE: { label: "Pocket money", icon: "💰" },
  GOAL: { label: "Savings goal", icon: "🎯" },
  MANUAL: { label: "Adjustment", icon: "✍️" },
  GRADE: { label: "School mark", icon: "🎓" },
  SPORT: { label: "Sport", icon: "🤽" },
};

export const GRADE_KIND_LABEL: Record<GradeKind, string> = {
  TEST: "Test",
  ORAL: "Oral",
  HOMEWORK: "Homework",
  PROJECT: "Project",
  EXAM: "Exam",
  OTHER: "Other",
};

export const EVENT_KIND: Record<EventKind, { label: string; icon: string; sport: boolean }> = {
  LESSON: { label: "Lesson", icon: "📘", sport: false },
  EXAM: { label: "Exam", icon: "📝", sport: false },
  TRAINING: { label: "Training", icon: "🏊", sport: true },
  MATCH: { label: "Match", icon: "🤽", sport: true },
  TOURNAMENT: { label: "Tournament", icon: "🏆", sport: true },
  OTHER: { label: "Other", icon: "📌", sport: false },
};

export const ATTENDANCE: Record<Attendance, { label: string; tone: "default" | "good" | "warn" | "bad" }> = {
  PLANNED: { label: "Planned", tone: "default" },
  PRESENT: { label: "Was there", tone: "good" },
  ABSENT: { label: "Missed it", tone: "bad" },
  EXCUSED: { label: "Excused", tone: "warn" },
  CANCELLED: { label: "Cancelled", tone: "default" },
};

/** Sport sessions need their attendance recorded; ordinary lessons do not. */
export function needsAttendance(kind: EventKind): boolean {
  return EVENT_KIND[kind].sport || kind === "EXAM";
}
