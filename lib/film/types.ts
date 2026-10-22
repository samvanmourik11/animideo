// FILMSTUDIO — een film van een paar minuten, samen met de Regisseur gebouwd. Client-veilig.
//
// Hoe het loopt: verhaal of eigen script → de Regisseur schrijft scènes uit (shots met wat
// we zien, wie er in beeld is, wie wat zegt) → personages krijgen een portret en een vaste
// stem → per scène: beelden, beweging (of lipsync als er iemand praat), stemmen, montage →
// de klant keurt de scène goed of geeft feedback (dan worden alleen de gewijzigde shots
// opnieuw gemaakt) → alle goedgekeurde scènes samen worden de film.

/** Een personage of terugkerend wezen/voorwerp, met het beeld dat in elk shot terugkomt. */
export interface CastLid {
  naam: string;
  soort: "personage" | "wezen";
  /** Nederlands, voor de klant. */
  rol: string;
  /** Engels: leeftijd en geslacht eerst, dan gezicht, haar, bouw, kostuum. */
  uiterlijk: string;
  geslacht?: "man" | "vrouw";
  /** ElevenLabs-voice-id uit de stemmenbibliotheek (of "eigen:<id>"): elk personage één stem. */
  stem?: string;
  /** Portret/referentiebeeld (publieke url). */
  portret?: string;
}

export interface Shot {
  /** Vast binnen een scène ("s1", "s2"…): zo weten we bij feedback welk shot hetzelfde bleef. */
  id: string;
  /** Engels: één filmbeeld — setting, compositie, lens, licht. */
  beeld: string;
  /** Engels: camerabeweging + actie (alleen voor shots zonder dialoog). */
  beweging: string;
  /** Namen uit de cast die in beeld zijn. */
  inBeeld: string[];
  /** Iemand praat in beeld: altijd met lipsync (Sam, 22-10-2026). */
  dialoog?: { wie: string; tekst: string };
  /** De verteller spreekt over dit shot (en loopt door over de volgende). */
  verteller?: string;
  /** Lengte van een stil shot, 2-5 s. Een dialoogshot duurt zo lang als de zin. */
  duur: number;
}

export type SceneStatus = "concept" | "bezig" | "ter_keuring" | "goedgekeurd" | "feedback" | "mislukt";

export interface Scene {
  nummer: number;
  titel: string;
  /** Nederlands, wat er gebeurt (voor de klant en de Regisseur). */
  samenvatting: string;
  /** Engels: plek en licht, zodat alle shots in dezelfde wereld staan. */
  plek: string;
  /** Muziekcategorie uit de bibliotheek, of leeg voor geen muziek. */
  muziek?: string;
  shots: Shot[];
  status: SceneStatus;
  /** De laatst gemaakte versie (creatie maker 'film-scene'). */
  creatieId?: string;
  video?: string;
  feedback?: string;
  /** Per shot-id wat er al gemaakt is, met de vingerafdruk van het shot toen. */
  gemaakt?: Record<string, ShotResultaat>;
}

export interface ShotResultaat {
  vingerafdruk: string;
  beeld?: string;
  clip?: string;
}

export interface Film {
  titel: string;
  logline: string;
  /** Engels: de vaste filmlook (kleur, licht, lens) voor elk beeld. */
  stijl: string;
  formaat: "16:9" | "9:16";
  /** Taal van dialoog en verteller. */
  taal: "nl" | "en";
  vertellerStem?: string;
  cast: CastLid[];
  scenes: Scene[];
  /** De gemonteerde film (creatie maker 'film'). */
  eindCreatieId?: string;
}

export const LEGE_FILM: Film = { titel: "Nieuwe film", logline: "", stijl: "", formaat: "16:9", taal: "nl", cast: [], scenes: [] };

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  concept: "Script",
  bezig: "Wordt gemaakt",
  ter_keuring: "Ter keuring",
  goedgekeurd: "Goedgekeurd",
  feedback: "Feedback",
  mislukt: "Mislukt",
};

/** Een clip is 5 s; een stil shot gebruikt daar een stuk van. */
export const FILM_CLIP_SEC = 5;

// ── Prijs ────────────────────────────────────────────────────────────────
// Sam (22-10-2026): "evenredig aan mijn kosten; ze betalen €49 voor 500 credits, ik wil
// minimaal 40% marge." Dus: inkoop in dollars (1 dollar = 1 euro gerekend, de koers ligt
// lager: extra marge), gedeeld door 0,6, gedeeld door de prijs van een credit.

/** Inkoop per onderdeel in dollars (fal-tarieven, oktober 2026). */
export const FILM_KOSTEN_USD = {
  /** Nano Banana Pro 2K, één filmbeeld. */
  beeld: 0.15,
  /** Kling 2.5 turbo pro, 5 s beweging. */
  beweging: 0.35,
  /** Kling AI Avatar v2, per seconde lipsync. */
  lipsyncPerSec: 0.056,
  /** ElevenLabs v3, per 1.000 tekens. */
  stemPer1000: 0.1,
  /** De Regisseur (Claude) die de scène uitschrijft en bijstuurt, geschat per scène. */
  regiePerScene: 0.1,
} as const;
export const CREDIT_EUR = 49 / 500;
export const MARGE = 0.4;

export function creditsVoorKosten(usd: number): number {
  return usd <= 0 ? 0 : Math.ceil(usd / (1 - MARGE) / CREDIT_EUR);
}

/** Geschatte spreekduur van een zin: ~2,6 woorden per seconde, plus wat lucht. */
export function spreekSec(tekst: string): number {
  return Math.max(1.5, tekst.trim().split(/\s+/).filter(Boolean).length / 2.6 + 0.6);
}

/** Inkoop van één shot (opnieuw) maken. */
export function shotKosten(s: Shot): number {
  const k = FILM_KOSTEN_USD;
  if (s.dialoog) return k.beeld + Math.ceil(spreekSec(s.dialoog.tekst)) * k.lipsyncPerSec + (s.dialoog.tekst.length / 1000) * k.stemPer1000;
  return k.beeld + k.beweging;
}

/** Wat een (nieuwe versie van een) scène kost: alleen de shots die opnieuw moeten. */
export function sceneCredits(scene: Scene, opnieuw: Shot[]): number {
  const k = FILM_KOSTEN_USD;
  const verteller = scene.shots.map((s) => s.verteller ?? "").join(" ").length;
  return creditsVoorKosten(opnieuw.reduce((s, x) => s + shotKosten(x), 0) + (verteller / 1000) * k.stemPer1000 + k.regiePerScene);
}

/**
 * De vingerafdruk van een shot: verandert er iets aan wat we zien of horen, dan moet het
 * opnieuw. Cast-uiterlijk en filmstijl tellen mee, de verteller niet (die zit los).
 */
export function vingerafdruk(s: Shot, film: Pick<Film, "stijl" | "cast">, plek: string): string {
  const cast = s.inBeeld.map((n) => film.cast.find((c) => c.naam === n)).map((c) => (c ? `${c.naam}:${c.uiterlijk}:${c.stem ?? ""}:${c.portret ?? ""}` : ""));
  const tekst = JSON.stringify([s.beeld, s.beweging, s.dialoog ?? null, s.dialoog ? 0 : s.duur, plek, film.stijl, cast]);
  let h = 2166136261;
  for (let i = 0; i < tekst.length; i++) h = Math.imul(h ^ tekst.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Welke shots van een scène opnieuw gemaakt moeten worden. */
export function teMaken(scene: Scene, film: Pick<Film, "stijl" | "cast">): Shot[] {
  return scene.shots.filter((s) => {
    const r = scene.gemaakt?.[s.id];
    return !r?.clip || r.vingerafdruk !== vingerafdruk(s, film, scene.plek);
  });
}

export type SceneStap = "beelden" | "clips" | "monteren";
export const SCENE_STAP_LABEL: Record<SceneStap, string> = {
  beelden: "Stap 1 van 3: filmbeelden en stemmen…",
  clips: "Stap 2 van 3: beweging en lipsync…",
  monteren: "Stap 3 van 3: monteren…",
};
