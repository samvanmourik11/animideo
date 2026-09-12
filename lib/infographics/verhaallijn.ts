import {
  VERTELLER_ID,
  MAX_PER_SCENE,
  ACTIE_STANDAARD_SEC,
  kaleSetting,
  type DialogueLine,
  type DialogueScene,
} from "./dialogue-schema";

// DE VERHAALLIJN — wat er gebeurt, vóórdat iemand iets zegt.
//
// De tool vroeg in één keer om een compleet draaiboek: cast, plekken, camerakaders
// én zeventien zinnen. Nergens was er een stap die zei: dit is het begin, hier gaat
// het mis, hier draait het, dit is het slot. Het resultaat ("Kerst zonder Keuze",
// 12-09-2026) was geen verhaal maar een gesprek over een onderwerp: Lily gaf de
// oplossing al in regel twee, de ouders over wie het ging kwamen nooit in beeld, en
// de omslag gebeurde buiten beeld in een telefoontje.
//
// Daarom eerst de verhaallijn in vijf delen, leesbaar en aanpasbaar in de opzet.
// Het draaiboek wordt daarna BINNEN die lijn geschreven, en elke scène weet bij
// welk deel hij hoort.

export const FASEN = ["begin", "probleem", "tegenslag", "omslag", "slot"] as const;
export type Fase = (typeof FASEN)[number];

export const FASE_INFO: Record<Fase, { label: string; uitleg: string }> = {
  begin: { label: "Begin", uitleg: "Wie zijn dit, waar zijn we, en wat is er normaal." },
  probleem: { label: "Probleem", uitleg: "Er gebeurt iets waardoor het niet meer normaal is. Iemand wil iets, en iets zit in de weg." },
  tegenslag: { label: "Tegenslag", uitleg: "De eerste poging lukt niet of maakt het erger. Hier wordt nog niets opgelost." },
  omslag: { label: "Omslag", uitleg: "Het moment waarop het draait. Dat zie je gebeuren, niet buiten beeld." },
  slot: { label: "Slot", uitleg: "Hoe het afloopt, en wat er anders is dan aan het begin." },
};

export interface VerhaalDeel {
  fase: Fase;
  /** Wat er in dit deel GEBEURT, in gewone Nederlandse zinnen. Geen dialoog. */
  wat: string;
  /** Waar het zich afspeelt, kort in het Nederlands ("de keuken bij papa"). */
  plek: string;
  /**
   * Bibliotheek-id's (characterId) van wie er in beeld is.
   *
   * Bewust niet het cast-id ("char-1"): dat nummer schuift op zodra je in de
   * opzet iemand weghaalt of de volgorde verandert, en dan stond ineens het
   * verkeerde personage in een deel.
   */
  wie: string[];
  /** Eén vertellerzin die dit deel opent. Leeg = geen verteller hier. */
  verteller: string;
}

const isFase = (w: unknown): w is Fase => (FASEN as readonly string[]).includes(w as string);
const tekst = (w: unknown) => (typeof w === "string" ? w.trim() : "");

/**
 * Maakt van wat het model aanlevert een verhaallijn die gegarandeerd klopt: vijf
 * delen in de vaste volgorde, en alleen personages die echt bestaan.
 *
 * Een deel dat het model oversloeg komt er leeg in te staan in plaats van dat de
 * rest opschuift — anders wordt de tegenslag stilletjes het "probleem" en klopt
 * de verdeling van de scènes niet meer.
 */
export function normaliseerVerhaallijn(ruw: unknown, bekendeIds: string[]): VerhaalDeel[] {
  if (!Array.isArray(ruw)) return [];
  const bekend = new Set(bekendeIds);
  const items = ruw.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");

  const lijn = FASEN.map((fase, i): VerhaalDeel => {
    const bron = items.find((r) => r.fase === fase) ?? (isFase(items[i]?.fase) ? undefined : items[i]);
    const wie = (Array.isArray(bron?.wie) ? bron.wie : [])
      .map(tekst)
      .filter((id) => bekend.has(id));
    return {
      fase,
      wat: tekst(bron?.wat),
      plek: tekst(bron?.plek),
      wie: [...new Set(wie)].slice(0, MAX_PER_SCENE),
      verteller: tekst(bron?.verteller),
    };
  });

  return lijn.some((d) => d.wat) ? lijn : [];
}

/** Hoeveelste deel (1 = begin, 5 = slot), of null als het nergens op slaat. */
export function leesDeel(ruw: unknown): number | null {
  const n = typeof ruw === "number" ? ruw : Number(ruw);
  return Number.isInteger(n) && n >= 1 && n <= FASEN.length ? n : null;
}

/**
 * Deelnummers die oplopen en nergens ontbreken.
 *
 * Het model springt soms terug (1, 2, 1, 3) of laat er een leeg. Een scène van het
 * begin ná het probleem zet de verteller op de verkeerde plek en gooit de
 * verdeling in het storyboard door elkaar. Een ontbrekend of teruglopend nummer
 * neemt daarom het deel van de scène ervoor over.
 *
 * Draaiboeken zonder enig deelnummer (van vóór de verhaallijn) blijven zoals ze zijn.
 */
export function ordenDelen(scenes: DialogueScene[]): DialogueScene[] {
  if (!scenes.some((s) => leesDeel(s.deel) !== null)) return scenes;
  let huidig = 1;
  return scenes.map((s) => {
    const d = leesDeel(s.deel);
    if (d !== null && d >= huidig) huidig = d;
    return { ...s, deel: huidig };
  });
}

/**
 * Hoeveel scènes elk deel krijgt.
 *
 * Een vijfde voor het begin, een vijfde voor het slot, en de rest voor het midden —
 * waar het verhaal gebeurt. De tegenslag krijgt daarbij als eerste een extra
 * scène: dat is het deel dat een verhaal spannend maakt, en precies het deel dat
 * in de kerstvideo ontbrak.
 */
export function scenesPerDeel(aantalScenes: number): number[] {
  const n = Math.max(FASEN.length, Math.round(aantalScenes));
  const begin = Math.max(1, Math.round(n * 0.2));
  const slot = Math.max(1, Math.round(n * 0.2));
  const midden = n - begin - slot;
  const basis = Math.floor(midden / 3);
  const rest = midden - basis * 3;
  const tegenslag = basis + (rest >= 1 ? 1 : 0);
  const probleem = basis + (rest >= 2 ? 1 : 0);
  return [begin, probleem, tegenslag, basis, slot].map((x) => Math.max(1, x));
}

/**
 * De verhaallijn als tekst voor een schrijfprompt.
 *
 * Namen én cast-id's erbij: het model schrijft regels met cast-id's, maar denkt in
 * namen. Alleen id's gaf verwisselde sprekers, alleen namen gaf verzonnen id's.
 */
export function verhaallijnBlok(
  lijn: VerhaalDeel[] | null | undefined,
  cast: { id: string; characterId?: string; name: string }[],
): string {
  if (!lijn?.length) return "";
  const persoon = (id: string) => cast.find((c) => c.characterId === id || c.id === id);

  const delen = lijn.map((d, i) => {
    const info = FASE_INFO[d.fase];
    const wie = d.wie
      .map(persoon)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => `${c.name} [${c.id}]`)
      .join(", ");
    return [
      `${i + 1}. ${info.label.toUpperCase()}${d.plek ? ` — plek: ${d.plek}` : ""}${wie ? ` — in beeld: ${wie}` : ""}`,
      `   Wat er gebeurt: ${d.wat || "(nog niet ingevuld — verzin iets dat past bij de rest)"}`,
      d.verteller ? `   De verteller opent dit deel met: "${d.verteller}"` : "",
    ].filter(Boolean).join("\n");
  });

  return `DE VERHAALLIJN LIGT VAST — dit gebeurt er, in deze volgorde:\n${delen.join("\n")}`;
}

// Een telefoontje, appje of videogesprek: het moment gebeurt ergens anders dan
// waar wij kijken. In de kerstvideo was precies de omslag zo'n telefoontje.
const BUITEN_BEELD = /\b(bel(t|len|de|den)?|opgebeld|telefo\w*|app(t|en|je|jes)?|sms\w*|bericht(je)?|videobel\w*|facetime)\b/i;

/**
 * Wat er aantoonbaar mis is met een verhaallijn, in gewone taal.
 *
 * Alleen dingen die je zonder smaakoordeel kunt vaststellen. Of het verhaal
 * GOED is, beslist de gebruiker; deze lijst vangt de fouten die de kerstvideo
 * onderuit haalden en die je in een opzet makkelijk over het hoofd ziet.
 */
export function verhaalProblemen(
  lijn: VerhaalDeel[] | null | undefined,
  cast: { characterId: string; name: string }[],
): string[] {
  if (!lijn?.length) return [];
  const uit: string[] = [];

  for (const d of lijn) {
    const label = FASE_INFO[d.fase].label;
    if (!d.wat) uit.push(`${label}: er staat nog niet wat er gebeurt.`);
    else if (d.wie.length === 0) uit.push(`${label}: er is niemand in beeld.`);
  }

  const spelend = new Set(lijn.flatMap((d) => d.wie));
  for (const c of cast) {
    if (!spelend.has(c.characterId)) uit.push(`${c.name} zit in de cast maar speelt in geen enkel deel mee.`);
  }

  const omslag = lijn.find((d) => d.fase === "omslag");
  if (omslag && BUITEN_BEELD.test(omslag.wat)) {
    uit.push("Omslag: dit gebeurt via de telefoon, dus buiten beeld. Laat het gebeuren waar de kijker bij is.");
  }

  const begin = lijn.find((d) => d.fase === "begin");
  if (begin?.wat && !begin.verteller) {
    uit.push("Begin: er is geen verteller die het verhaal neerzet.");
  }

  return uit;
}

/**
 * Het beeld onder een vertellerzin: de plek, zonder dat iemand praat.
 *
 * De omgeving gaat in het Engels mee als die er is. Eerder ging alleen de
 * (Nederlandse) vertellerzin naar het beeldmodel, en dat verstaat geen Nederlands.
 */
export function vertellerBeeld(zin: string, setting?: string | null): string {
  const plek = (setting ?? "").trim();
  if (plek) return `A calm establishing view of ${plek}, with nobody speaking.`;
  const kort = zin.trim().replace(/\s+/g, " ").slice(0, 160);
  return `A calm establishing view of the place where this part of the story happens, with nobody speaking: ${kort}`;
}

/**
 * Elk deel met een vertellerzin opent ook echt met die verteller.
 *
 * In de kerstvideo stond de verteller open en sprak hij nul regels. Een regel in
 * de prompt was dus niet genoeg; dit zet hem er zelf in als het model hem
 * vergat. Doet niets als het deel al een vertellerregel heeft, dus veilig om
 * vaker te draaien.
 */
export function zorgVoorVerteller(scenes: DialogueScene[], lijn: VerhaalDeel[] | null | undefined): DialogueScene[] {
  if (!lijn?.length) return scenes;
  const uit = scenes.map((s) => ({ ...s, lines: [...s.lines] }));

  lijn.forEach((d, i) => {
    const zin = d.verteller.trim();
    if (!zin) return;
    const deel = i + 1;
    const vanDeel = uit.filter((s) => s.deel === deel);
    if (vanDeel.length === 0) return;
    if (vanDeel.some((s) => s.lines.some((l) => l.characterId === VERTELLER_ID))) return;

    const eerste = vanDeel[0];
    const regel: DialogueLine = {
      kind: "actie",
      characterId: VERTELLER_ID,
      kader: "totaal",
      text: zin,
      emotion: "",
      actie: vertellerBeeld(zin, eerste.setting),
      seconden: ACTIE_STANDAARD_SEC,
      verband: `de verteller opent dit deel van het verhaal (${FASE_INFO[d.fase].label.toLowerCase()})`,
    };
    eerste.lines.unshift(regel);
  });

  return uit;
}

/**
 * Opeenvolgende scènes op dezelfde plek, in hetzelfde licht en hetzelfde deel,
 * worden één scène.
 *
 * De kerstvideo had vijftien scènes voor zeventien regels: bijna elke zin een
 * eigen scène, en dus elf keer een nieuw basisbeeld van dezelfde woonkamer. Dat
 * kost een credit per keer en de kamer verschuift telkens net. Binnen één scène
 * wisselt het beeld nog steeds per regel via het camerakader.
 *
 * Nooit samenvoegen als er meer mensen in beeld zouden komen dan een scène aankan,
 * en nooit als er al een basisbeeld is — dan zou er een betaald beeld wegvallen.
 */
export function voegGelijkePlekSamen(scenes: DialogueScene[]): DialogueScene[] {
  const uit: DialogueScene[] = [];
  const spelers = (lines: DialogueLine[]) =>
    new Set(lines.map((l) => l.characterId).filter((id) => id && id !== VERTELLER_ID));

  for (const s of scenes) {
    const vorige = uit[uit.length - 1];
    const past =
      vorige &&
      !vorige.twoShotUrl && !s.twoShotUrl &&
      kaleSetting(vorige.setting) === kaleSetting(s.setting) &&
      (vorige.licht ?? null) === (s.licht ?? null) &&
      (vorige.deel ?? null) === (s.deel ?? null) &&
      spelers([...vorige.lines, ...s.lines]).size <= MAX_PER_SCENE;

    if (past) vorige.lines = [...vorige.lines, ...s.lines];
    else uit.push({ ...s, lines: [...s.lines] });
  }
  return uit;
}
