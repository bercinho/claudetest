import { EmptyState, PageHeader, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { formatTimestamp } from "@/lib/dates";
import { LEDGER_SOURCE_LABEL } from "@/lib/labels";
import { recentEntries } from "@/lib/ledger";
import { formatMoneyDelta, formatPointsDelta } from "@/lib/money";

export default async function ActivityPage() {
  const user = await requireUser();
  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const entries = recentEntries(isParent ? null : user.id, 100);

  return (
    <>
      <PageHeader
        title={isParent ? "Activity" : "History"}
        subtitle="Every point and every cent, and exactly why it moved."
      />

      <Section title="Latest first">
        {entries.length === 0 ? (
          <EmptyState icon="📜">Nothing has happened yet.</EmptyState>
        ) : (
          <ul className="grid gap-1.5">
            {entries.map((entry) => {
              const source = LEDGER_SOURCE_LABEL[entry.source];
              return (
                <li key={entry.id} className="card-tight flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span aria-hidden className="text-base">
                    {source.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{entry.reason}</div>
                    <div className="text-xs text-ink-muted">
                      {isParent && `${entry.child_name} · `}
                      {source.label} · {formatTimestamp(entry.created_at, settings.timezone)}
                    </div>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${entry.amount < 0 ? "text-bad" : "text-good"}`}>
                    {entry.currency === "MONEY"
                      ? formatMoneyDelta(entry.amount, settings)
                      : `${formatPointsDelta(entry.amount)} ${settings.pointsLabel}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
