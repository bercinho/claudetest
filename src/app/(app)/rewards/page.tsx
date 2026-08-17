import { cancelRedemption, deleteReward, requestRedemption, saveReward, setRewardActive } from "@/actions/rewards";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Disclosure, EmptyState, PageHeader, Pill, Section, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings, type Settings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { wallet } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { listChildren, listRedemptions, listRewards } from "@/lib/queries";
import type { Reward, User } from "@/lib/types";

export default async function RewardsPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const children = listChildren();
  const rewards = isParent ? listRewards(undefined, true) : listRewards(user.id);
  const purse = isParent ? null : wallet(user.id);

  return (
    <>
      <PageHeader
        title="Rewards"
        subtitle={isParent ? "What points and pocket money can be spent on." : "Spend what you have earned."}
      />

      {purse && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Stat label={settings.pointsLabel} value={purse.points} />
          <Stat label="To spend" value={formatMoney(purse.spendable_cents, settings)} />
        </div>
      )}

      {isParent && (
        <Section title="New reward">
          <Disclosure label="+ Add a reward" tone="primary">
            <RewardForm childrenList={children} />
          </Disclosure>
        </Section>
      )}

      <Section title={isParent ? "Catalogue" : "Shop"} count={rewards.filter((reward) => reward.active).length}>
        {rewards.length === 0 ? (
          <EmptyState icon="🎁">No rewards yet.</EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rewards.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                settings={settings}
                isParent={isParent}
                childrenList={children}
                buyerId={user.role === "CHILD" ? user.id : undefined}
                affordable={
                  purse
                    ? purse.points >= reward.cost_points && purse.spendable_cents >= reward.cost_money_cents
                    : true
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent redemptions">
        <RedemptionHistory settings={settings} childId={isParent ? undefined : user.id} />
      </Section>
    </>
  );
}

function RewardCard({
  reward,
  settings,
  isParent,
  childrenList,
  buyerId,
  affordable,
}: {
  reward: Reward;
  settings: Settings;
  isParent: boolean;
  childrenList: User[];
  buyerId?: number;
  affordable: boolean;
}) {
  const soldOut = reward.stock !== null && reward.stock <= 0;
  const owner = reward.child_id ? childrenList.find((child) => child.id === reward.child_id) : null;

  return (
    <li className={`card flex flex-col ${reward.active ? "" : "opacity-60"}`}>
      <div className="font-medium">{reward.title}</div>
      {reward.details && <p className="mt-1 text-xs text-ink-muted">{reward.details}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {reward.cost_points > 0 && <Pill tone="points">{reward.cost_points} {settings.pointsLabel}</Pill>}
        {reward.cost_money_cents > 0 && <Pill tone="money">{formatMoney(reward.cost_money_cents, settings)}</Pill>}
        {reward.stock !== null && <Pill tone={soldOut ? "bad" : "warn"}>{reward.stock} left</Pill>}
        {owner && <Pill>{owner.emoji} {owner.name} only</Pill>}
        {!reward.active && <Pill tone="warn">hidden</Pill>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {buyerId !== undefined && reward.active && (
          <ActionForm action={requestRedemption} className="w-full">
            <input type="hidden" name="rewardId" value={reward.id} />
            <input type="hidden" name="childId" value={buyerId} />
            <input name="note" className="field mb-2 text-xs" placeholder="Anything to add? (optional)" maxLength={300} />
            <SubmitButton className="w-full" pendingLabel="Sending…" variant={affordable && !soldOut ? "primary" : "quiet"}>
              {soldOut ? "Sold out" : affordable ? "Ask to redeem" : "Not enough yet"}
            </SubmitButton>
          </ActionForm>
        )}

        {isParent && (
          <>
            <form action={setRewardActive}>
              <input type="hidden" name="id" value={reward.id} />
              <input type="hidden" name="active" value={reward.active ? "0" : "1"} />
              <SubmitButton variant="quiet" size="sm">
                {reward.active ? "Hide" : "Show"}
              </SubmitButton>
            </form>
            <form action={deleteReward}>
              <input type="hidden" name="id" value={reward.id} />
              <ConfirmSubmit message={`Delete the reward "${reward.title}"?`}>Delete</ConfirmSubmit>
            </form>
          </>
        )}
      </div>

      {isParent && (
        <details className="disclosure mt-2">
          <summary className="btn btn-ghost btn-sm px-0">Edit</summary>
          <div className="mt-2">
            <RewardForm reward={reward} childrenList={childrenList} />
          </div>
        </details>
      )}
    </li>
  );
}

function RewardForm({ reward, childrenList }: { reward?: Reward; childrenList: User[] }) {
  const key = reward?.id ?? "new";
  return (
    <ActionForm action={saveReward} className="card grid gap-3" resetOnSuccess={!reward} onSuccessCollapse={!reward}>
      {reward && <input type="hidden" name="id" value={reward.id} />}

      <div>
        <label className="label" htmlFor={`rtitle-${key}`}>
          Reward
        </label>
        <input
          id={`rtitle-${key}`}
          name="title"
          className="field"
          defaultValue={reward?.title ?? ""}
          placeholder="An hour of extra screen time"
          maxLength={80}
        />
      </div>

      <div>
        <label className="label" htmlFor={`rdetails-${key}`}>
          Details (optional)
        </label>
        <input
          id={`rdetails-${key}`}
          name="details"
          className="field"
          defaultValue={reward?.details ?? ""}
          maxLength={500}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor={`rpoints-${key}`}>
            Costs points
          </label>
          <input
            id={`rpoints-${key}`}
            name="costPoints"
            type="number"
            min={0}
            className="field"
            defaultValue={reward?.cost_points ?? 50}
          />
        </div>
        <div>
          <label className="label" htmlFor={`rmoney-${key}`}>
            Costs money
          </label>
          <input
            id={`rmoney-${key}`}
            name="costMoney"
            className="field"
            inputMode="decimal"
            defaultValue={reward ? (reward.cost_money_cents / 100).toFixed(2) : "0"}
          />
        </div>
        <div>
          <label className="label" htmlFor={`rstock-${key}`}>
            Stock
          </label>
          <input
            id={`rstock-${key}`}
            name="stock"
            type="number"
            min={0}
            className="field"
            placeholder="∞"
            defaultValue={reward?.stock ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor={`rchild-${key}`}>
            For
          </label>
          <select id={`rchild-${key}`} name="childId" className="field" defaultValue={reward?.child_id ?? 0}>
            <option value={0}>Everyone</option>
            {childrenList.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">{reward ? "Save changes" : "Add reward"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function RedemptionHistory({ settings, childId }: { settings: Settings; childId?: number }) {
  const redemptions = listRedemptions({ childId, limit: 20 });
  if (redemptions.length === 0) return <EmptyState icon="🛍️">Nothing redeemed yet.</EmptyState>;

  const tone = { REQUESTED: "warn", APPROVED: "good", DENIED: "bad", CANCELLED: "default" } as const;
  const label = { REQUESTED: "waiting", APPROVED: "approved", DENIED: "declined", CANCELLED: "cancelled" };

  return (
    <ul className="grid gap-1.5">
      {redemptions.map((redemption) => (
        <li key={redemption.id} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <span className="font-medium">{redemption.reward_title}</span>
            {!childId && <span className="text-ink-muted"> · {redemption.child_name}</span>}
            <div className="text-xs text-ink-muted">
              {formatTimestamp(redemption.created_at, settings.timezone)}
              {redemption.parent_note && ` · “${redemption.parent_note}”`}
            </div>
          </div>
          <Pill tone={tone[redemption.status]}>{label[redemption.status]}</Pill>
          {redemption.status === "REQUESTED" && (
            <form action={cancelRedemption}>
              <input type="hidden" name="id" value={redemption.id} />
              <SubmitButton variant="ghost" size="sm">
                Cancel
              </SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
