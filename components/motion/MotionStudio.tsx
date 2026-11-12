"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import type { BrandKit } from "@/lib/types";
import {
  MAX_BEELDEN,
  MOTION_DOELEN,
  MOTION_FONTS,
  MOTION_FORMATEN,
  MOTION_LENGTES,
  MOTION_MUZIEK,
  STANDAARD_FONT,
  isMotionDoel,
  maxWoorden,
  duurTekst,
  motionCredits,
  motionFont,
  type MotionBeeld,
  type MotionDoel,
  type MotionFormaat,
  type MotionLengte,
  type MotionPlan,
} from "@/lib/motion/types";
import { MOTION_STIJLEN } from "@/lib/motion/stijlen";

// Motion graphics-studio. Bovenaan de huisstijl (logo, kleuren, lettertype): één keer
// instellen, daarna ziet elke video er hetzelfde uit. Dan twee stappen op één scherm: vertellen waar de video over gaat,
// en het script nalopen. Pas de laatste knop kost credits; het script schrijven is gratis,
// zodat de klant het rustig kan bijsturen. Het script is hier het controlemoment: wat er
// staat, wordt gemaakt.

async function post<T>(pad: string, body: unknown): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

async function postBestand<T>(pad: string, bestand: File, extra: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.append("bestand", bestand);
  for (const k in extra) form.append(k, extra[k]);
  const res = await fetch(pad, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Uploaden mislukt. Probeer het opnieuw.");
  return data as T;
}

type Beeld = Omit<MotionBeeld, "id">;
type Bezig = null | "script" | "maken" | "logo" | "beeld" | "bestand" | "huisstijl" | "website";

/** De beelden die bij een huisstijl horen en bij elke video vanzelf meegaan. */
function vasteBeelden(kit: BrandKit): Beeld[] {
  return (kit.reference_images ?? [])
    .filter((r) => r.url && isMotionDoel(r.doel))
    .slice(0, MAX_BEELDEN)
    .map((r) => ({ url: r.url, doel: r.doel as MotionDoel, uitleg: r.description ?? "", vast: true }));
}

const ONTHOUD = "motion-huisstijl";

export default function MotionStudio() {
  const [onderwerp, setOnderwerp] = useState("");
  const [eigenScript, setEigenScript] = useState(false);
  const [letterlijk, setLetterlijk] = useState(true);
  const [bedrijf, setBedrijf] = useState("");
  const [website, setWebsite] = useState("");
  const [kleur, setKleur] = useState("#1c72ed");
  const [kleur2, setKleur2] = useState("#ffc21a");
  const [logo, setLogo] = useState("");
  const [font, setFont] = useState<string>(STANDAARD_FONT);
  const [beelden, setBeelden] = useState<Beeld[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [kitId, setKitId] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [bewaard, setBewaard] = useState(false);
  const [formaat, setFormaat] = useState<MotionFormaat>("16:9");
  const [lengte, setLengte] = useState<MotionLengte>(30);
  const [muziek, setMuziek] = useState<string>(MOTION_MUZIEK[0].slug);
  const [stijl, setStijl] = useState<string>("");
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [afwijkend, setAfwijkend] = useState<number[]>([]);
  const [bezig, setBezig] = useState<Bezig>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const logoKies = useRef<HTMLInputElement>(null);
  const beeldKies = useRef<HTMLInputElement>(null);
  const scriptKies = useRef<HTMLInputElement>(null);

  const lijst = useCreaties({ maker: "motion" });
  const kit = kits.find((k) => k.id === kitId) ?? null;

  /** Zet de velden naar een huisstijl. Wat de klant voor déze video al aan beelden toevoegde, blijft staan. */
  function kies(k: BrandKit | null) {
    setKitId(k?.id ?? "");
    setBewaard(false);
    try {
      if (k) localStorage.setItem(ONTHOUD, k.id);
      else localStorage.removeItem(ONTHOUD);
    } catch {}
    if (!k) return;
    setBedrijf(k.name ?? "");
    setWebsite(k.fonts?.website ?? "");
    if (/^#[0-9a-f]{6}$/i.test(k.colors?.primary ?? "")) setKleur(k.colors.primary!);
    const tweede = k.colors?.accent ?? k.colors?.secondary ?? "";
    if (/^#[0-9a-f]{6}$/i.test(tweede)) setKleur2(tweede);
    setLogo(k.logo_url ?? "");
    setFont(motionFont(k.fonts?.video ?? k.fonts?.primary));
    setBeelden((nu) => [...vasteBeelden(k), ...nu.filter((b) => !b.vast)].slice(0, MAX_BEELDEN));
  }

  // De huisstijlen van de klant; de laatst gebruikte staat meteen klaar, zodat een
  // volgende video vanzelf dezelfde huisstijl krijgt.
  useEffect(() => {
    let weg = false;
    fetch("/api/brand-kits")
      .then((r) => (r.ok ? r.json() : { brandKits: [] }))
      .then((d: { brandKits?: BrandKit[] }) => {
        if (weg) return;
        const alle = d.brandKits ?? [];
        setKits(alle);
        let vorige = "";
        try { vorige = localStorage.getItem(ONTHOUD) ?? ""; } catch {}
        const k = alle.find((x) => x.id === vorige) ?? (alle.length === 1 ? alle[0] : null);
        if (k) kies(k);
      })
      .catch(() => {});
    return () => { weg = true; };
    // Alleen bij het openen van het scherm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doe(wat: Exclude<Bezig, null>, actie: () => Promise<void>) {
    setBezig(wat);
    setFout(null);
    try {
      await actie();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(null);
    }
  }

  const letterlijkScript = eigenScript && letterlijk;
  const toon = kit?.tone_of_voice ?? "";
  const nietDoen = kit?.do_nots ?? "";

  function schrijf() {
    return doe("script", async () => {
      const r = await post<{ plan: MotionPlan; afwijkend: number[]; lengte: MotionLengte }>("/api/motion/plan", {
        onderwerp, bedrijf, lengte, formaat, eigenScript: letterlijkScript, toon, nietDoen, beelden,
      });
      setPlan(r.plan);
      setAfwijkend(r.afwijkend ?? []);
      if (letterlijkScript && r.lengte) setLengte(r.lengte);
    });
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker("motion", { onderwerp, bedrijf, website, kleur, kleur2, formaat, lengte, muziek, stijl, plan, huisstijlId: kitId, logo, font, toon, nietDoen, beelden });
      lijst.zetVoor(c);
    });
  }

  function uploadLogo(bestand: File) {
    return doe("logo", async () => {
      const { url } = await postBestand<{ url: string }>("/api/motion/upload", bestand, { soort: "logo" });
      setLogo(url);
      setBewaard(false);
    });
  }

  function uploadBeelden(bestanden: File[]) {
    return doe("beeld", async () => {
      for (const bestand of bestanden.slice(0, MAX_BEELDEN - beelden.length)) {
        const { url } = await postBestand<{ url: string }>("/api/motion/upload", bestand);
        setBeelden((nu) => [...nu, { url, doel: "natekenen" as MotionDoel, uitleg: "" }].slice(0, MAX_BEELDEN));
      }
    });
  }

  function uploadScript(bestand: File) {
    return doe("bestand", async () => {
      const { tekst, ingekort } = await postBestand<{ tekst: string; ingekort: boolean }>("/api/motion/lees-script", bestand);
      setOnderwerp(tekst);
      setEigenScript(true);
      if (ingekort) setFout("Je bestand is lang; we hebben alleen het eerste deel ingelezen. Een video is hooguit ±10 minuten.");
    });
  }

  /** De huisstijl opslaan of bijwerken, zodat een volgende video er net zo uitziet. */
  function bewaarHuisstijl() {
    return doe("huisstijl", async () => {
      if (!bedrijf.trim()) throw new Error("Vul eerst de naam van je bedrijf in.");
      const vast = beelden.filter((b) => b.vast).map((b, i) => ({ url: b.url, description: b.uitleg, doel: b.doel, id: `motion-${i + 1}`, role: "other", element: b.uitleg }));
      const velden = {
        name: bedrijf.trim(),
        colors: { ...(kit?.colors ?? {}), primary: kleur, accent: kleur2 },
        fonts: { ...(kit?.fonts ?? {}), video: font, website: website.trim() },
        logo_url: logo || null,
        // Beelden die de klant voor andere studio's bewaarde (zonder doel) blijven staan.
        reference_images: [...(kit?.reference_images ?? []).filter((r) => !isMotionDoel(r.doel)), ...vast],
      };
      const res = await fetch(kit ? `/api/brand-kits/${kit.id}` : "/api/brand-kits", {
        method: kit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(velden),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.brandKit) throw new Error(data.error ?? "Huisstijl bewaren mislukt.");
      const nieuw = data.brandKit as BrandKit;
      setKits((nu) => (nu.some((k) => k.id === nieuw.id) ? nu.map((k) => (k.id === nieuw.id ? nieuw : k)) : [nieuw, ...nu]));
      setKitId(nieuw.id);
      try { localStorage.setItem(ONTHOUD, nieuw.id); } catch {}
      setBewaard(true);
    });
  }

  /** Kleuren, lettertype en schrijfstijl van de website van de klant halen en als huisstijl bewaren. */
  function vanWebsite() {
    return doe("website", async () => {
      const { brandKit } = await post<{ brandKit: BrandKit }>("/api/brand-kits/from-website", { url: siteUrl });
      setKits((nu) => [brandKit, ...nu]);
      kies(brandKit);
      setWebsite(siteUrl.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""));
      setSiteUrl("");
    });
  }

  function wijzigBeeld(i: number, veld: Partial<Beeld>) {
    setBeelden((nu) => nu.map((b, j) => (j === i ? { ...b, ...veld } : b)));
    if ("vast" in veld) setBewaard(false);
  }

  function wijzigScene(i: number, veld: Partial<MotionPlan["scenes"][number]>) {
    setPlan((p) => (p ? { ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...veld } : s)) } : p));
  }
  function wijzigEind(veld: Partial<MotionPlan["eind"]>) {
    setPlan((p) => (p ? { ...p, eind: { ...p.eind, ...veld } } : p));
  }

  const woorden = plan ? [...plan.scenes.map((s) => s.tekst), plan.eind.tekst].join(" ").split(/\s+/).filter(Boolean).length : 0;
  const max = Math.round(maxWoorden(lengte) * 1.25);
  const teLang = woorden > max;
  const credits = motionCredits(lengte);
  const kanSchrijven = onderwerp.trim().length >= 10 && bedrijf.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">✨ Motion graphics</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een strakke uitlegvideo met bewegende vormen, cijfers en tekst, precies op de stem. Vertel waar het over gaat; wij schrijven het script,
          Hugo spreekt het in en de animatie wordt voor jouw verhaal getekend, in je eigen kleuren.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          {/* Huisstijl — één keer instellen, daarna is elke video hetzelfde */}
          <div className="n-kaart space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-tekst">Je huisstijl</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Stel hem één keer in. Elke volgende video krijgt vanzelf hetzelfde logo, dezelfde kleuren en hetzelfde lettertype.</p>
              </div>
              {kit && <Link href={`/brand/${kit.id}`} className="text-xs text-blue-500 hover:underline whitespace-nowrap">Alles bewerken</Link>}
            </div>

            {kits.length > 0 && (
              <select value={kitId} onChange={(e) => kies(kits.find((k) => k.id === e.target.value) ?? null)} className="n-invoer">
                <option value="">Geen bewaarde huisstijl</option>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            )}

            {!kit && (
              <div className="rounded-2xl border border-dashed border-rand p-3">
                <label className="n-label">Snel beginnen: haal je huisstijl van je website</label>
                <div className="mt-1.5 flex gap-2">
                  <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="jouwbedrijf.nl" className="n-invoer" />
                  <button onClick={vanWebsite} disabled={siteUrl.trim().length < 4 || !!bezig} className="n-knop2 whitespace-nowrap disabled:opacity-50">
                    {bezig === "website" ? "Ophalen…" : "Ophalen"}
                  </button>
                </div>
                <p className="text-[11px] text-tekst-3 mt-1">We lezen je kleuren, lettertype en schrijfstijl uit. Je logo upload je hieronder zelf, zodat het altijd het juiste is.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Bedrijfsnaam</label>
                <input value={bedrijf} onChange={(e) => { setBedrijf(e.target.value); setBewaard(false); }} maxLength={40} className="n-invoer mt-1.5" />
              </div>
              <div>
                <label className="n-label">Website (op de eindkaart)</label>
                <input value={website} onChange={(e) => { setWebsite(e.target.value); setBewaard(false); }} placeholder="jouwbedrijf.nl" className="n-invoer mt-1.5" />
              </div>
            </div>

            <div>
              <label className="n-label">Logo</label>
              <div className="mt-1.5 flex items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="Logo" className="h-12 max-w-[160px] rounded-lg object-contain bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:14px_14px] p-1" />
                ) : (
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-extrabold text-xl" style={{ background: kleur }}>
                    {(bedrijf.trim().charAt(0) || "A").toUpperCase()}
                  </div>
                )}
                <button onClick={() => logoKies.current?.click()} disabled={!!bezig} className="n-knop2 disabled:opacity-50">
                  {bezig === "logo" ? "Uploaden…" : logo ? "Ander logo" : "Logo uploaden"}
                </button>
                {logo && <button onClick={() => { setLogo(""); setBewaard(false); }} className="text-xs text-tekst-3 hover:text-red-500">Weghalen</button>}
                <input ref={logoKies} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} />
              </div>
              <p className="text-[11px] text-tekst-3 mt-1">
                {logo ? "Je logo staat linksboven in beeld en groot op de eindkaart." : "Zonder logo gebruiken we de eerste letter van je bedrijfsnaam als merkteken. Het mooist is een PNG of SVG met doorzichtige achtergrond."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="n-label">Merkkleur</label>
                <input type="color" value={kleur} onChange={(e) => { setKleur(e.target.value); setBewaard(false); }} className="mt-1.5 h-10 w-full rounded-lg border border-rand bg-transparent cursor-pointer" />
              </div>
              <div>
                <label className="n-label">Tweede kleur</label>
                <input type="color" value={kleur2} onChange={(e) => { setKleur2(e.target.value); setBewaard(false); }} className="mt-1.5 h-10 w-full rounded-lg border border-rand bg-transparent cursor-pointer" />
              </div>
              <div>
                <label className="n-label">Lettertype</label>
                <select value={font} onChange={(e) => { setFont(e.target.value); setBewaard(false); }} className="n-invoer mt-1.5">
                  {MOTION_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>

            {(toon || nietDoen) && (
              <div className="rounded-xl bg-paneel-2/60 px-3 py-2 text-[11px] text-tekst-3 space-y-0.5">
                {toon && <p><span className="font-semibold text-tekst-2">Schrijfstijl:</span> {toon.length > 140 ? `${toon.slice(0, 140)}…` : toon}</p>}
                {nietDoen && <p><span className="font-semibold text-tekst-2">Niet doen:</span> {nietDoen.length > 140 ? `${nietDoen.slice(0, 140)}…` : nietDoen}</p>}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={bewaarHuisstijl} disabled={!!bezig || !bedrijf.trim()} className="n-knop2 whitespace-nowrap disabled:opacity-50">
                {bezig === "huisstijl" ? "Bewaren…" : kit ? "💾 Huisstijl bijwerken" : "💾 Bewaar als huisstijl"}
              </button>
              {bewaard && <span className="text-xs text-green-600">Bewaard. Je volgende video gebruikt deze huisstijl vanzelf.</span>}
            </div>
          </div>

          {/* Stap 1 — waar gaat het over */}
          <div className="n-kaart space-y-4">
            <h2 className="font-bold text-tekst">1. Waar gaat de video over?</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { eigen: false, naam: "Wij schrijven het script", uitleg: "Jij vertelt het onderwerp" },
                { eigen: true, naam: "Ik heb al een script", uitleg: "Plak of upload je tekst" },
              ].map((k) => (
                <button
                  key={k.naam}
                  onClick={() => setEigenScript(k.eigen)}
                  className={`rounded-xl border px-3 py-2 text-left ${eigenScript === k.eigen ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                >
                  <div className="text-sm font-semibold text-tekst">{k.naam}</div>
                  <div className="text-[11px] text-tekst-3">{k.uitleg}</div>
                </button>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="n-label">{eigenScript ? "Je script" : "Onderwerp"}</label>
                {eigenScript && (
                  <button onClick={() => scriptKies.current?.click()} disabled={!!bezig} className="text-xs text-blue-500 hover:underline disabled:opacity-50">
                    {bezig === "bestand" ? "Inlezen…" : "📄 Upload Word, PDF of tekst"}
                  </button>
                )}
                <input ref={scriptKies} type="file" accept=".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadScript(f); }} />
              </div>
              <textarea
                value={onderwerp}
                onChange={(e) => setOnderwerp(e.target.value)}
                rows={eigenScript ? 9 : 5}
                placeholder={
                  eigenScript
                    ? "Plak hier je script. Aanwijzingen voor het beeld mogen erbij staan; die gebruiken we voor de animatie en worden niet uitgesproken."
                    : "Bijvoorbeeld: leg uit hoe ons onderhoudsabonnement voor cv-ketels werkt. Voor € 9,95 per maand komen we elk jaar langs en ben je verzekerd van hulp binnen 24 uur bij storing."
                }
                className="n-invoer mt-1.5 resize-none"
              />
              {eigenScript ? (
                <label className="mt-1.5 flex items-start gap-2 text-xs text-tekst-2 cursor-pointer">
                  <input type="checkbox" checked={letterlijk} onChange={(e) => setLetterlijk(e.target.checked)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold">Gebruik mijn tekst letterlijk.</span>{" "}
                    <span className="text-tekst-3">
                      {letterlijk
                        ? `Wij verdelen je script in scenes en bedenken het beeld; aan de woorden veranderen we niets. De lengte volgt uit je tekst (hooguit ${MOTION_LENGTES[MOTION_LENGTES.length - 1].naam}, ongeveer ${maxWoorden(MOTION_LENGTES[MOTION_LENGTES.length - 1].sec)} woorden).`
                        : "Uit: wij herschrijven en korten je script in tot de lengte die je hieronder kiest. Cijfers en claims blijven letterlijk staan."}
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-[11px] text-tekst-3 mt-1">Hoe concreter (bedragen, stappen, voor wie), hoe beter de video. Cijfers en claims nemen we letterlijk over.</p>
              )}
            </div>

            {/* Voorbeelden en foto's, elk met een doel */}
            <div>
              <div className="flex items-center justify-between">
                <label className="n-label">Voorbeelden en foto&apos;s (mag, hoeft niet)</label>
                <button onClick={() => beeldKies.current?.click()} disabled={!!bezig || beelden.length >= MAX_BEELDEN} className="text-xs text-blue-500 hover:underline disabled:opacity-50">
                  {bezig === "beeld" ? "Uploaden…" : "＋ Beeld toevoegen"}
                </button>
                <input ref={beeldKies} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) void uploadBeelden(f); }} />
              </div>
              {beelden.length === 0 ? (
                <p className="text-[11px] text-tekst-3 mt-1">
                  Een foto van je product, je bus, je pand, een scherm van je app of een schema. Je zegt er per beeld bij wat we ermee moeten doen: natekenen, uitleggen, de stijl overnemen of de foto zelf laten zien.
                </p>
              ) : (
                <div className="mt-1.5 space-y-2">
                  {beelden.map((b, i) => (
                    <div key={b.url} className="rounded-2xl border border-rand p-2.5 flex gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.url} alt="" className="h-20 w-20 rounded-xl object-cover bg-paneel-2 shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <select value={b.doel} onChange={(e) => wijzigBeeld(i, { doel: e.target.value as MotionDoel })} className="n-invoer !py-1.5 text-sm">
                            {MOTION_DOELEN.map((d) => (
                              <option key={d.id} value={d.id}>{d.naam}</option>
                            ))}
                          </select>
                          <button onClick={() => setBeelden((nu) => nu.filter((_, j) => j !== i))} className="text-xs text-tekst-3 hover:text-red-500 whitespace-nowrap">Weghalen</button>
                        </div>
                        <input
                          value={b.uitleg}
                          onChange={(e) => wijzigBeeld(i, { uitleg: e.target.value })}
                          maxLength={240}
                          placeholder={b.doel === "tonen" ? "Wat is dit en wanneer komt het in beeld? Bijv. ons team, bij de slotzin" : b.doel === "stijl" ? "Wat vind je er mooi aan? Bijv. de ronde vormen en rustige kleuren" : b.doel === "uitleg" ? "Wat laat dit zien? Bijv. onze werkwijze in vier stappen" : "Wat is dit? Bijv. onze oranje bestelbus met logo op de zijkant"}
                          className="n-invoer !py-1.5 text-sm"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-tekst-3 leading-snug">{MOTION_DOELEN.find((d) => d.id === b.doel)?.uitleg}</p>
                          <label className="flex items-center gap-1.5 text-[11px] text-tekst-2 whitespace-nowrap cursor-pointer" title="Dit beeld gaat bij elke volgende video vanzelf mee. Klik daarna op 'Huisstijl bijwerken'.">
                            <input type="checkbox" checked={!!b.vast} onChange={(e) => wijzigBeeld(i, { vast: e.target.checked })} />
                            Hoort bij huisstijl
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                  {beelden.some((b) => b.vast) && !bewaard && (
                    <p className="text-[11px] text-tekst-3">Beelden met &quot;Hoort bij huisstijl&quot; gaan bij elke video mee zodra je bovenaan op &quot;{kit ? "Huisstijl bijwerken" : "Bewaar als huisstijl"}&quot; klikt.</p>
                  )}
                </div>
              )}
            </div>

            {!letterlijkScript && (
              <div>
                <label className="n-label">Lengte</label>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MOTION_LENGTES.map((l) => (
                    <button
                      key={l.sec}
                      onClick={() => setLengte(l.sec)}
                      className={`rounded-xl border px-3 py-2 text-left ${lengte === l.sec ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                    >
                      <div className="text-sm font-semibold text-tekst">{l.naam}</div>
                      <div className="text-[11px] text-tekst-3 leading-snug">{l.uitleg}</div>
                      <div className="text-[11px] text-tekst-2 mt-1">{motionCredits(l.sec)} credits</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="n-label">Formaat</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {MOTION_FORMATEN.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormaat(f.id)}
                    className={`rounded-xl border px-3 py-2 text-left ${formaat === f.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{f.naam}</div>
                    <div className="text-[11px] text-tekst-3">{f.uitleg}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="n-label">Tekenstijl</label>
              <p className="text-[11px] text-tekst-3 mt-0.5">Standaard volgt je huisstijl. De andere stijlen hebben hun eigen kleuren en letter; je logo en naam blijven in beeld.</p>
              <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[{ id: "", naam: "Standaard", uitleg: "Licht en strak, in de kleuren van je huisstijl." }, ...MOTION_STIJLEN].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStijl(s.id)}
                    title={s.uitleg}
                    className={`rounded-xl border overflow-hidden text-left ${stijl === s.id ? "border-blue-500 ring-1 ring-blue-500" : "border-rand hover:border-blue-500/40"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/motion/stijlen/${s.id || "standaard"}.jpg`} alt="" className="w-full aspect-video object-cover" loading="lazy" />
                    <div className="px-2.5 py-1.5 text-xs font-semibold text-tekst">{s.naam}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="n-label">Muziek</label>
              <select value={muziek} onChange={(e) => setMuziek(e.target.value)} className="n-invoer mt-1.5">
                {MOTION_MUZIEK.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.naam}</option>
                ))}
              </select>
            </div>

            <button onClick={schrijf} disabled={!kanSchrijven || !!bezig} className={`${plan ? "n-knop2" : "btn-primary"} w-full disabled:opacity-50`}>
              {bezig === "script"
                ? letterlijkScript ? "Script verdelen in scenes…" : "Script schrijven…"
                : letterlijkScript ? "🎬 Verdeel mijn script in scenes · gratis" : plan ? "✍️ Schrijf een nieuw script · gratis" : "✍️ Schrijf het script · gratis"}
            </button>
            {!bedrijf.trim() && onderwerp.trim().length >= 10 && <p className="text-[11px] text-tekst-3">Vul bovenaan nog je bedrijfsnaam in.</p>}
          </div>

          {/* Stap 2 — het script nalopen */}
          {plan && (
            <div className="n-kaart space-y-4">
              <div>
                <h2 className="font-bold text-tekst">2. Je script</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Pas gerust aan. Wat hier staat, wordt precies zo ingesproken en getekend.</p>
              </div>
              {afwijkend.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-xl px-3 py-2">
                  Let op: bij {afwijkend.map((n) => (n === 0 ? "de eindkaart" : `scene ${n}`)).join(", ")} wijkt de tekst af van je script. Loop die even na en pas aan waar nodig.
                </p>
              )}
              <div className="space-y-2">
                {plan.scenes.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-rand p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Scene {i + 1}</div>
                    <label className="block text-[11px] text-tekst-3 mt-2">Wat de stem zegt</label>
                    <textarea value={s.tekst} onChange={(e) => wijzigScene(i, { tekst: e.target.value })} rows={3} className="n-invoer mt-1 resize-none" />
                    <label className="block text-[11px] text-tekst-3 mt-2">Wat je ziet</label>
                    <textarea value={s.beeld} onChange={(e) => wijzigScene(i, { beeld: e.target.value })} rows={3} className="n-invoer mt-1 resize-none text-sm" />
                  </div>
                ))}
                <div className="rounded-2xl border border-rand p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Eindkaart · met je logo, knop en website</div>
                  <label className="block text-[11px] text-tekst-3 mt-2">Wat de stem zegt</label>
                  <textarea value={plan.eind.tekst} onChange={(e) => wijzigEind({ tekst: e.target.value })} rows={2} className="n-invoer mt-1 resize-none" />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-[11px] text-tekst-3">Regel 1 in beeld</label>
                      <input value={plan.eind.regel1} onChange={(e) => wijzigEind({ regel1: e.target.value })} maxLength={34} className="n-invoer mt-1" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-tekst-3">Regel 2 in beeld</label>
                      <input value={plan.eind.regel2} onChange={(e) => wijzigEind({ regel2: e.target.value })} maxLength={34} className="n-invoer mt-1" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] text-tekst-3">Tekst op de knop</label>
                      <input value={plan.eind.knop} onChange={(e) => wijzigEind({ knop: e.target.value })} maxLength={30} className="n-invoer mt-1" />
                    </div>
                  </div>
                </div>
              </div>
              <p className={`text-[11px] ${teLang ? "text-red-500" : "text-tekst-3"}`}>
                {woorden} woorden {teLang ? `— te lang voor ${duurTekst(lengte)}: maak het korter of kies een langere video` : `(ongeveer ${woorden / 2.5 < 90 ? `${Math.round(woorden / 2.5)} seconden` : `${(woorden / 2.5 / 60).toFixed(1).replace(".", ",")} minuten`})`}
              </p>

              <button onClick={maak} disabled={!!bezig || teLang || !bedrijf.trim()} className="btn-primary w-full disabled:opacity-50">
                {bezig === "maken" ? "Bezig met insturen…" : `✨ Maak de video · ${credits} credits`}
              </button>
              <p className="text-[11px] text-tekst-3">
                Dit duurt meestal {lengte <= 60 ? "een minuut of 5" : lengte <= 180 ? "5 tot 10 minuten" : lengte <= 300 ? "een minuut of 20" : "drie kwartier"}: de animatie wordt speciaal voor jouw script getekend en daarna nagekeken. Je kunt ondertussen
                gewoon verder; de video komt vanzelf in je bibliotheek. Mislukt het, dan krijg je je credits terug.
              </p>
            </div>
          )}

          {fout && (
            <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
              {fout}
              {fout === "Niet genoeg credits." && (
                <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>
              )}
            </p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Jouw motion graphics</h2>
          {lijst.laden && lijst.creaties.length === 0 ? (
            <p className="text-sm text-tekst-3">Laden…</p>
          ) : lijst.creaties.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
              <div className="text-4xl mb-3">✨</div>
              Vertel links waar je video over gaat. Je video&apos;s komen hier te staan.
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 items-start">
              {lijst.creaties.map((c) => (
                <CreatieKaart key={c.id} creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} />
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={(c) => c.maker === "motion" && lijst.zetVoor(c)}
        />
      )}
    </div>
  );
}
