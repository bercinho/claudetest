"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function NavBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 pb-1">
      <ul className="flex w-max gap-1.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {item.badge ? (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 text-[0.7rem] font-bold ${
                      active ? "bg-accent-ink/20" : "bg-bad text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
