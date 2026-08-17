import type { Settings } from "./db";

/** Parses user input like "12", "12.50", "12,50" into integer minor units. */
export function parseMoneyToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return 0;
  const raw = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`"${input}" is not a valid amount`);
  return Math.round(value * 100);
}

export function formatMoney(cents: number, settings: Pick<Settings, "currencySymbol" | "currencyPosition">): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return settings.currencyPosition === "after"
    ? `${sign}${body} ${settings.currencySymbol}`
    : `${sign}${settings.currencySymbol}${body}`;
}

/** Same as `formatMoney` but always shows an explicit + or - (for ledger rows). */
export function formatMoneyDelta(
  cents: number,
  settings: Pick<Settings, "currencySymbol" | "currencyPosition">,
): string {
  const formatted = formatMoney(Math.abs(cents), settings);
  return `${cents < 0 ? "−" : "+"}${formatted}`;
}

export function formatPoints(points: number, settings: Pick<Settings, "pointsLabel">): string {
  return `${points} ${settings.pointsLabel}`;
}

export function formatPointsDelta(points: number): string {
  return `${points < 0 ? "−" : "+"}${Math.abs(points)}`;
}
