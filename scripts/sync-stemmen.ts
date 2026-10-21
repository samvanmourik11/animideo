// Haalt de stemmenbibliotheek op uit de gedeelde bibliotheek van ElevenLabs (alleen
// lezen, gratis) en schrijft lib/stem/bibliotheek.json. Die stemmen gebruiken we via fal
// (fal-ai/elevenlabs/tts/eleven-v3 met het voice-id), net als Hugo.
//
//   npx tsx --env-file=.env.local scripts/sync-stemmen.ts
//
// Nederlands en Vlaams zoveel als er zijn; daarnaast de populairste internationale
// stemmen, voor wie in het Engels of Duits iets wil inspreken.

import { writeFileSync } from "node:fs";

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
  preview_url?: string;
  cloned_by_count?: number;
  usage_character_count_1y?: number;
}

const KEY = process.env.ELEVENLABS_API_KEY!;

async function pagina(params: Record<string, string>, nr: number): Promise<{ voices: Gedeeld[]; has_more: boolean }> {
  const q = new URLSearchParams({ page_size: "100", page: String(nr), ...params });
  const res = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${q}`, { headers: { "xi-api-key": KEY } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function alles(params: Record<string, string>, max: number): Promise<Gedeeld[]> {
  const uit: Gedeeld[] = [];
  for (let nr = 0; uit.length < max; nr++) {
    const p = await pagina(params, nr);
    uit.push(...p.voices);
    if (!p.has_more || !p.voices.length) break;
  }
  return uit.slice(0, max);
}

function netjes(v: Gedeeld, taal: string) {
  // Namen in de bibliotheek zijn vaak "Jeroen - Chill"; het deel na het streepje is een typering.
  const [naam, ...rest] = v.name.split(/\s+[-–|]\s+/);
  return {
    id: v.voice_id,
    naam: naam.trim().slice(0, 40),
    typering: (rest.join(" ") || v.descriptive || "").trim().slice(0, 60),
    geslacht: v.gender === "female" ? "vrouw" : v.gender === "male" ? "man" : "neutraal",
    leeftijd: v.age === "young" ? "jong" : v.age === "old" ? "ouder" : "volwassen",
    accent: v.accent === "flemish" ? "Vlaams" : v.accent === "brabantian" ? "Brabants" : taal === "nl" ? "Nederlands" : (v.accent || "").slice(0, 30),
    taal,
    gebruik: (v.use_case || "").replace(/_/g, " "),
    beschrijving: (v.description || "").replace(/\s+/g, " ").trim().slice(0, 180),
    voorbeeld: v.preview_url ?? "",
    populariteit: (v.cloned_by_count ?? 0) + Math.round((v.usage_character_count_1y ?? 0) / 100000),
  };
}

async function main() {
  const nl = (await alles({ language: "nl", sort: "cloned_by_count" }, 1000)).map((v) => netjes(v, "nl"));
  const en = (await alles({ language: "en", sort: "cloned_by_count" }, 150)).map((v) => netjes(v, "en"));
  const de = (await alles({ language: "de", sort: "cloned_by_count" }, 50)).map((v) => netjes(v, "de"));
  const gezien = new Set<string>();
  const lijst = [...nl, ...en, ...de].filter((v) => v.voorbeeld && !gezien.has(v.id) && gezien.add(v.id));
  writeFileSync("lib/stem/bibliotheek.json", JSON.stringify(lijst) + "\n");
  console.log(`nl: ${nl.length}, en: ${en.length}, de: ${de.length} → ${lijst.length} stemmen`);
}

main();
