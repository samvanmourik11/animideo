"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { zetThema, type Thema } from "./thema";

// Het menu van de nieuwe app. Niet langer "start een project" bovenin, maar links een
// vaste rij met wat je kunt maken — zoals Higgsfield — met je eigen werk eronder.
// Wat nog niet gebouwd is, staat er wél al in (grijs, "binnenkort"): zo ziet de klant
// waar de app naartoe gaat, en hoeven we het menu niet steeds om te gooien.

interface Item {
  href: string;
  label: string;
  icoon: string;
  binnenkort?: boolean;
  /** Ook actief op deze paden (bv. de oude tools onder Studio's). */
  ook?: string[];
}

const MAKEN: Item[] = [
  { href: "/ontdek", label: "Ontdek", icoon: "🏠" },
  { href: "/maak/beeld", label: "Beeld", icoon: "🖼️" },
  { href: "/maak/video", label: "Video", icoon: "🎬" },
  { href: "/effecten", label: "Effecten", icoon: "⚡" },
  { href: "/apps", label: "Apps", icoon: "🧩" },
  { href: "/stem", label: "Stem & Lipsync", icoon: "🗣️", binnenkort: true },
  {
    href: "/dashboard",
    label: "Studio's",
    icoon: "🏗️",
    ook: ["/studio", "/infographics", "/explainer", "/playground", "/project"],
  },
];

const MIJN: Item[] = [
  { href: "/mijn-werk", label: "Mijn bibliotheek", icoon: "📚" },
  { href: "/bibliotheek", label: "Personages & decors", icoon: "👤", ook: ["/characters", "/voorwerpen", "/omgevingen"] },
  { href: "/brand", label: "Huisstijlen", icoon: "🎨" },
];

interface ZijbalkProps {
  email: string;
  credits: number;
  plan: string;
  creditsResetDate: string | null;
  hideLeren: boolean;
  thema: Thema;
}

const PLAN_LABELS: Record<string, string> = { free: "Gratis", starter: "Starter", pro: "Pro", agency: "Agency" };

/** Seintje van de maakschermen: er is iets gestart, ververs de wachtrij-teller nu. */
export const CREATIES_GEWIJZIGD = "creaties:gewijzigd";

export default function Zijbalk({ email, credits, plan, creditsResetDate, hideLeren, thema: beginThema }: ZijbalkProps) {
  const pad = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [thema, setThema] = useState<Thema>(beginThema);

  function wisselThema() {
    const nieuw: Thema = thema === "licht" ? "donker" : "licht";
    setThema(nieuw);
    zetThema(nieuw);
  }

  // Zelfde reden als in de oude NavBar: credit-verbruik gebeurt in losse client-acties
  // die de layout niet herrenderen, dus het saldo houden we hier zelf bij.
  const [liveCredits, setLiveCredits] = useState(credits);
  useEffect(() => setLiveCredits(credits), [credits]);
  useEffect(() => {
    let actief = true;
    async function haal() {
      try {
        const res = await fetch("/api/account/credits", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (actief && typeof data.credits === "number") setLiveCredits(data.credits);
      } catch {}
    }
    haal();
    const t = setInterval(haal, 8000);
    window.addEventListener("focus", haal);
    window.addEventListener(CREATIES_GEWIJZIGD, haal);
    return () => {
      actief = false;
      clearInterval(t);
      window.removeEventListener("focus", haal);
      window.removeEventListener(CREATIES_GEWIJZIGD, haal);
    };
  }, []);

  // De wachtrij-teller. Snel verversen zolang er iets loopt, anders rustig: elke beurt
  // laat de server ook de wachtrij doorlopen, dus helemaal stoppen kan niet.
  const [bezig, setBezig] = useState(0);
  useEffect(() => {
    let actief = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    async function haal() {
      clearTimeout(t);
      let n = 0;
      try {
        const res = await fetch("/api/creaties/lopend", { cache: "no-store" });
        if (res.ok) n = (await res.json()).bezig ?? 0;
      } catch {}
      if (!actief) return;
      setBezig((vorig) => {
        // Er is net iets klaargekomen: de schermen mogen hun lijst verversen.
        if (n < vorig) window.dispatchEvent(new Event("creaties:klaar"));
        return n;
      });
      t = setTimeout(haal, n > 0 ? 5000 : 30000);
    }
    haal();
    window.addEventListener(CREATIES_GEWIJZIGD, haal);
    return () => {
      actief = false;
      clearTimeout(t);
      window.removeEventListener(CREATIES_GEWIJZIGD, haal);
    };
  }, []);

  useEffect(() => setOpen(false), [pad]);

  async function uitloggen() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const laag = liveCredits < 20;
  const resetDatum = creditsResetDate
    ? new Date(creditsResetDate).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })
    : null;

  function isActief(item: Item) {
    return [item.href, ...(item.ook ?? [])].some((p) => pad === p || pad.startsWith(p + "/"));
  }

  function Regel({ item }: { item: Item }) {
    if (item.binnenkort) {
      return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-tekst-3/70 cursor-default">
          <span className="w-5 text-center opacity-60">{item.icoon}</span>
          <span className="flex-1">{item.label}</span>
          <span className="text-[10px] uppercase tracking-wide bg-paneel-2 text-tekst-3 px-1.5 py-0.5 rounded">
            binnenkort
          </span>
        </div>
      );
    }
    const actief = isActief(item);
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
          actief ? "bg-blue-600 text-white font-semibold" : "text-tekst-2 hover:bg-paneel-2 hover:text-tekst"
        }`}
      >
        <span className="w-5 text-center">{item.icoon}</span>
        <span className="flex-1">{item.label}</span>
        {item.href === "/mijn-werk" && bezig > 0 && (
          <span className="flex items-center gap-1 text-[11px] bg-amber-400/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {bezig}
          </span>
        )}
      </Link>
    );
  }

  const inhoud = (
    <div className="flex flex-col h-full">
      <Link href="/ontdek" className="block px-3 pt-5 pb-6 font-extrabold text-lg text-tekst tracking-tight">
        Animideo<span className="text-blue-500">.</span>
      </Link>

      <nav className="space-y-0.5 px-2">
        {MAKEN.map((i) => <Regel key={i.href} item={i} />)}
      </nav>

      <div className="mt-6 px-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-tekst-3">Van jou</div>
      <nav className="space-y-0.5 px-2">
        {MIJN.map((i) => <Regel key={i.href} item={i} />)}
      </nav>

      <div className="mt-auto px-3 pb-4 pt-6 space-y-3">
        <button
          onClick={wisselThema}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-rand text-sm text-tekst-2 hover:bg-paneel-2"
        >
          <span>{thema === "licht" ? "☀️ Licht" : "🌙 Donker"}</span>
          <span className="text-xs text-tekst-3">wissel</span>
        </button>
        <Link
          href="/pricing"
          className={`block rounded-2xl border p-3 transition-colors ${
            laag ? "border-red-500/30 bg-red-500/10 hover:bg-red-500/15" : "border-rand bg-paneel-2/60 hover:bg-paneel-2"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-tekst-3">
            <span>{PLAN_LABELS[plan] ?? plan}</span>
            {resetDatum && <span>reset {resetDatum}</span>}
          </div>
          <div className={`mt-1 text-lg font-bold ${laag ? "text-red-500" : "text-tekst"}`}>
            ⚡ {liveCredits} <span className="text-sm font-medium text-tekst-3">credits</span>
          </div>
          <div className="mt-2 text-center text-xs font-semibold text-blue-500">Upgraden →</div>
        </Link>
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-tekst-3">
          {!hideLeren && <Link href="/leren" className="hover:text-tekst">Leren</Link>}
          <Link href="/account" className="hover:text-tekst">Account</Link>
          <Link href="/support" className="hover:text-tekst">Hulp</Link>
          <button onClick={uitloggen} className="hover:text-tekst">Uitloggen</button>
        </div>
        <div className="px-1 text-[11px] text-tekst-3/70 truncate">{email}</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Telefoon: balk bovenin met een menuknop */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-rand bg-vlak/95 backdrop-blur">
        <button onClick={() => setOpen(true)} className="text-tekst text-xl" aria-label="Menu openen">☰</button>
        <span className="font-extrabold text-tekst">Animideo<span className="text-blue-500">.</span></span>
        <span className={`text-xs font-semibold ${laag ? "text-red-500" : "text-blue-500"}`}>⚡ {liveCredits}</span>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-zijbalk border-r border-rand overflow-y-auto">
            {inhoud}
          </aside>
        </div>
      )}

      {/* Computer: vaste balk links */}
      <aside className="hidden md:block fixed left-0 top-0 bottom-0 w-60 bg-zijbalk border-r border-rand overflow-y-auto z-30">
        {inhoud}
      </aside>
    </>
  );
}
