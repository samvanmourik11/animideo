// Kiest de 100 beste stemmen voor Nederlands uit de gedeelde bibliotheek van ElevenLabs
// (alleen lezen, gratis) en schrijft lib/stem/bibliotheek.json. Die stemmen gebruiken we
// via fal (fal-ai/elevenlabs/tts/eleven-v3 met het voice-id), net als Hugo.
//
//   npx tsx --env-file=.env.local scripts/sync-stemmen.ts
//   (daarna BIBLIOTHEEK_VERSIE in components/stem/StemStudio.tsx ophogen)
//
// Waarom niet gewoon alles: de bibliotheek heeft ~1.200 stemmen die "Nederlands" kunnen,
// maar het merendeel is een Engelse of Indiase stem met Nederlands als bijtaal, en het
// standaardvoorbeeld daarvan is in de eigen taal (Sam, 22-10-2026: "ik wil 100 goede").
// Daarom: alleen stemmen die ElevenLabs zelf op Nederlands heeft gecontroleerd, met hun
// Nederlandse voorbeeld, gerangschikt op wat er de afgelopen week écht mee gemaakt is.

import { writeFileSync } from "node:fs";

interface Taal { language: string; accent?: string; preview_url?: string | null }
interface Gedeeld {
  voice_id: string;
  name: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  use_case?: string;
  descriptive?: string;
  description?: string;
  cloned_by_count?: number;
  usage_character_count_7d?: number;
  verified_languages?: Taal[];
}

const KEY = process.env.ELEVENLABS_API_KEY!;
const AANTAL = 100;

async function pagina(nr: number): Promise<{ voices: Gedeeld[]; has_more: boolean }> {
  const q = new URLSearchParams({ page_size: "100", page: String(nr), language: "nl", sort: "cloned_by_count" });
  const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${q}`, { headers: { "xi-api-key": KEY } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Het Nederlandse voorbeeld en het accent waarmee de stem Nederlands spreekt. */
function nederlands(v: Gedeeld): { voorbeeld: string; accent: string } | null {
  const nl = (v.verified_languages ?? []).filter((l) => l.language === "nl" && l.preview_url);
  if (!nl.length) return null;
  const voorkeur = nl.find((l) => /standard|flemish|brabant/.test(l.accent ?? "")) ?? nl[0];
  return { voorbeeld: voorkeur.preview_url!, accent: voorkeur.accent ?? "" };
}

/** Recent gebruik weegt het zwaarst: populair-van-vroeger zegt weinig over kwaliteit nu. */
const score = (v: Gedeeld) => (v.usage_character_count_7d ?? 0) / 1000 + (v.cloned_by_count ?? 0) / 10;

function netjes(v: Gedeeld, nl: { voorbeeld: string; accent: string }) {
  // Namen in de bibliotheek zijn vaak "Jeroen - Chill"; het deel na het streepje is een typering.
  const [naam, ...rest] = v.name.trim().split(/\s+[-–|]\s+/);
  const eigen = v.language === "nl";
  const regio = /flemish/.test(eigen ? v.accent ?? "" : nl.accent) ? "Vlaams" : /brabant/.test(eigen ? v.accent ?? "" : nl.accent) ? "Brabants" : "Nederlands";
  // Nederlands vooraan, daarna de andere talen die ElevenLabs voor deze stem heeft gecontroleerd.
  const VOORAAN = ["en", "de", "fr", "es"];
  const rang = (t: string) => (VOORAAN.includes(t) ? VOORAAN.indexOf(t) : VOORAAN.length);
  const talen = ["nl", ...[...new Set((v.verified_languages ?? []).map((l) => l.language).filter((t) => t !== "nl"))].sort((a, b) => rang(a) - rang(b))];
  return {
    id: v.voice_id,
    naam: naam.trim().slice(0, 40),
    typering: (rest.join(" ") || v.descriptive || "").trim().slice(0, 60),
    geslacht: v.gender === "female" ? "vrouw" : v.gender === "male" ? "man" : "neutraal",
    leeftijd: v.age === "young" ? "jong" : v.age === "old" ? "ouder" : "volwassen",
    accent: regio,
    moedertaal: eigen,
    taal: "nl",
    talen,
    gebruik: (v.use_case || "").replace(/_/g, " "),
    beschrijving: (v.description || "").replace(/\s+/g, " ").trim().slice(0, 180),
    voorbeeld: nl.voorbeeld,
    populariteit: Math.round(score(v)),
  };
}

async function main() {
  const alle: Gedeeld[] = [];
  for (let nr = 0; nr < 20; nr++) {
    const p = await pagina(nr);
    alle.push(...p.voices);
    if (!p.has_more || !p.voices.length) break;
  }
  const kandidaten = [...new Map(alle.map((v) => [v.voice_id, v])).values()]
    .map((v) => ({ v, nl: nederlands(v) }))
    .filter((x): x is { v: Gedeeld; nl: { voorbeeld: string; accent: string } } => !!x.nl)
    .sort((a, b) => score(b.v) - score(a.v));

  const eigen = kandidaten.filter((x) => x.v.language === "nl");
  // Internationale stemmen alleen als ElevenLabs hun Nederlands als echt Nederlands of Vlaams
  // heeft gecontroleerd; "other" klinkt in de praktijk als Engels met een accent.
  const internationaal = kandidaten.filter((x) => x.v.language !== "nl" && /^nl-(standard|flemish)$/.test(x.nl.accent));
  const isVlaams = (x: (typeof kandidaten)[number]) => /flemish|brabant/.test(x.v.accent ?? "");

  // Verdeling zodat er voor elk wat wils is: de bibliotheek telt drie keer zoveel mannen.
  const gekozen = new Map<string, (typeof kandidaten)[number]>();
  const neem = (lijst: typeof kandidaten, n: number) => {
    for (const x of lijst) {
      if (n <= 0) break;
      if (!gekozen.has(x.v.voice_id)) { gekozen.set(x.v.voice_id, x); n--; }
    }
  };
  neem(eigen.filter(isVlaams), 14);
  neem(eigen.filter((x) => !isVlaams(x) && x.v.gender === "female"), 28);
  neem(eigen.filter((x) => !isVlaams(x) && x.v.gender === "male"), 38);
  neem(internationaal.filter((x) => x.v.gender === "female"), 10);
  neem(internationaal.filter((x) => x.v.gender === "male"), 10);
  neem(eigen, AANTAL - gekozen.size);

  // Echte Nederlandstalige stemmen vooraan; de internationale zijn wereldwijd zó populair dat
  // ze anders bovenaan komen, terwijl ze in het Nederlands net minder natuurlijk klinken.
  const lijst = [...gekozen.values()]
    .sort((a, b) => Number(b.v.language === "nl") - Number(a.v.language === "nl") || score(b.v) - score(a.v))
    .map((x) => netjes(x.v, x.nl));
  writeFileSync("lib/stem/bibliotheek.json", JSON.stringify(lijst) + "\n");
  const tel = (f: (s: (typeof lijst)[number]) => boolean) => lijst.filter(f).length;
  console.log(`${alle.length} bekeken → ${lijst.length} gekozen: ${tel((s) => s.moedertaal)} Nederlandstalig (${tel((s) => s.accent !== "Nederlands")} Vlaams/Brabants), ${tel((s) => !s.moedertaal)} internationaal; ${tel((s) => s.geslacht === "vrouw")} vrouwen`);
}

main();
