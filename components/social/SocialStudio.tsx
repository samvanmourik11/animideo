"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MAX_FOTOS, PLATFORMS, POST_CREDITS, platform } from "@/lib/social/types";

// De Social-studio: kanalen koppelen (via Zernio) en een contentkalender beginnen. De
// kalender zelf (ideeën keuren, posts volgen) staat op /studios/social/[id].

interface Account { id: string; platform: string; naam: string; actief: boolean }
interface KalenderRij { id: string; titel: string; status: string; start_datum: string; weken: number; per_week: number; modus: string; telling: Record<string, number> }

const KAL_STATUS: Record<string, string> = { ideeen_maken: "Ideeën worden bedacht…", ideeen: "Ideeën klaar om te keuren", actief: "Loopt", fout: "Mislukt", gestopt: "Gestopt" };

function morgen(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + 86400000));
}

export default function SocialStudio() {
  const router = useRouter();
  const zoek = useSearchParams();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [kalenders, setKalenders] = useState<KalenderRij[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [briefing, setBriefing] = useState("");
  const [gekozen, setGekozen] = useState<string[]>([]);
  const [start, setStart] = useState(morgen());
  const [weken, setWeken] = useState(4);
  const [perWeek, setPerWeek] = useState(3);
  const [modus, setModus] = useState<"controleren" | "plaatsen">("controleren");
  const [fotos, setFotos] = useState<{ id: string; url: string; naam: string }[]>([]);
  const [uploaden, setUploaden] = useState(0);
  const [eindkaart, setEindkaart] = useState("");

  // Eigen foto's gaan als gewone creatie de bibliotheek in (dezelfde upload als bij de Regisseur).
  async function voegFotosToe(lijst: FileList) {
    const bestanden = Array.from(lijst).filter((f) => f.type.startsWith("image/")).slice(0, MAX_FOTOS - fotos.length);
    setUploaden((n) => n + bestanden.length);
    await Promise.all(
      bestanden.map(async (f) => {
        try {
          const form = new FormData();
          form.append("bestand", f);
          const res = await fetch("/api/regisseur/bijlage", { method: "POST", body: form });
          const d = await res.json().catch(() => ({}));
          if (!res.ok || !d.bijlage?.id) throw new Error(d.error ?? "Uploaden mislukt.");
          setFotos((x) => [...x, { id: d.bijlage.id, url: d.bijlage.url, naam: f.name }]);
        } catch (e) {
          setFout(e instanceof Error ? e.message : String(e));
        } finally {
          setUploaden((n) => n - 1);
        }
      }),
    );
  }

  const laad = useCallback(async () => {
    const [a, k] = await Promise.all([
      fetch("/api/social/accounts", { cache: "no-store" }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })),
      fetch("/api/social/kalenders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (!a.ok) setFout(a.d.error ?? "Kanalen ophalen mislukt.");
    setAccounts(a.d.accounts ?? []);
    setKalenders(k.kalenders ?? []);
  }, []);
  useEffect(() => {
    laad();
  }, [laad]);
  // Na het koppelen: alle accounts meteen aanvinken voor een nieuwe kalender.
  useEffect(() => {
    if (accounts?.length && !gekozen.length) setGekozen(accounts.filter((a) => a.actief).map((a) => a.id));
  }, [accounts, gekozen.length]);

  async function koppel(p: string) {
    setBezig(p);
    setFout(null);
    const res = await fetch(`/api/social/accounts?koppel=${p}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) {
      setBezig(null);
      return setFout(d.error ?? "Koppelen lukte niet.");
    }
    window.location.href = d.url;
  }

  async function ontkoppel(a: Account) {
    setBezig(a.id);
    const res = await fetch(`/api/social/accounts?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    setBezig(null);
    if (!res.ok) setFout((await res.json().catch(() => ({}))).error ?? "Ontkoppelen lukte niet.");
    laad();
  }

  async function maak() {
    setBezig("nieuw");
    setFout(null);
    const res = await fetch("/api/social/kalenders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing, accounts: gekozen, start, weken, per_week: perWeek, modus, fotos: fotos.map((f) => f.id), eindkaart }),
    });
    const d = await res.json().catch(() => ({}));
    setBezig(null);
    if (!res.ok) return setFout(d.error ?? "Dat lukte niet.");
    router.push(`/studios/social/${d.id}`);
  }

  const totaal = weken * perWeek;
  const gekozenPlatforms = new Set((accounts ?? []).filter((a) => gekozen.includes(a.id)).map((a) => a.platform));
  const allesVideo = [...gekozenPlatforms].some((p) => platform(p)?.video);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-tekst">📣 Social</h1>
        <p className="text-sm text-tekst-2 mt-1">
          Koppel je kanalen, laat de Regisseur een contentkalender bedenken en Animideo maakt en plaatst je posts. Jij kiest: eerst zelf keuren, of gewoon plaatsen.
        </p>
      </div>
      {zoek.get("gekoppeld") && <p className="text-sm text-green-700 dark:text-green-300">✓ {platform(zoek.get("gekoppeld") ?? "")?.naam ?? "Account"} gekoppeld.</p>}
      {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold text-tekst">1. Je kanalen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PLATFORMS.map((p) => {
            const van = (accounts ?? []).filter((a) => a.platform === p.id);
            return (
              <div key={p.id} className="n-kaart !p-3 space-y-2">
                <div className="font-semibold text-tekst text-sm">{p.icoon} {p.naam}</div>
                {van.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-1 text-xs">
                    <span className={`truncate ${a.actief ? "text-tekst-2" : "text-red-600 dark:text-red-300"}`} title={a.actief ? "" : "Verbinding verlopen: koppel opnieuw"}>
                      {a.actief ? "✓" : "⚠"} {a.naam}
                    </span>
                    <button onClick={() => ontkoppel(a)} disabled={bezig === a.id} className="text-tekst-3 hover:text-red-500" aria-label={`${a.naam} ontkoppelen`} title="Ontkoppelen">✕</button>
                  </div>
                ))}
                <button onClick={() => koppel(p.id)} disabled={!!bezig || accounts === null} className="n-knop2 w-full text-xs">
                  {bezig === p.id ? "Even…" : van.length ? "＋ Nog een" : "Koppelen"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-tekst-3">Instagram werkt met een zakelijk of creator-account. TikTok en YouTube krijgen alleen video&apos;s.</p>
      </section>

      <section className="n-kaart space-y-4">
        <h2 className="font-semibold text-tekst">2. Nieuwe contentkalender</h2>
        <label className="block space-y-1">
          <span className="text-sm text-tekst-2">Waar gaan je posts over?</span>
          <textarea
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            rows={4}
            placeholder="Bijv.: Bakkerij De Zoete Zwaan in Utrecht. Laat elke week onze producten zien, tips voor bij de koffie, en in november onze sinterklaasactie (gevulde speculaas, 10% korting)."
            className="w-full rounded-xl border border-rand bg-paneel px-3 py-2 text-sm text-tekst"
          />
        </label>
        <div className="space-y-1">
          <span className="text-sm text-tekst-2">Plaatsen op</span>
          {accounts?.length ? (
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => (
                <label key={a.id} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm cursor-pointer ${gekozen.includes(a.id) ? "border-blue-500 bg-blue-500/10 text-tekst" : "border-rand text-tekst-2"}`}>
                  <input type="checkbox" className="hidden" checked={gekozen.includes(a.id)} onChange={() => setGekozen((g) => (g.includes(a.id) ? g.filter((x) => x !== a.id) : [...g, a.id]))} />
                  {platform(a.platform)?.icoon} {a.naam}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tekst-3">{accounts === null ? "Laden…" : "Koppel eerst een kanaal hierboven."}</p>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-sm text-tekst-2">Eigen foto&apos;s <span className="text-tekst-3">(optioneel: je product, logo of winkel; die komen dan echt in beeld)</span></span>
          <div className="flex flex-wrap gap-2">
            {fotos.map((f) => (
              <div key={f.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.naam} className="h-16 w-16 rounded-xl object-cover border border-rand" />
                <button onClick={() => setFotos((x) => x.filter((y) => y.id !== f.id))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 text-white text-[11px]" aria-label="Foto weghalen">✕</button>
              </div>
            ))}
            {uploaden > 0 && (
              <div className="h-16 w-16 rounded-xl border border-dashed border-rand flex items-center justify-center">
                <span className="w-4 h-4 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
              </div>
            )}
            {fotos.length + uploaden < MAX_FOTOS && (
              <label className="h-16 w-16 rounded-xl border border-dashed border-rand flex items-center justify-center text-2xl text-tekst-3 cursor-pointer hover:text-tekst" title="Foto toevoegen">
                ＋
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) voegFotosToe(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-tekst-2">Op het eind van je video&apos;s <span className="text-tekst-3">(bv. je website; leeg = dat bedenkt de Regisseur)</span></span>
          <input value={eindkaart} onChange={(e) => setEindkaart(e.target.value)} maxLength={40} placeholder="jouwbedrijf.nl" className="w-full sm:w-80 rounded-xl border border-rand bg-paneel px-3 py-1.5 text-sm text-tekst" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 text-sm text-tekst-2">
            <span className="block">Vanaf</span>
            <input type="date" value={start} min={morgen()} onChange={(e) => setStart(e.target.value)} className="w-full rounded-xl border border-rand bg-paneel px-3 py-1.5 text-tekst" />
          </label>
          <label className="space-y-1 text-sm text-tekst-2">
            <span className="block">Hoe lang</span>
            <select value={weken} onChange={(e) => setWeken(+e.target.value)} className="w-full rounded-xl border border-rand bg-paneel px-3 py-1.5 text-tekst">
              {[1, 2, 3, 4, 5, 6].map((w) => <option key={w} value={w}>{w} {w === 1 ? "week" : "weken"}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-tekst-2">
            <span className="block">Posts per week</span>
            <select value={perWeek} onChange={(e) => setPerWeek(+e.target.value)} className="w-full rounded-xl border border-rand bg-paneel px-3 py-1.5 text-tekst">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="space-y-1">
          <span className="text-sm text-tekst-2">Als een post af is</span>
          <div className="flex flex-col sm:flex-row gap-2">
            {([
              ["controleren", "👀 Eerst zelf keuren", "Je krijgt hem eerst te zien; pas na jouw ✓ gaat hij online."],
              ["plaatsen", "🚀 Gewoon plaatsen", "Hij wordt meteen ingepland op het geplande moment."],
            ] as const).map(([w, kop, uitleg]) => (
              <label key={w} className={`flex-1 rounded-xl border p-3 cursor-pointer ${modus === w ? "border-blue-500 bg-blue-500/10" : "border-rand"}`}>
                <input type="radio" className="hidden" checked={modus === w} onChange={() => setModus(w)} />
                <div className="text-sm font-semibold text-tekst">{kop}</div>
                <div className="text-xs text-tekst-3">{uitleg}</div>
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-tekst-3">
            {totaal} posts. De ideeën bedenken is gratis; daarna kost een beeldpost {POST_CREDITS.beeld} credit en een videopost (met voice-over en muziek) {POST_CREDITS.video} credits
            {allesVideo ? " (TikTok en YouTube zijn altijd video)" : ""}. Ze worden per week vooruit gemaakt.
          </p>
          <button onClick={maak} disabled={bezig === "nieuw" || uploaden > 0 || briefing.trim().length < 10 || !gekozen.length} className="btn-primary">
            {bezig === "nieuw" ? "Even…" : "✨ Bedenk de ideeën"}
          </button>
        </div>
      </section>

      {kalenders.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-tekst">Je kalenders</h2>
          {kalenders.map((k) => (
            <Link key={k.id} href={`/studios/social/${k.id}`} className="n-kaart !p-3 flex items-center justify-between gap-3 hover:border-blue-500">
              <div className="min-w-0">
                <div className="font-medium text-tekst truncate">{k.titel}</div>
                <div className="text-xs text-tekst-3">
                  vanaf {new Date(`${k.start_datum}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })} · {k.weken} wk × {k.per_week} · {k.modus === "plaatsen" ? "gewoon plaatsen" : "eerst keuren"}
                  {k.telling.geplaatst ? ` · ${k.telling.geplaatst} geplaatst` : ""}
                  {k.telling.te_keuren ? ` · ${k.telling.te_keuren} te keuren` : ""}
                </div>
              </div>
              <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 ${k.telling.te_keuren ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-paneel-2 text-tekst-2"}`}>
                {k.telling.te_keuren ? "Keur jij?" : KAL_STATUS[k.status] ?? k.status}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
