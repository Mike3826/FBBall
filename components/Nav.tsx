"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "@/lib/nav";

export default function Nav({ leagueName }: { leagueName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const linkClass = (href: string) => {
    const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    return [
      "rounded-md border-2 px-3 py-1.5 text-sm font-semibold transition-colors",
      active
        ? "border-raptor bg-raptor text-white"
        : "border-transparent text-slate-300 hover:border-white/20 hover:text-white",
    ].join(" ");
  };

  return (
    <header className="sticky top-0 z-40 border-b-2 border-raptor bg-court">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" prefetch={false} className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gold bg-raptor text-base font-black text-white">
            II
          </span>
          <span className="text-base font-bold tracking-tight text-white">{leagueName}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} prefetch={false} className={linkClass(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-md p-2 text-slate-300 hover:bg-white/5 md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="border-t-2 border-white/15 px-4 pb-3 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={linkClass(item.href)}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
