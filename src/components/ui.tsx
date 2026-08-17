import type { ReactNode } from "react";

const AVATAR_COLORS: Record<string, string> = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
};

export function Avatar({
  emoji,
  color,
  size = "md",
}: {
  emoji: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions = size === "lg" ? "h-12 w-12 text-2xl" : size === "sm" ? "h-7 w-7 text-sm" : "h-9 w-9 text-lg";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${dimensions} ${
        AVATAR_COLORS[color] ?? AVATAR_COLORS.sky
      }`}
    >
      {emoji}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="section-title">
          {title}
          {count !== undefined && count > 0 && <span className="ml-1.5 text-ink-muted/70">({count})</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon = "🌱", children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="card flex items-center gap-3 text-sm text-ink-muted">
      <span aria-hidden className="text-xl">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card-tight px-3.5 py-3">
      <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "good" }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`h-full rounded-full transition-[width] ${tone === "good" ? "bg-good" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A collapsible "add / edit" panel, so forms do not crowd the list they belong to. */
export function Disclosure({
  label,
  children,
  open = false,
  tone = "quiet",
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
  tone?: "quiet" | "primary";
}) {
  return (
    <details className="disclosure" open={open}>
      <summary className={`btn ${tone === "primary" ? "btn-primary" : "btn-quiet"} btn-sm`}>{label}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "points" | "money" | "good" | "warn" | "bad";
}) {
  const cls =
    tone === "points"
      ? "pill pill-points"
      : tone === "money"
        ? "pill pill-money"
        : tone === "good"
          ? "pill pill-good"
          : tone === "warn"
            ? "pill pill-warn"
            : tone === "bad"
              ? "pill pill-bad"
              : "pill";
  return <span className={cls}>{children}</span>;
}

/** Tiny sparkline-ish bar chart of daily points. */
export function PointsSparkline({ data }: { data: { date: string; points: number }[] }) {
  const peak = Math.max(1, ...data.map((d) => Math.abs(d.points)));
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {data.map((day) => {
        const height = Math.max(3, Math.round((Math.abs(day.points) / peak) * 38));
        const tone = day.points < 0 ? "bg-bad/70" : day.points > 0 ? "bg-accent" : "bg-surface-2";
        return <span key={day.date} className={`w-full rounded-sm ${tone}`} style={{ height }} title={day.date} />;
      })}
    </div>
  );
}
