"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function chipClass(active: boolean): string {
  return `flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    active ? "bg-accent text-accent-ink" : "bg-surface text-ink-muted hover:text-ink"
  }`;
}

function Badge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`ml-0.5 rounded-full px-1.5 text-[0.7rem] font-bold ${
        active ? "bg-accent-ink/20" : "bg-bad text-white"
      }`}
    >
      {count}
    </span>
  );
}

export function NavBar({ items, more = [] }: { items: NavItem[]; more?: NavItem[] }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);

  // Close the overflow menu on navigation, on Escape, and on any click elsewhere.
  useEffect(() => {
    menuRef.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    const close = (event: Event) => {
      const menu = menuRef.current;
      if (!menu?.hasAttribute("open")) return;
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "pointerdown" && menu.contains(event.target as Node)) return;
      menu.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  const moreBadge = more.reduce((sum, item) => sum + (item.badge ?? 0), 0);
  const moreActive = more.some((item) => isActive(pathname, item.href));

  return (
    <nav aria-label="Main" className="flex items-start gap-1.5">
      <ul className="-mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 pb-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={chipClass(active)}>
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {item.badge ? <Badge count={item.badge} active={active} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {more.length > 0 && (
        <details ref={menuRef} className="disclosure relative shrink-0">
          <summary className={chipClass(moreActive)}>
            More
            <span aria-hidden className="text-[0.6rem]">
              ▾
            </span>
            {moreBadge > 0 ? <Badge count={moreBadge} active={moreActive} /> : null}
          </summary>
          <ul className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
            {more.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      active ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface-2"
                    }`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                    {item.badge ? <span className="ml-auto text-xs font-bold text-bad">{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </nav>
  );
}
