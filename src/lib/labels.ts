import type { LedgerSource, RequestKind } from "./types";

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
};
