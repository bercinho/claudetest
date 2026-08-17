import { redirect } from "next/navigation";
import { signOut } from "@/actions/auth";
import { NavBar, type NavItem } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { approvalCounts } from "@/lib/queries";
import { runMaintenance } from "@/lib/scheduler";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Creates due occurrences, closes overdue ones and releases pocket money.
  runMaintenance();

  const settings = getSettings();
  const isParent = user.role === "PARENT";
  const approvals = isParent ? approvalCounts() : null;

  // The everyday pages stay on the bar; the rest live behind "More".
  const items: NavItem[] = isParent
    ? [
        { href: "/", label: "Home", icon: "🏠" },
        { href: "/week", label: "Week", icon: "🗓️" },
        { href: "/approvals", label: "Approvals", icon: "✅", badge: approvals?.total },
        { href: "/tasks", label: "Tasks", icon: "📋" },
        { href: "/screens", label: "Screens", icon: "🎮" },
        { href: "/school", label: "School", icon: "🎓" },
        { href: "/sport", label: "Sport", icon: "🤽" },
      ]
    : [
        { href: "/", label: "Home", icon: "🏠" },
        { href: "/week", label: "Week", icon: "🗓️" },
        { href: "/screens", label: "Screens", icon: "🎮" },
        { href: "/tasks", label: "My tasks", icon: "📋" },
        { href: "/school", label: "School", icon: "🎓" },
        { href: "/sport", label: "Sport", icon: "🤽" },
      ];

  const more: NavItem[] = isParent
    ? [
        { href: "/policies", label: "House rules", icon: "⚖️" },
        { href: "/rewards", label: "Rewards", icon: "🎁" },
        { href: "/requests", label: "Requests", icon: "🙋" },
        { href: "/money", label: "Pocket money", icon: "💰" },
        { href: "/activity", label: "Activity", icon: "📜" },
        { href: "/family", label: "Family", icon: "👨‍👩‍👦" },
      ]
    : [
        { href: "/rewards", label: "Rewards", icon: "🎁" },
        { href: "/requests", label: "Ask", icon: "🙋" },
        { href: "/money", label: "My money", icon: "💰" },
        { href: "/policies", label: "House rules", icon: "⚖️" },
        { href: "/activity", label: "History", icon: "📜" },
      ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto w-full max-w-4xl px-4 pt-3">
          <div className="mb-2.5 flex items-center gap-3">
            <span className="truncate text-sm font-bold tracking-tight">{settings.familyName}</span>
            <div className="ml-auto flex items-center gap-2">
              <Avatar emoji={user.emoji} color={user.color} size="sm" />
              <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost btn-sm">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <NavBar items={items} more={more} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
