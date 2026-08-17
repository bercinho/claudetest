import type { Settings } from "./db";
import type { Grade } from "./types";

type Scale = Pick<Settings, "gradeMin" | "gradeMax" | "gradeBestIsHigh">;

/**
 * Turns a mark into a 0–1 ratio so marks from different scales can be averaged
 * together — a 4/5 on a 1–5 scale and an 87/100 test are both just fractions.
 *
 * The floor matters. On a school scale the worst mark is usually 1, not 0, so
 * 4 out of 5 is three quarters of the way up, not four fifths. A mark written
 * out of anything other than the school's own maximum is read as points scored
 * and gets a floor of 0.
 */
export function gradeRatio(value: number, outOf: number, scale: Scale): number {
  if (outOf <= 0) return 0;
  const onSchoolScale = Math.abs(outOf - scale.gradeMax) < 1e-9;
  const floor = onSchoolScale ? scale.gradeMin : 0;
  const span = outOf - floor;
  if (span <= 0) return 0;

  const ratio = (value - floor) / span;
  const normalised = scale.gradeBestIsHigh ? ratio : 1 - ratio;
  return Math.min(1, Math.max(0, normalised));
}

/** Puts a 0–1 ratio back onto the school's own scale, for display. */
export function ratioToScale(ratio: number, scale: Scale): number {
  const span = scale.gradeMax - scale.gradeMin;
  return scale.gradeBestIsHigh ? scale.gradeMin + ratio * span : scale.gradeMax - ratio * span;
}

export type Average = {
  /** Weighted mean expressed on the school's scale, e.g. 4.27 out of 5. */
  onScale: number;
  /** The same thing as a percentage. */
  percent: number;
  /** How many marks went into it (weights, not rows). */
  weight: number;
  count: number;
};

/** Weighted average of confirmed marks. Returns null when there is nothing to average. */
export function average(grades: Grade[], scale: Scale): Average | null {
  const counted = grades.filter((grade) => grade.confirmed === 1 && grade.weight > 0);
  if (counted.length === 0) return null;

  let weighted = 0;
  let weight = 0;
  for (const grade of counted) {
    weighted += gradeRatio(grade.value, grade.out_of, scale) * grade.weight;
    weight += grade.weight;
  }

  const ratio = weighted / weight;
  return {
    onScale: Math.round(ratioToScale(ratio, scale) * 100) / 100,
    percent: Math.round(ratio * 100),
    weight,
    count: counted.length,
  };
}

/** "4 / 5" or "87 / 100", without trailing zeroes. */
export function formatGrade(value: number, outOf: number): string {
  const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  return `${trim(value)} / ${trim(outOf)}`;
}

/** Colour band for a mark or an average, so the page reads at a glance. */
export function gradeTone(ratio: number): "good" | "warn" | "bad" {
  if (ratio >= 0.7) return "good";
  if (ratio >= 0.45) return "warn";
  return "bad";
}

/**
 * The points a mark is worth, offered as a starting figure when a parent
 * confirms it. Deliberately generous at the top and never negative — a bad
 * mark is its own consequence.
 */
export function suggestedPoints(ratio: number): number {
  if (ratio >= 0.95) return 30;
  if (ratio >= 0.8) return 20;
  if (ratio >= 0.6) return 10;
  return 0;
}
