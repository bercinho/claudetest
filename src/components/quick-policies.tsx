"use client";

import { useFormStatus } from "react-dom";
import { applyPolicy } from "@/actions/policies";
import { ActionForm } from "@/components/forms";
import type { Settings } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import type { Policy } from "@/lib/types";

function PolicyButton({ policy, settings }: { policy: Policy; settings: Settings }) {
  const { pending } = useFormStatus();
  const reward = policy.kind === "REWARD";
  const bits = [
    policy.points > 0 ? `${reward ? "+" : "−"}${policy.points}` : null,
    policy.money_cents > 0 ? `${reward ? "+" : "−"}${formatMoney(policy.money_cents, settings)}` : null,
  ].filter(Boolean);

  return (
    <button
      type="submit"
      name="policyId"
      value={policy.id}
      disabled={pending}
      title={policy.details || policy.title}
      className={`btn btn-sm ${reward ? "btn-good" : "btn-bad"} max-w-full`}
    >
      <span className="truncate">{policy.title}</span>
      <span className="opacity-80">{bits.join(" ")}</span>
    </button>
  );
}

/**
 * One-tap enforcement of house rules. All buttons share a single form, and the
 * clicked button supplies the policy id.
 */
export function QuickPolicies({
  childId,
  policies,
  settings,
}: {
  childId: number;
  policies: Policy[];
  settings: Settings;
}) {
  if (policies.length === 0) return null;

  return (
    <ActionForm action={applyPolicy} resetOnSuccess>
      <input type="hidden" name="childId" value={childId} />
      <div className="flex flex-wrap gap-1.5">
        {policies.map((policy) => (
          <PolicyButton key={policy.id} policy={policy} settings={settings} />
        ))}
      </div>
      <input name="note" className="field mt-2 text-xs" placeholder="Optional note (what happened?)" maxLength={300} />
    </ActionForm>
  );
}
