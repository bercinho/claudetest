"use client";

import { useState } from "react";
import { completeSetup, signIn } from "@/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar } from "@/components/ui";
import type { User } from "@/lib/types";

export function SignInPanel({ users }: { users: User[] }) {
  const [selected, setSelected] = useState<User | null>(users.length === 1 ? users[0] : null);

  if (!selected) {
    return (
      <ul className="grid gap-2.5">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => setSelected(user)}
              className="card flex w-full items-center gap-3 text-left hover:brightness-[1.02]"
            >
              <Avatar emoji={user.emoji} color={user.color} size="lg" />
              <span>
                <span className="block font-semibold">{user.name}</span>
                <span className="block text-xs text-ink-muted">
                  {user.role === "PARENT" ? "Parent" : "Child"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center gap-3">
        <Avatar emoji={selected.emoji} color={selected.color} size="lg" />
        <div>
          <div className="font-semibold">{selected.name}</div>
          <div className="text-xs text-ink-muted">{selected.role === "PARENT" ? "Parent" : "Child"}</div>
        </div>
        {users.length > 1 && (
          <button type="button" onClick={() => setSelected(null)} className="btn btn-ghost btn-sm ml-auto">
            Change
          </button>
        )}
      </div>

      <ActionForm action={signIn}>
        <input type="hidden" name="userId" value={selected.id} />
        <label className="label" htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          className="field text-center text-xl tracking-[0.5em]"
          placeholder="••••"
        />
        <SubmitButton className="mt-3 w-full" pendingLabel="Checking…">
          Sign in
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function SetupPanel() {
  return (
    <div className="card">
      <h2 className="mb-1 font-semibold">Set up your family</h2>
      <p className="mb-4 text-sm text-ink-muted">
        This creates the first parent account. You can add your son and anyone else straight afterwards.
      </p>

      <ActionForm action={completeSetup} className="grid gap-3">
        <div>
          <label className="label" htmlFor="familyName">
            Family name
          </label>
          <input id="familyName" name="familyName" className="field" placeholder="The Kovács family" defaultValue="" />
        </div>
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" name="name" className="field" placeholder="Dad" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="setup-pin">
              Choose a PIN
            </label>
            <input
              id="setup-pin"
              name="pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="field"
              placeholder="4–8 digits"
            />
          </div>
          <div>
            <label className="label" htmlFor="confirmPin">
              Repeat PIN
            </label>
            <input
              id="confirmPin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              className="field"
            />
          </div>
        </div>
        <SubmitButton className="w-full" pendingLabel="Creating…">
          Create family
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
