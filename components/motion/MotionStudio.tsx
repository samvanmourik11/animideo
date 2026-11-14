"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { startMaker, useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";
import { BrowserMelding, useBrowserVideo } from "./BrowserVideo";
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
  MOTION_SOORTEN,
  MOTION_TALEN,
  MOTION_STEM_HUGO,
  isMotionSoort,
  isMotionTaal,
  isMotionLengte,
  type MotionSoort,
  type MotionTaal,
  type MotionBeeld,
  type MotionDoel,
  type MotionFormaat,
  type MotionLengte,
  type MotionPlan,
} from "@/lib/motion/types";
import { MOTION_STIJLEN } from "@/lib/motion/stijlen";
import type { RegieBericht } from "@/lib/motion/regisseur";
import type { BibliotheekStem } from "@/lib/stem/types";

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
const GESPREK = "motion-gesprek";

const OPENING: Record<MotionSoort, string> = {
  bedrijf: "Waar moet je video over gaan? Vertel wat je bedrijf doet en wat de kijker moet onthouden. Bedragen en feiten neem ik letterlijk over.",
  verhaal: "Welk verhaal wil je vertellen? Noem het onderwerp en ik zet de rode draad voor je uit.",
  uitleg: "Wat wil je uitleggen, en voor wie? Dan bouw ik het stap voor stap op.",
  vrij: "Vertel wat je in gedachten hebt. Een aankondiging, een bedankje, een weetje: alles wat getekend kan worden.",
};
const VOORZETTEN: Record<MotionSoort, string[]> = {
  bedrijf: ["Leg uit hoe ons abonnement werkt", "Maak een korte video over onze nieuwe dienst"],
  verhaal: ["De opkomst en ondergang van Napoleon", "Hoe de Titanic zonk", "Het verhaal van de eerste maanlanding"],
  uitleg: ["Hoe werkt een warmtepomp?", "Waarom is de lucht blauw?", "Hoe werkt rente op rente?"],
  vrij: ["Een uitnodiging voor ons jubileum", "Vijf weetjes over octopussen"],
};

export default function MotionStudio() {
  const [soort, setSoort] = useState<MotionSoort>("bedrijf");
  const [taal, setTaal] = useState<MotionTaal>("nl");
  const [stem, setStem] = useState<string>(MOTION_STEM_HUGO);
  const [stemmen, setStemmen] = useState<BibliotheekStem[]>([]);
  const [berichten, setBerichten] = useState<RegieBericht[]>([]);
  const [invoer, setInvoer] = useState("");
  // De naam van een kanaal of afzender, alleen in het tabblad "Geen bedrijf".
  const [afzender, setAfzender] = useState("");
  const onderaan = useRef<HTMLDivElement>(null);
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
  // De laatste stap (beeld voor beeld tot video) gebeurt in deze browser.
  const browserStand = useBrowserVideo(lijst.creaties, lijst.ververs);
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

  const toon = kit?.tone_of_voice ?? "";
  const nietDoen = kit?.do_nots ?? "";
  // Twee tabbladen: "Bedrijf" (met huisstijl, logo en kleuren) en "Geen bedrijf" (verhaal,
  // les of iets anders, zonder merk). Het tabblad volgt uit de soort video.
  const isBedrijf = soort === "bedrijf";
  const toonHuisstijl = isBedrijf;
  function kiesTab(bedrijfTab: boolean) {
    if (bedrijfTab === isBedrijf) return;
    setSoort(bedrijfTab ? "bedrijf" : "verhaal");
  }
  /** Wat er van afzender en merk meegaat: zonder bedrijf geen logo, huisstijl of vaste huisstijlbeelden. */
  function merk() {
    if (isBedrijf) return { bedrijf, website, kleur, kleur2, huisstijlId: kitId, logo, font, toon, nietDoen, beelden };
    return { bedrijf: afzender.trim(), website: "", kleur: "#1c72ed", kleur2: "#ffc21a", huisstijlId: "", logo: "", font: STANDAARD_FONT, toon: "", nietDoen: "", beelden: beelden.filter((b) => !b.vast) };
  }
  // Wat de klant in het gesprek vertelde, als achtergrond voor wie de animatie tekent.
  const onderwerp = berichten.filter((b) => b.van === "klant").map((b) => b.tekst).join("\n").slice(0, 6000);

  // De stemmen die de gekozen taal spreken; Hugo staat vooraan.
  const stemKeuzes = stemmen.filter((st) => taal === "nl" || st.talen.includes(taal)).sort((a, b) => Number(b.id === MOTION_STEM_HUGO) - Number(a.id === MOTION_STEM_HUGO));
  const gekozenStem = stemmen.find((st) => st.id === stem) ?? null;

  useEffect(() => {
    fetch("/api/stem/bibliotheek").then((r) => (r.ok ? r.json() : [])).then((d: BibliotheekStem[]) => setStemmen(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  function kiesTaal(t: MotionTaal) {
    setTaal(t);
    // Spreekt de gekozen stem die taal niet, dan de eerste die het wel kan.
    const kan = stemmen.filter((st) => t === "nl" || st.talen.includes(t));
    if (kan.length && !kan.some((st) => st.id === stem)) setStem((kan.find((st) => st.id === MOTION_STEM_HUGO) ?? kan[0]).id);
  }

  function luister() {
    if (gekozenStem?.voorbeeld) void new Audio(gekozenStem.voorbeeld).play().catch(() => {});
  }

  // Het gesprek en het script overleven een verversing van de pagina; ze staan alleen in deze browser.
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(GESPREK) ?? "null");
      if (!b) return;
      if (Array.isArray(b.berichten)) setBerichten(b.berichten);
      if (b.plan) setPlan(b.plan);
      if (isMotionSoort(b.soort)) setSoort(b.soort);
      if (isMotionTaal(b.taal)) setTaal(b.taal);
      if (typeof b.stem === "string") setStem(b.stem);
      if (typeof b.stijl === "string") setStijl(b.stijl);
      if (isMotionLengte(b.lengte)) setLengte(b.lengte);
      if (b.formaat === "9:16" || b.formaat === "16:9") setFormaat(b.formaat);
    } catch {}
  }, []);
  useEffect(() => {
    if (!berichten.length && !plan) return;
    try { localStorage.setItem(GESPREK, JSON.stringify({ berichten: berichten.slice(-40), plan, soort, taal, stem, stijl, lengte, formaat })); } catch {}
  }, [berichten, plan, soort, taal, stem, stijl, lengte, formaat]);
  useEffect(() => { if (berichten.length) onderaan.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [berichten.length, bezig]);

  function nieuwGesprek() {
    setBerichten([]); setPlan(null); setAfwijkend([]); setInvoer(""); setFout(null);
    try { localStorage.removeItem(GESPREK); } catch {}
  }

  /** Stuurt een bericht naar de regisseur; die antwoordt en schrijft of wijzigt zo nodig het script. */
  function stuur() {
    const tekst = invoer.trim();
    if (tekst.length < 2) return;
    const nu: RegieBericht[] = [...berichten, { van: "klant", tekst }];
    setBerichten(nu);
    setInvoer("");
    return doe("script", async () => {
      try {
        const r = await post<{ bericht: string; plan?: MotionPlan; afwijkend?: number[]; lengte?: MotionLengte }>("/api/motion/regisseur", {
          berichten: nu, plan, soort, lengte, formaat, taal, stijl, ...(({ bedrijf, toon, nietDoen, beelden }) => ({ bedrijf, toon, nietDoen, beelden }))(merk()),
        });
        setBerichten([...nu, { van: "regisseur", tekst: r.bericht }]);
        if (r.plan) { setPlan(r.plan); setAfwijkend(r.afwijkend ?? []); }
        if (r.lengte) setLengte(r.lengte);
      } catch (e) {
        // Het bericht terug in het invoerveld, zodat de klant het niet opnieuw hoeft te typen.
        setBerichten(berichten);
        setInvoer(tekst);
        throw e;
      }
    });
  }

  function maak() {
    return doe("maken", async () => {
      const c = await startMaker("motion", { onderwerp, ...merk(), formaat, lengte, muziek, stijl, soort, taal, stem, plan });
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
      // In het invoerveld, zodat de klant er nog iets bij kan zeggen voor hij het stuurt.
      setInvoer(tekst);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">✨ Motion graphics</h1>
        <p className="text-tekst-3 mt-1 max-w-2xl">
          Een getekende video met bewegende vormen, kaarten, cijfers en tekst, precies op de stem. Voor je bedrijf, een verhaal, een les of iets
          heel anders. Kies de vorm, bespreek met de regisseur waar het over gaat, en de animatie wordt voor jouw verhaal getekend.
        </p>
      </div>

      <BrowserMelding stand={browserStand} />

      <div className="inline-flex rounded-2xl border border-rand bg-paneel-2/40 p-1">
        {[
          { bedrijf: true, naam: "🏢 Voor een bedrijf", uitleg: "Met je logo, kleuren en huisstijl" },
          { bedrijf: false, naam: "🎨 Geen bedrijf", uitleg: "Verhaal, les of iets anders" },
        ].map((t) => (
          <button
            key={t.naam}
            onClick={() => kiesTab(t.bedrijf)}
            className={`rounded-xl px-4 py-2 text-left transition ${isBedrijf === t.bedrijf ? "bg-blue-500 text-white shadow" : "text-tekst-2 hover:text-tekst"}`}
          >
            <div className="text-sm font-semibold">{t.naam}</div>
            <div className={`text-[11px] ${isBedrijf === t.bedrijf ? "text-white/80" : "text-tekst-3"}`}>{t.uitleg}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4">
          {/* Stap 1 — de vorm: wat voor video, hoe hij eruitziet en klinkt */}
          <div className="n-kaart space-y-4">
            <div>
              <h2 className="font-bold text-tekst">1. Kies de vorm</h2>
              <p className="text-xs text-tekst-3 mt-0.5">Hoe de video eruitziet en klinkt. Waar hij over gaat, bespreek je daarna met de regisseur.</p>
            </div>
            {!isBedrijf && (
            <div>
              <label className="n-label">Wat voor video?</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {MOTION_SOORTEN.filter((k) => k.id !== "bedrijf").map((k) => (
                  <button
                    key={k.id}
                    onClick={() => setSoort(k.id)}
                    className={`rounded-xl border px-3 py-2 text-left ${soort === k.id ? "border-blue-500 bg-blue-500/10" : "border-rand hover:border-blue-500/40"}`}
                  >
                    <div className="text-sm font-semibold text-tekst">{k.naam}</div>
                    <div className="text-[11px] text-tekst-3">{k.uitleg}</div>
                  </button>
                ))}
              </div>
            </div>
            )}

            <div>
              <label className="n-label">Tekenstijl</label>
              <p className="text-[11px] text-tekst-3 mt-0.5">{isBedrijf ? "Standaard volgt je huisstijl. De andere stijlen hebben hun eigen kleuren en letter; je logo en naam blijven in beeld." : "Elke stijl heeft zijn eigen kleuren en letter."}</p>
              <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[{ id: "", naam: "Standaard", uitleg: isBedrijf ? "Licht en strak, in de kleuren van je huisstijl." : "Licht en strak." }, ...MOTION_STIJLEN].map((s) => (
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

            {true && (
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="n-label">Taal</label>
                <select value={taal} onChange={(e) => kiesTaal(e.target.value as MotionTaal)} className="n-invoer mt-1.5">
                  {MOTION_TALEN.map((t) => (
                    <option key={t.id} value={t.id}>{t.naam}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="n-label">Stem</label>
                <div className="mt-1.5 flex gap-2">
                  <select value={stem} onChange={(e) => setStem(e.target.value)} className="n-invoer min-w-0">
                    {stemKeuzes.length === 0 && <option value={MOTION_STEM_HUGO}>Hugo</option>}
                    {stemKeuzes.map((st) => (
                      <option key={st.id} value={st.id}>{st.naam} · {st.geslacht}, {st.leeftijd}</option>
                    ))}
                  </select>
                  <button onClick={luister} disabled={!gekozenStem?.voorbeeld} title="Luister naar deze stem" className="n-knop2 !px-3 disabled:opacity-50">▶</button>
                </div>
              </div>
            </div>
            {gekozenStem && <p className="text-[11px] text-tekst-3 -mt-2">{gekozenStem.typering}{taal !== "nl" ? ". Het voorbeeld is in het Nederlands; de video wordt in het Engels ingesproken." : ""}</p>}

            <div>
              <label className="n-label">Muziek</label>
              <select value={muziek} onChange={(e) => setMuziek(e.target.value)} className="n-invoer mt-1.5">
                {MOTION_MUZIEK.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.naam}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Afzender — zonder bedrijf alleen een naam, en die mag leeg */}
          {!isBedrijf && (
            <div className="n-kaart space-y-3">
              <div>
                <h2 className="font-bold text-tekst">Naam in beeld (mag, hoeft niet)</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Vul je de naam van je kanaal in, dan staat die linksboven en op de eindkaart. Leeg laten kan ook: dan sluit de video af met alleen de slotzin.</p>
              </div>
              <input value={afzender} onChange={(e) => setAfzender(e.target.value)} maxLength={40} placeholder="Naam van je kanaal (mag leeg)" className="n-invoer" />
            </div>
          )}
          {toonHuisstijl && (
            <>
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

            </>
          )}

          {/* Stap 2 — het gesprek met de regisseur */}
          <div className="n-kaart space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-tekst">2. Praat met de regisseur</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Vertel waar de video over gaat. De regisseur schrijft het script en past het aan tot het goed is. Dit is gratis.</p>
              </div>
              {(berichten.length > 0 || plan) && (
                <button onClick={nieuwGesprek} disabled={!!bezig} className="text-xs text-tekst-3 hover:text-red-500 whitespace-nowrap disabled:opacity-50">Opnieuw beginnen</button>
              )}
            </div>

            <div className="space-y-2">
              {berichten.length === 0 && (
                <div className="rounded-2xl bg-paneel-2/60 px-3 py-2.5 text-sm text-tekst-2">
                  <p>🎬 {OPENING[soort]}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {VOORZETTEN[soort].map((v) => (
                      <button key={v} onClick={() => setInvoer(v)} className="rounded-full border border-rand px-2.5 py-1 text-[11px] text-tekst-2 hover:border-blue-500/50">{v}</button>
                    ))}
                  </div>
                </div>
              )}
              {berichten.map((b, i) => (
                <div key={i} className={`flex ${b.van === "klant" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${b.van === "klant" ? "bg-blue-500 text-white" : "bg-paneel-2/70 text-tekst"}`}>
                    {b.van === "klant" && b.tekst.length > 600 ? `${b.tekst.slice(0, 600)}… (${b.tekst.split(/\s+/).length} woorden)` : b.tekst}
                  </div>
                </div>
              ))}
              {bezig === "script" && <div className="text-sm text-tekst-3 px-1">De regisseur is bezig…</div>}
              <div ref={onderaan} />
            </div>

            <div>
              <textarea
                value={invoer}
                onChange={(e) => setInvoer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !bezig && invoer.trim().length >= 2) { e.preventDefault(); void stuur(); } }}
                rows={invoer.length > 300 ? 8 : 3}
                placeholder={plan ? "Bijvoorbeeld: maak scene 3 korter, of: begin met een vraag" : "Typ hier, of plak een script dat je al hebt"}
                className="n-invoer resize-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <button onClick={() => scriptKies.current?.click()} disabled={!!bezig} className="text-xs text-blue-500 hover:underline disabled:opacity-50">
                  {bezig === "bestand" ? "Inlezen…" : "📄 Ik heb al een script (Word, PDF of tekst)"}
                </button>
                <input ref={scriptKies} type="file" accept=".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadScript(f); }} />
                <button onClick={() => void stuur()} disabled={!!bezig || invoer.trim().length < 2} className="btn-primary !py-2 !px-5 disabled:opacity-50">Stuur</button>
              </div>
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
              {merk().beelden.length === 0 ? (
                <p className="text-[11px] text-tekst-3 mt-1">
                  Een foto van je product, je bus, je pand, een scherm van je app of een schema. Je zegt er per beeld bij wat we ermee moeten doen: natekenen, uitleggen, de stijl overnemen of de foto zelf laten zien.
                </p>
              ) : (
                <div className="mt-1.5 space-y-2">
                  {beelden.map((b, i) => (!isBedrijf && b.vast) ? null : (
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
                          {isBedrijf && <label className="flex items-center gap-1.5 text-[11px] text-tekst-2 whitespace-nowrap cursor-pointer" title="Dit beeld gaat bij elke volgende video vanzelf mee. Klik daarna op 'Huisstijl bijwerken'.">
                            <input type="checkbox" checked={!!b.vast} onChange={(e) => wijzigBeeld(i, { vast: e.target.checked })} />
                            Hoort bij huisstijl
                          </label>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isBedrijf && beelden.some((b) => b.vast) && !bewaard && (
                    <p className="text-[11px] text-tekst-3">Beelden met &quot;Hoort bij huisstijl&quot; gaan bij elke video mee zodra je bovenaan op &quot;{kit ? "Huisstijl bijwerken" : "Bewaar als huisstijl"}&quot; klikt.</p>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Stap 3 — het script nalopen */}
          {plan && (
            <div className="n-kaart space-y-4">
              <div>
                <h2 className="font-bold text-tekst">3. Je script</h2>
                <p className="text-xs text-tekst-3 mt-0.5">Pas gerust zelf aan, of vraag het de regisseur. Wat hier staat, wordt precies zo ingesproken en getekend.</p>
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
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-tekst-3">Eindkaart{bedrijf.trim() ? " · met je logo, knop en website" : ""}</div>
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

              <button onClick={maak} disabled={!!bezig || teLang || (soort === "bedrijf" && !bedrijf.trim())} className="btn-primary w-full disabled:opacity-50">
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
              Kies links de vorm en praat met de regisseur. Je video&apos;s komen hier te staan.
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
