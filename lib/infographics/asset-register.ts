import { TEKENINGEN, type TekenOpties } from "@/lib/infographics/illustrator";
import { BESTAND_ASSETS } from "@/lib/infographics/assets-generated";
import type { OverheidKleuren } from "@/lib/infographics/overheid-scene";

// HET ASSET-REGISTER.
//
// De bibliotheek moet groeien zonder dat er voor elke tekening code bij komt.
// Tot nu toe was elke asset een functie die vormen tekende — prima voor dingen
// die moeten kunnen variëren (een figuur met een andere houding, huid en
// kleding), maar onhandig voor alles wat gewoon één vaste vorm is. De kaart van
// Nederland is daar het bewijs van: die hoort geen handgeschreven pad te zijn
// maar echte geometrie, en met de hand een kustlijn natypen levert een blob op.
//
// Daarom twee soorten assets, achter één register:
//
//   CODE      een functie met parameters — mensen, gebouwen, alles wat varieert.
//   BESTAND   een .svg uit lib/infographics/assets/, ingelezen bij het bouwen.
//
// Een bestand toevoegen is: het .svg'tje neerzetten, een regel in manifest.json,
// `npm run assets` draaien. Geen code. Daarmee kan de bibliotheek groeien zonder
// mij, en kunnen er ook tekeningen van een illustrator in.
//
// KLEUREN. Een asset uit een bestand heeft vaste kleuren, en dat botst met een
// huisstijl. Daarom werken de bestanden met een vaste set plaatshouders die hier
// worden vervangen door het palet van de video (zie PLAATSHOUDERS).

export type AssetCategorie = "mens" | "gebouw" | "object" | "vervoer" | "natuur" | "symbool" | "decor";

export interface AssetMeta {
  /** Sleutel waarmee de AI het asset kiest. */
  sleutel: string;
  /** Waar het voor staat, in gewone taal. Dit ziet de AI. */
  omschrijving: string;
  categorie: AssetCategorie;
  /** Hoogte in meters. Bepaalt de maat in een tafereel. */
  maat: number;
  /** Staat het op de grond (false) of hangt het in de lucht (true)? */
  zweeft?: boolean;
}

/**
 * Plaatshouderkleuren in de SVG-bestanden. Wie een asset tekent gebruikt deze
 * hexcodes; bij het renderen worden ze vervangen door het palet van de video.
 * Bewust opvallende, onnatuurlijke kleuren, zodat je in een tekenprogramma
 * meteen ziet welke laag welke rol heeft.
 */
export const PLAATSHOUDERS: Record<string, keyof OverheidKleuren> = {
  "#ff00ff": "donker",  // magenta  → hoofdkleur
  "#00ffff": "blauw",   // cyaan    → steunkleur
  "#ffff00": "accent",  // geel     → accent
  "#00ff00": "mint",    // groen    → zachte steunkleur
  "#ff8800": "roze",    // oranje   → tweede zachte kleur
  "#ffffff": "paneel",  // wit      → paneel/wit vlak
  "#eeeeee": "papier",  // lichtgrijs → papier binnen een object
};

/** Zet de plaatshouders in een SVG-fragment om naar het palet van deze video. */
export function kleurIn(svg: string, k: OverheidKleuren): string {
  let uit = svg;
  for (const [plaatshouder, rol] of Object.entries(PLAATSHOUDERS)) {
    // Hoofdletterongevoelig, want tekenprogramma's schrijven hex verschillend.
    uit = uit.replace(new RegExp(plaatshouder, "gi"), k[rol]);
  }
  return uit;
}

// ── Metadata van de code-tekeningen ────────────────────────────────────────
//
// Eén bron van waarheid: hier staat wat een asset betekent én hoe groot het is.
// Voorheen stond de omschrijving in overheid-scene.ts en de maat in tafereel.ts,
// en dat liep uit de pas zodra er iets bij kwam.

export const CODE_ASSETS: AssetMeta[] = [
  // mensen
  { sleutel: "figuur", omschrijving: "één persoon ten voeten uit, met gezicht en kleding", categorie: "mens", maat: 1.7 },
  { sleutel: "groep", omschrijving: "twee of meer mensen, een groep, jongeren, gezinnen, iedereen", categorie: "mens", maat: 1.7 },
  { sleutel: "hand", omschrijving: "hand die vanaf de rand het beeld in komt, iets aanreikt of aanwijst", categorie: "mens", maat: 1.1 },
  // gebouwen
  { sleutel: "rijtjeshuis", omschrijving: "woning, huis, koopwoning, thuis", categorie: "gebouw", maat: 7 },
  { sleutel: "rijtjeshuizen", omschrijving: "woonstraat, wijk, buurt, woningmarkt", categorie: "gebouw", maat: 7 },
  { sleutel: "kerk", omschrijving: "kerk, monument, historisch gebouw", categorie: "gebouw", maat: 16 },
  { sleutel: "fabriek", omschrijving: "industrie, uitstoot, energie, bedrijven", categorie: "gebouw", maat: 13 },
  { sleutel: "kantoor", omschrijving: "kantoor, bedrijf, werkgever", categorie: "gebouw", maat: 13 },
  { sleutel: "stadhuis", omschrijving: "overheid, gemeente, ministerie, rechtspraak", categorie: "gebouw", maat: 12 },
  { sleutel: "loket", omschrijving: "balie, loket, hulp aanvragen, dienstverlening", categorie: "gebouw", maat: 2.2 },
  // vervoer
  { sleutel: "auto", omschrijving: "auto, vervoer, rijden", categorie: "vervoer", maat: 1.5 },
  { sleutel: "fiets", omschrijving: "fiets, dagelijks vervoer", categorie: "vervoer", maat: 1.1 },
  // objecten
  { sleutel: "schatkist", omschrijving: "rijksbegroting, schatkist, staatskas", categorie: "object", maat: 1.1 },
  { sleutel: "koffer", omschrijving: "koffer, aktetas, Prinsjesdag", categorie: "object", maat: 0.5 },
  { sleutel: "munt", omschrijving: "euro, geld, bedrag, kosten", categorie: "object", maat: 0.28 },
  { sleutel: "muntstapel", omschrijving: "stapel geld, budget, uitkering, subsidie", categorie: "object", maat: 0.7 },
  { sleutel: "document", omschrijving: "document, rapport, brief, aanvraag", categorie: "object", maat: 0.35 },
  { sleutel: "formulier", omschrijving: "formulier, checklist, regels, administratie", categorie: "object", maat: 0.35 },
  { sleutel: "pasje", omschrijving: "rijbewijs, identiteitskaart, legitimatie", categorie: "object", maat: 0.14 },
  { sleutel: "envelop", omschrijving: "post, brief, blauwe envelop van de Belastingdienst", categorie: "object", maat: 0.24 },
  { sleutel: "laptop", omschrijving: "online, digitaal aanvragen, DigiD, website", categorie: "object", maat: 0.4 },
  { sleutel: "portemonnee", omschrijving: "portemonnee, inkomen, koopkracht", categorie: "object", maat: 0.2 },
  { sleutel: "bord", omschrijving: "presentatie, uitleg, cijfers op een bord", categorie: "object", maat: 1.8 },
  // natuur
  { sleutel: "boom", omschrijving: "natuur, groen, buiten, leefomgeving", categorie: "natuur", maat: 6 },
  { sleutel: "wolk", omschrijving: "lucht, weer (alleen als decor)", categorie: "natuur", maat: 9, zweeft: true },
  // symbolen
  { sleutel: "hart", omschrijving: "zorg, gezondheid, welzijn", categorie: "symbool", maat: 1.2, zweeft: true },
  { sleutel: "kruis", omschrijving: "zorg, ziekenhuis, huisarts", categorie: "symbool", maat: 1.2 },
  { sleutel: "boek", omschrijving: "onderwijs, school, studie, wet", categorie: "symbool", maat: 0.4 },
  { sleutel: "schild", omschrijving: "zekerheid, bescherming, garantie", categorie: "symbool", maat: 1.4 },
  { sleutel: "klok", omschrijving: "tijd, wachttijd, termijn, sneller", categorie: "symbool", maat: 0.9, zweeft: true },
  { sleutel: "kalender", omschrijving: "datum, jaar, ingangsdatum, planning", categorie: "symbool", maat: 0.7 },
  { sleutel: "vinkje", omschrijving: "goedgekeurd, klaar, akkoord", categorie: "symbool", maat: 1, zweeft: true },
  { sleutel: "waarschuwing", omschrijving: "let op, risico, uitzondering", categorie: "symbool", maat: 1, zweeft: true },
  { sleutel: "vlak", omschrijving: "neutrale vorm, als niets anders past", categorie: "symbool", maat: 1 },
];

// ── Het complete register ──────────────────────────────────────────────────

export interface Asset extends AssetMeta {
  bron: "code" | "bestand";
  teken: (k: OverheidKleuren, o?: TekenOpties) => string;
}

function bouwRegister(): Map<string, Asset> {
  const register = new Map<string, Asset>();

  for (const meta of CODE_ASSETS) {
    const teken = TEKENINGEN[meta.sleutel];
    // Metadata zonder tekening overslaan: beter geen asset dan een leeg vak.
    if (!teken) continue;
    register.set(meta.sleutel, { ...meta, bron: "code", teken });
  }

  // Bestanden winnen van code: zo kun je een handgetekende versie vervangen door
  // een betere zonder één regel code aan te raken.
  for (const bestand of BESTAND_ASSETS) {
    register.set(bestand.sleutel, {
      sleutel: bestand.sleutel,
      omschrijving: bestand.omschrijving,
      categorie: bestand.categorie as AssetCategorie,
      maat: bestand.maat,
      zweeft: bestand.zweeft,
      bron: "bestand",
      // De inhoud staat op een vak van 100×100, net als de code-tekeningen, dus
      // de composer hoeft geen onderscheid te maken.
      teken: (k) => kleurIn(bestand.inhoud, k),
    });
  }

  return register;
}

export const REGISTER = bouwRegister();

export const ASSET_SLEUTELS = [...REGISTER.keys()];

export function assetVan(sleutel: string): Asset | undefined {
  return REGISTER.get(sleutel);
}

/** Hoogte in meters; onbekend asset = middelgroot, zodat een fout niet opvalt. */
export function assetMaat(sleutel: string): number {
  return REGISTER.get(sleutel)?.maat ?? 1.2;
}

export function assetZweeft(sleutel: string): boolean {
  return REGISTER.get(sleutel)?.zweeft === true;
}

/** De keuzelijst voor de AI: sleutel plus waar het voor staat, per categorie. */
export function assetKeuzelijst(): string[] {
  return [...REGISTER.values()].map((a) => `${a.sleutel} (${a.omschrijving})`);
}
