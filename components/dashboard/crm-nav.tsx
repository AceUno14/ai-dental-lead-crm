"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOutAction } from "@/app/(crm)/actions";
import { buttonClasses } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
];

export function CrmNav({
  clinicName,
  userName,
  role,
}: {
  clinicName: string;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/dashboard" className="truncate text-sm font-semibold text-slate-900">
            {clinicName}
          </Link>
          <nav aria-label="CRM" className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={buttonClasses(active ? "secondary" : "ghost", "sm")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-right text-xs leading-tight text-slate-500">
            <span className="block font-medium text-slate-700">{userName}</span>
            <span className="block uppercase tracking-wide">{role}</span>
          </span>
          <form action={signOutAction}>
            <button type="submit" className={buttonClasses("secondary", "sm")}>
              Sign out
            </button>
          </form>
        </div>

        <button
          type="button"
          className={buttonClasses("secondary", "sm", "sm:hidden")}
          aria-expanded={menuOpen}
          aria-controls="crm-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <div id="crm-mobile-menu" className="border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
          <nav aria-label="CRM mobile" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={buttonClasses(active ? "secondary" : "ghost", "sm", "justify-start")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <span className="text-xs text-slate-500">
              {userName} · {role}
            </span>
            <form action={signOutAction}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
