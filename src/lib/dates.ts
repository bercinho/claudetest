/**
 * Date helpers. Everything the app stores is a plain local calendar date
 * (`YYYY-MM-DD`) or time (`HH:MM`) in the family's configured timezone, so all
 * comparisons are done on strings and all arithmetic is done in UTC to avoid
 * daylight-saving drift.
 */

export type ISODate = string; // YYYY-MM-DD

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(timezone, f);
  }
  return f;
}

/** Current local date and time in the given timezone. */
export function nowIn(timezone: string, at: Date = new Date()): { date: ISODate; time: string } {
  const parts = formatter(timezone).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // Intl renders midnight as "24" in some runtimes; normalise it.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

export function today(timezone: string, at: Date = new Date()): ISODate {
  return nowIn(timezone, at).date;
}

/** True when `dueDate`/`dueTime` is strictly in the past for the given timezone. */
export function isOverdue(dueDate: ISODate, dueTime: string, timezone: string): boolean {
  const now = nowIn(timezone);
  return `${dueDate}T${dueTime}` < `${now.date}T${now.time}`;
}

function toUtc(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Same day-of-month `months` earlier/later, clamped to the end of short months. */
export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtc(target);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(date: ISODate): number {
  const day = toUtc(date).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -(isoDayOfWeek(date) - 1));
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** ISO week key such as `2026-W33`, used to remember which allowance periods were paid. */
export function isoWeekKey(date: ISODate): string {
  const d = toUtc(date);
  // Shift to the Thursday of the same ISO week; its calendar year is the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - isoDayOfWeek(date));
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weekdayName(date: ISODate): string {
  return WEEKDAY_NAMES[isoDayOfWeek(date) - 1];
}

export function maskToDayNames(mask: number): string {
  const names = WEEKDAY_NAMES.filter((_, i) => (mask & (1 << i)) !== 0);
  if (names.length === 0) return "no days";
  if (names.length === 7) return "every day";
  return names.join(", ");
}

export function dayNames(): string[] {
  return [...WEEKDAY_NAMES];
}

/** Human label for a date relative to `todayDate`: "Today", "Tomorrow", "Mon 18 Aug". */
export function humanDate(date: ISODate, todayDate: ISODate): string {
  const diff = daysBetween(todayDate, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = toUtc(date);
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${weekdayName(date)} ${d.getUTCDate()} ${month}`;
}

/** "Monday, 17 August" — for page subtitles, where "Today" would just echo the title. */
export function fullDate(date: ISODate): string {
  const d = toUtc(date);
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Formats a stored `datetime('now')` UTC timestamp for display in the family timezone. */
export function formatTimestamp(utcTimestamp: string, timezone: string): string {
  const iso = utcTimestamp.includes("T") ? utcTimestamp : utcTimestamp.replace(" ", "T");
  const d = new Date(`${iso}${iso.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(d.getTime())) return utcTimestamp;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
