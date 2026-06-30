// Gedeelde helpers voor merk-assets (brand kit reference images met rol/element).
// Doel: een bedrijf z'n échte assets (boot, werkkleding, locatie, product, logo)
// worden één keer vastgelegd en daarna consistent door alle scènes hergebruikt.

import type { BrandReferenceImage, BrandAssetRole } from "@/lib/types";

export interface NormalizedBrandAsset {
  id: string;
  url: string;
  role: BrandAssetRole;
  element: string;
  description: string;
}

const ROLES: BrandAssetRole[] = ["logo", "vehicle", "product", "team", "location", "other"];

/** URL-veilige slug uit vrije tekst (zonder accenten, max lengte). */
export function slugify(text: string, maxLen = 40): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "") || "asset";
}

/** Stabiele asset-id uit rol + element, bv. "vehicle-oranje-zeiljacht". */
export function makeAssetId(role: BrandAssetRole, element: string): string {
  return `${role}-${slugify(element)}`;
}

/**
 * Vult ontbrekende velden voor (oudere) reference images aan zodat downstream
 * altijd een volledige asset heeft. Legacy `{url, description}` → role "other",
 * id "legacy-N", element = description.
 */
export function normalizeBrandAsset(ref: BrandReferenceImage, index: number): NormalizedBrandAsset {
  const role: BrandAssetRole = ref.role && ROLES.includes(ref.role) ? ref.role : "other";
  const element = (ref.element ?? ref.description ?? "").trim() || "merk-element";
  const id = (ref.id ?? "").trim() || `legacy-${index}`;
  return { id, url: ref.url, role, element, description: ref.description ?? "" };
}

/** Normaliseer een hele lijst, dedup op id (eerste wint). */
export function normalizeBrandAssets(refs: BrandReferenceImage[] | null | undefined): NormalizedBrandAsset[] {
  const out: NormalizedBrandAsset[] = [];
  const seen = new Set<string>();
  (refs ?? []).forEach((r, i) => {
    if (!r?.url) return;
    const a = normalizeBrandAsset(r, i);
    if (seen.has(a.id)) return;
    seen.add(a.id);
    out.push(a);
  });
  return out;
}

/**
 * Prompt-blok voor de scriptschrijver: lijst van échte merk-assets die in de
 * video kunnen voorkomen. Het logo wordt UITGESLOTEN (dat wordt los gecomposit,
 * niet getekend). Retourneert de tekst + de toegestane id's voor validatie.
 */
export function buildBrandAssetBlock(assets: NormalizedBrandAsset[]): { text: string; ids: string[] } {
  const usable = assets.filter(a => a.role !== "logo");
  if (usable.length === 0) return { text: "", ids: [] };
  const lines = usable.map(a => `[${a.id}] ${a.role} — ${a.element}`).join("\n");
  const text = `\n\nECHTE MERK-ASSETS van dit bedrijf (gebruik de échte, niet een generiek alternatief):\n${lines}\n\nAls een scène een van deze assets toont, beschrijf 'm concreet in voiceover_text én image_prompt (de échte boot/kleding/locatie/product), en zet de bijbehorende id('s) in "brand_asset_ids" van die scène. Gebruik telkens DEZELFDE id wanneer hetzelfde object terugkomt, zodat het er in elke scène identiek uitziet.`;
  return { text, ids: usable.map(a => a.id) };
}
