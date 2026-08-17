import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { hasAnyUser, listUsers } from "@/lib/queries";
import { SetupPanel, SignInPanel } from "./panels";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  const settings = getSettings();
  const needsSetup = !hasAnyUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
        <div className="text-4xl" aria-hidden>
          🏡
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{needsSetup ? "Family HQ" : settings.familyName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {needsSetup
            ? "Tasks, house rules, rewards and pocket money — in one place."
            : "Pick your profile to sign in."}
        </p>
      </div>

      {needsSetup ? <SetupPanel /> : <SignInPanel users={listUsers()} />}
    </main>
  );
}
