import "server-only";

import { getDb } from "./db";
import { formatMinutes } from "./screens";
import { push, usersInRole } from "./push";

/**
 * The notifications the app actually sends. Kept in one place so the whole set
 * can be read at a glance — and so the actions that trigger them stay about
 * their own job.
 *
 * Nothing here throws or is awaited: a notification is a courtesy, never a
 * precondition for the change that caused it.
 */

function childName(childId: number): string {
  const row = getDb().prepare("SELECT name FROM users WHERE id = ?").get(childId) as { name: string } | undefined;
  return row?.name ?? "Your child";
}

/** Everyone who can act on an approval — all parents but the one who acted. */
function parents(exceptUserId?: number): number[] {
  return usersInRole("PARENT", exceptUserId);
}

// ---------------------------------------------------------------------------
// Child → parents
// ---------------------------------------------------------------------------

export function taskSubmitted(childId: number, title: string): void {
  push(parents(), {
    title: `${childName(childId)} finished a task`,
    body: title,
    url: "/approvals",
    tag: "approvals",
  });
}

export function screenTimeAsked(childId: number, minutes: number, what: string): void {
  push(parents(), {
    title: `${childName(childId)} is asking for ${formatMinutes(minutes)}`,
    body: what || "Screen time",
    url: "/approvals",
    tag: "approvals",
  });
}

export function rewardAsked(childId: number, rewardTitle: string): void {
  push(parents(), {
    title: `${childName(childId)} wants to redeem a reward`,
    body: rewardTitle,
    url: "/approvals",
    tag: "approvals",
  });
}

export function requestOpened(childId: number, title: string): void {
  push(parents(), {
    title: `${childName(childId)} is asking`,
    body: title,
    url: "/approvals",
    tag: "approvals",
  });
}

export function gradeEntered(childId: number, subject: string, mark: string): void {
  push(parents(), {
    title: `${childName(childId)} recorded a mark`,
    body: `${subject}: ${mark} — waiting for you to confirm`,
    url: "/approvals",
    tag: "approvals",
  });
}

// ---------------------------------------------------------------------------
// Parents → child
// ---------------------------------------------------------------------------

export function screenTimeDecided(args: {
  childId: number;
  approved: boolean;
  granted: number;
  requested: number;
  note: string;
}): void {
  const { childId, approved, granted, requested, note } = args;
  const title = !approved
    ? "Screen time declined"
    : granted < requested
      ? `${formatMinutes(granted)} instead of ${formatMinutes(requested)}`
      : `${formatMinutes(granted)} approved`;

  push([childId], { title, body: note || (approved ? "Enjoy it." : ""), url: "/screens", tag: "screens" });
}

export function taskReviewed(childId: number, title: string, decision: "approve" | "reject" | "skip", note: string): void {
  const heading =
    decision === "approve" ? "Task approved" : decision === "reject" ? "Task sent back" : "Task skipped";
  push([childId], { title: heading, body: note ? `${title} — ${note}` : title, url: "/tasks", tag: "tasks" });
}

export function requestDecided(childId: number, title: string, approved: boolean, note: string): void {
  push([childId], {
    title: approved ? "Answer: yes" : "Answer: no",
    body: note ? `${title} — ${note}` : title,
    url: "/requests",
    tag: "requests",
  });
}

export function rewardDecided(childId: number, rewardTitle: string, approved: boolean, note: string): void {
  push([childId], {
    title: approved ? "Reward approved" : "Reward declined",
    body: note ? `${rewardTitle} — ${note}` : rewardTitle,
    url: "/rewards",
    tag: "rewards",
  });
}

export function gradeConfirmed(childId: number, subject: string, points: number): void {
  push([childId], {
    title: "Mark confirmed",
    body: points > 0 ? `${subject} — worth ${points} points` : subject,
    url: "/school",
    tag: "school",
  });
}

export function policyApplied(childId: number, ruleTitle: string, points: number): void {
  push([childId], {
    title: points < 0 ? `−${Math.abs(points)} points` : `+${points} points`,
    body: ruleTitle,
    url: "/activity",
    tag: "activity",
  });
}

export function screenMinutesAdjusted(childId: number, minutes: number, reason: string): void {
  push([childId], {
    title: minutes > 0 ? `${formatMinutes(minutes)} added to today` : `${formatMinutes(-minutes)} taken off today`,
    body: reason,
    url: "/screens",
    tag: "screens",
  });
}
