// Vaste muziekbibliotheek: rechtenvrije achtergrondnummers die we zelf hebben
// gecureerd en één keer naar de publieke `music`-bucket hebben gezet
// (scripts/upload-music-library.mjs).
//
// Dit vervangt het AI-gegenereerde muziekbed (CassetteAI). Dat leverde in de
// praktijk steeds onbruikbare beds op — vlak, rommelig, soms met stemgeluid —
// terwijl een gekozen echt nummer altijd goed klinkt en meteen te beluisteren
// is vóór je kiest. Zelfde bibliotheek in Creator Studio, Storytelling en
// Dialoog, zodat een klant overal dezelfde nummers herkent.
//
// De `duration` is de lengte van het bronbestand. Bij het exporteren wordt het
// nummer op de videolengte gezet (lib/music/bed.ts): korter = doorlussen,
// langer = afkappen met een uitfade.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://suuskaaobsbttahqcoct.supabase.co";

export type MusicCategory =
  | "zakelijk"
  | "vrolijk"
  | "episch"
  | "emotioneel"
  | "actie"
  | "elektronisch";

export interface MusicCategoryInfo {
  id: MusicCategory;
  label: string;
  // Eén zin die de klant helpt kiezen: waar past deze categorie bij?
  hint: string;
}

export const MUSIC_CATEGORIES: MusicCategoryInfo[] = [
  { id: "zakelijk",     label: "Zakelijk & corporate", hint: "Neutraal en opbouwend — uitleg, dienst, B2B" },
  { id: "vrolijk",      label: "Vrolijk & upbeat",     hint: "Licht en positief — social, onboarding, blije boodschap" },
  { id: "episch",       label: "Episch & cinematisch", hint: "Groots orkest — visie, merkverhaal, aftrap" },
  { id: "emotioneel",   label: "Emotioneel & rustig",  hint: "Piano en ingetogen — persoonlijk of gevoelig verhaal" },
  { id: "actie",        label: "Actie & trailer",      hint: "Strak en gespannen — sport, techniek, aankondiging" },
  { id: "elektronisch", label: "Elektronisch & lifestyle", hint: "Modern en ritmisch — mode, product, commercial" },
];

export interface MusicTrack {
  // Slug = bestandsnaam in de bucket (`music/<slug>.mp3`).
  slug: string;
  title: string;
  category: MusicCategory;
  // Lengte van het bronnummer in seconden.
  duration: number;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  // ── Zakelijk & corporate ────────────────────────────────────────────────
  { slug: "motiverend-corporate",          title: "Motiverend corporate",     category: "zakelijk", duration: 141 },
  { slug: "corporate-uplifting",           title: "Corporate uplifting",      category: "zakelijk", duration: 136 },
  { slug: "inspirerend-corporate-simpel",  title: "Inspirerend & simpel",     category: "zakelijk", duration: 135 },
  { slug: "inspirational",                 title: "Inspirational",            category: "zakelijk", duration: 134 },
  { slug: "upbeat-corporate-vlog",         title: "Upbeat corporate vlog",    category: "zakelijk", duration: 145 },
  { slug: "upbeat-inspiratie-business",    title: "Upbeat inspiratie",        category: "zakelijk", duration: 135 },
  { slug: "uplifting-corporate",           title: "Uplifting corporate",      category: "zakelijk", duration: 127 },

  // ── Vrolijk & upbeat ────────────────────────────────────────────────────
  { slug: "vrolijk-positief-motiverend",   title: "Vrolijk & positief",       category: "vrolijk", duration: 120 },
  { slug: "happy-ukelele",                 title: "Happy ukelele",            category: "vrolijk", duration: 71 },

  // ── Episch & cinematisch ────────────────────────────────────────────────
  { slug: "episch-inspirerend",            title: "Episch inspirerend",       category: "episch", duration: 171 },
  { slug: "orkest-motivatie",              title: "Orkest motivatie",         category: "episch", duration: 211 },
  { slug: "epische-motivatie",             title: "Epische motivatie",        category: "episch", duration: 173 },
  { slug: "episch-avontuur",               title: "Episch avontuur",          category: "episch", duration: 132 },
  { slug: "epic-adventures-orkest",        title: "Epic adventures",          category: "episch", duration: 154 },
  { slug: "episch-dramatisch",             title: "Episch & dramatisch",      category: "episch", duration: 175 },
  { slug: "filmisch-orkest",               title: "Filmisch orkest",          category: "episch", duration: 160 },

  // ── Emotioneel & rustig ─────────────────────────────────────────────────
  { slug: "drama-romantisch",              title: "Drama & romantiek",        category: "emotioneel", duration: 126 },
  { slug: "piano-drama",                   title: "Piano drama",              category: "emotioneel", duration: 136 },

  // ── Actie & trailer ─────────────────────────────────────────────────────
  { slug: "hybrid-action-trailer",         title: "Hybrid action trailer",    category: "actie", duration: 150 },
  { slug: "epic-action-trailer",           title: "Epic action trailer",      category: "actie", duration: 145 },
  { slug: "intense-trailer-intro",         title: "Intense trailer-intro",    category: "actie", duration: 132 },
  { slug: "dramatische-trailer",           title: "Dramatische trailer",      category: "actie", duration: 86 },
  { slug: "dramatic-hybrid-trailer",       title: "Dramatic hybrid trailer",  category: "actie", duration: 159 },
  { slug: "extreme-metal-actie",           title: "Extreme metal",            category: "actie", duration: 99 },
  { slug: "dubstep-sport",                 title: "Dubstep sport",            category: "actie", duration: 152 },

  // ── Elektronisch & lifestyle ────────────────────────────────────────────
  { slug: "house-party-commercial",        title: "House party commercial",   category: "elektronisch", duration: 135 },
  { slug: "electro-lifestyle",             title: "Electro lifestyle",        category: "elektronisch", duration: 519 },
];

export function musicTrackUrl(slug: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/music/${slug}.mp3`;
}

/**
 * Zoekt het nummer op bij een opgeslagen URL. Projecten van vóór de
 * bibliotheek hebben een AI-bed of een zelf geüploade mp3 als `musicUrl`;
 * daar hoort geen track bij en dat is prima — de UI toont dan "eigen muziek".
 */
export function findMusicTrackByUrl(url: string | null | undefined): MusicTrack | null {
  if (!url) return null;
  const slug = url.split("/").pop()?.replace(/\.mp3$/i, "") ?? "";
  return MUSIC_TRACKS.find((t) => t.slug === slug) ?? null;
}

export function musicCategoryLabel(id: MusicCategory): string {
  return MUSIC_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** 154 → "2:34" */
export function formatMusicDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
