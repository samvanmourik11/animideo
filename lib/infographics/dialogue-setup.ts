import { MAX_CAST, type CastPosition, type DialogueCastMember } from "./dialogue-schema";
import type { VerhaalDeel } from "./verhaallijn";

/**
 * DE OPZET — alle dimensies van de video, op één plek, vóór er iets geschreven is.
 *
 * Hiervoor had de voordeur precies twee knoppen: lengte en een tekstvak. Alle
 * andere besturing (cast, rollen, stemmen, tekenstijl, toon) stond in stap 2 en
 * dus ACHTER het genereren — je kon alleen nog corrigeren op een script dat er al
 * omheen geschreven was. Wie in stap 2 een ander personage koos, kreeg een
 * gesprek dat voor iemand anders bedoeld was.
 *
 * De opzet draait dat om. De assistent doet een voorstel voor élke dimensie, jij
 * past aan wat niet klopt, en pas daarna wordt het draaiboek geschreven.
 */
export interface DialogueSetup {
  /** Werktitel. Mag de assistent voorstellen. */
  title: string;
  /** Waar het gesprek over gaat — de kop boven de brontekst. */
  topic: string;
  /** De brontekst zelf: wat de gebruiker typte of plakte. Leidend voor de feiten. */
  text: string;

  // ── Verhaal ──
  /**
   * De kernboodschap waar het gesprek naartoe werkt, en het omslagpunt waar de
   * scepticus omgaat.
   *
   * Deze twee stonden al in DialogueSpec en stuurden de generatie mee, maar
   * kwamen in geen enkel scherm voor. Een verhaal zonder benoemde kern dwaalt af;
   * een verhaal zonder wending is twee mensen die het meteen eens zijn.
   */
  kern: string;
  wending: string;
  /**
   * Wat er gebeurt, in vijf delen van begin tot slot — vóór er één zin dialoog is.
   * Zie verhaallijn.ts. Optioneel zodat een opzet van vóór deze stap blijft werken.
   */
  verhaallijn?: VerhaalDeel[];

  // ── Toon ──
  /** "zakelijk" | "speels" | "energiek" — zie buildDialoguePrompt. */
  tone: string;
  /** Bewuste invalshoek ("vanuit de twijfel van de klant"). Leeg = vrij. */
  angle: string;

  // ── Taal en woordkeus ──
  language: string;
  /** Merknamen die exact zo moeten blijven staan. */
  keepTerms: string[];
  /** Namen en claims die nergens mogen vallen. */
  avoidTerms: string[];

  // ── Beeld ──
  format: "16:9" | "9:16";
  styleId: string;
  /** Regie die voor élk beeld geldt (huisstijlkleuren, decor, kleding). */
  illustrationBrief: string;

  // ── Cast ──
  cast: DialogueCastMember[];

  // ── Omvang ──
  targetSeconds: number;
}

/**
 * Eén personage zoals de gebruiker het vóór de opzet heeft vastgelegd.
 *
 * Dit is het halve antwoord op "ik wil de karakters uit mijn bibliotheek vooraf
 * kunnen kiezen en er rollen aan toewijzen": wat hier in staat, staat vast.
 */
export interface VastCastLid {
  characterId: string;
  name: string;
  portraitUrl: string;
  /** Leeg = de assistent mag een rol voorstellen. */
  role?: string | null;
  /** Uit de bibliotheek (characters.description). */
  appearance?: string | null;
}

/** Velden die de assistent mag invullen zolang de gebruiker ze leeg liet. */
const AANVULBAAR = ["role", "wil", "spraak", "leeftijd", "appearance"] as const;

/**
 * Het voorstel van de assistent samenvoegen met wat de gebruiker al vastlegde.
 *
 * De regel is: **jouw keuze wint, altijd.** Een personage dat jij uit je
 * bibliotheek koos komt er gegarandeerd in, met jouw rol; de assistent mag
 * hooguit de velden invullen die jij leeg liet, en aanvullen tot het gewenste
 * aantal als jij er minder koos dan een gesprek nodig heeft.
 *
 * Zonder deze voorrang zou een voorstel je keuze stilzwijgend overschrijven —
 * en dan is "vooraf kiezen" een illusie: je typt een rol, drukt op uitwerken, en
 * er staat iets anders.
 */
export function mergeCast(
  vast: VastCastLid[],
  voorstel: DialogueCastMember[],
): DialogueCastMember[] {
  const uit: DialogueCastMember[] = [];

  vast.slice(0, MAX_CAST).forEach((v, i) => {
    // Het voorstel bij dit personage zoeken: eerst op bibliotheek-id (hard), dan
    // op naam (het model verwijst er soms zo naar).
    const bij =
      voorstel.find((p) => p.characterId && p.characterId === v.characterId) ??
      voorstel.find((p) => p.name.trim().toLowerCase() === v.name.trim().toLowerCase());

    const lid: DialogueCastMember = {
      id: `char-${i + 1}`,
      characterId: v.characterId,
      name: v.name,
      role: (v.role ?? "").trim(),
      voice: bij?.voice ?? "",
      portraitUrl: v.portraitUrl,
      position: posities(i),
      appearance: (v.appearance ?? "").trim() || null,
    };

    // Alleen aanvullen wat leeg is. Wat de gebruiker typte blijft staan.
    for (const veld of AANVULBAAR) {
      const eigen = (lid[veld] ?? "") as string;
      if (eigen.trim()) continue;
      const van = (bij?.[veld] ?? "") as string | null;
      if (van && van.trim()) (lid[veld] as string | null) = van.trim();
    }
    uit.push(lid);
  });

  // De assistent mag aanvullen tot het gewenste aantal, maar nooit iemand
  // toevoegen die de gebruiker al koos.
  const bezet = new Set(uit.map((c) => c.characterId));
  for (const p of voorstel) {
    if (uit.length >= MAX_CAST) break;
    if (!p.portraitUrl || bezet.has(p.characterId)) continue;
    bezet.add(p.characterId);
    uit.push({ ...p, id: `char-${uit.length + 1}`, position: posities(uit.length) });
  }

  return hersteldeStemmen(uit);
}

/** Links, rechts, en een derde in het midden. */
function posities(i: number): CastPosition {
  return i === 0 ? "left" : i === 1 ? "right" : "center";
}

/**
 * Twee personages met dezelfde stem klinken als één persoon die in zichzelf
 * praat. Dubbele stemmen worden hier stilletjes uit elkaar getrokken; de
 * gebruiker kan ze daarna alsnog zelf kiezen in de opzet.
 */
function hersteldeStemmen(cast: DialogueCastMember[]): DialogueCastMember[] {
  const gebruikt = new Set<string>();
  return cast.map((c) => {
    const stem = (c.voice ?? "").trim();
    if (stem && !gebruikt.has(stem)) {
      gebruikt.add(stem);
      return { ...c, voice: stem };
    }
    return { ...c, voice: "" };
  });
}

/**
 * Is deze opzet klaar om een draaiboek van te schrijven?
 *
 * Bewust streng op de cast en mild op de rest: zonder twee personages met een
 * portret is er geen gesprek en geen beeld, terwijl een lege kern hooguit een
 * zwakker verhaal geeft. De knop blokkeren op smaakvelden zou de opzet in een
 * verplicht formulier veranderen — precies wat hij niet moet zijn.
 */
export function opzetKlaar(setup: DialogueSetup): { klaar: boolean; reden: string | null } {
  if (!setup.text.trim()) return { klaar: false, reden: "Beschrijf eerst waar de video over gaat." };
  const metPortret = setup.cast.filter((c) => c.portraitUrl);
  if (metPortret.length < 2) {
    return { klaar: false, reden: "Kies minstens twee personages met een afbeelding." };
  }
  if (setup.cast.some((c) => !c.voice)) {
    return { klaar: false, reden: "Geef elk personage een stem." };
  }
  return { klaar: true, reden: null };
}
