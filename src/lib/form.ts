import { parseMoneyToCents } from "./money";

export type ActionState = { ok: boolean; message: string } | null;

export function ok(message = "Saved"): ActionState {
  return { ok: true, message };
}

export function fail(message: string): ActionState {
  return { ok: false, message };
}

export class ValidationError extends Error {}

export function str(form: FormData, key: string, options: { max?: number; required?: boolean } = {}): string {
  const value = String(form.get(key) ?? "").trim();
  if (options.required && value === "") throw new ValidationError(`${label(key)} is required`);
  if (options.max && value.length > options.max) {
    throw new ValidationError(`${label(key)} must be at most ${options.max} characters`);
  }
  return value;
}

export function int(form: FormData, key: string, options: { min?: number; max?: number; fallback?: number } = {}): number {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") {
    if (options.fallback !== undefined) return options.fallback;
    throw new ValidationError(`${label(key)} is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(`${label(key)} must be a whole number`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`${label(key)} must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`${label(key)} must be at most ${options.max}`);
  }
  return value;
}

export function money(form: FormData, key: string, options: { min?: number } = {}): number {
  try {
    const cents = parseMoneyToCents(String(form.get(key) ?? ""));
    if (options.min !== undefined && cents < options.min) {
      throw new ValidationError(`${label(key)} cannot be negative`);
    }
    return cents;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label(key)} is not a valid amount`);
  }
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function oneOf<T extends string>(form: FormData, key: string, allowed: readonly T[], fallback?: T): T {
  const value = String(form.get(key) ?? "") as T;
  if (allowed.includes(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new ValidationError(`${label(key)} must be one of: ${allowed.join(", ")}`);
}

export function optionalDate(form: FormData, key: string): string | null {
  const value = str(form, key);
  if (value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError(`${label(key)} must be a date`);
  return value;
}

export function time(form: FormData, key: string, fallback = "20:00"): string {
  const value = str(form, key);
  if (value === "") return fallback;
  if (!/^\d{2}:\d{2}$/.test(value)) throw new ValidationError(`${label(key)} must be a time`);
  return value;
}

function label(key: string): string {
  const words = key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `redirect()` and `notFound()` signal by throwing; those must pass straight through. */
function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Wraps an action body so validation and permission errors become form messages. */
export async function guard(body: () => Promise<ActionState> | ActionState): Promise<ActionState> {
  try {
    return await body();
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    const message = error instanceof Error ? error.message : "Something went wrong";
    return fail(message);
  }
}
