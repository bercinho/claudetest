"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/form";

type ServerAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action that reports success or failure inline.
 * `resetOnSuccess` clears the fields so "add another" flows feel right.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  onSuccessCollapse = false,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Closes the surrounding <details> panel once the action succeeds. */
  onSuccessCollapse?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    if (onSuccessCollapse) ref.current?.closest("details")?.removeAttribute("open");
  }, [state, resetOnSuccess, onSuccessCollapse]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`mt-2.5 rounded-lg px-3 py-2 text-sm ${
        state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
      }`}
    >
      {state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size,
  className = "",
  pendingLabel,
}: {
  children: ReactNode;
  variant?: "primary" | "quiet" | "good" | "bad" | "ghost";
  size?: "sm";
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Submit button for destructive actions; asks first. */
export function ConfirmSubmit({
  children,
  message,
  variant = "bad",
  size = "sm",
}: {
  children: ReactNode;
  message: string;
  variant?: "primary" | "quiet" | "good" | "bad" | "ghost";
  size?: "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""}`}
    >
      {children}
    </button>
  );
}

/** Shows extra fields only for the chosen recurrence / kind, without a round-trip. */
export function RevealOnValue({
  name,
  values,
  children,
  initial,
}: {
  name: string;
  values: string[];
  children: ReactNode;
  initial: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current?.closest("form");
    if (!container) return;
    const update = () => {
      const data = new FormData(container);
      const current = String(data.get(name) ?? initial);
      if (ref.current) ref.current.hidden = !values.includes(current);
    };
    update();
    container.addEventListener("change", update);
    return () => container.removeEventListener("change", update);
  }, [name, values, initial]);

  return <div ref={ref}>{children}</div>;
}
