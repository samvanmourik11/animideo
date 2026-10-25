"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/account",          label: "Overzicht",        icon: "▤" },
  { href: "/account/credits",  label: "Credits & Gebruik", icon: "◆" },
  { href: "/account/billing",  label: "Abonnement",        icon: "◇" },
  { href: "/account/settings", label: "Instellingen",      icon: "⚙" },
];

export default function AccountSideNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:block space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  : "text-tekst-3 hover:text-tekst hover:bg-paneel-2/60 border border-transparent"
              }`}
            >
              <span className="text-xs opacity-60">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile horizontal tabs */}
      <nav className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-6">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  : "text-tekst-3 border border-rand hover:text-tekst"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
