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
// én zeventien zinnen. Nergens was er een stap die zei wat er gebeurt. Het
// resultaat ("Kerst zonder Keuze", 12-09-2026) was geen verhaal maar een gesprek
// over een onderwerp.
//
// Er zijn TWEE manieren om aan een verhaal te komen, en ze vragen het tegenovergestelde:
//
//   verzinnen — de gebruiker geeft een idee ("kinderen moeten met kerst kiezen
//               tussen papa en mama"). Dan bedenken wij het verhaal, in vijf vaste
//               delen van begin tot slot, met een tegenslag en een omslag.
//
//   volgen    — de gebruiker geeft een uitgewerkt verhaal. Dan verzinnen we NIETS:
//               elk moment uit zijn tekst wordt een deel, in zijn volgorde. De
//               eerste versie kende alleen "verzinnen" en perste "Tyrell, Lilly en
//               de Wonderwagen" in vijf delen: er kwam een verzonnen tegenslag bij
//               ("de wagen werkt niet") en de hele reis langs zeven plekken in
//               Paramaribo werd één zin in het slot.

export const FASEN = ["begin", "probleem", "tegenslag", "omslag", "slot"] as const;
export type Fase = (typeof FASEN)[number];

export const FASE_INFO: Record<Fase, { label: string; uitleg: string }> = {
  begin: { label: "Begin", uitleg: "Wie zijn dit, waar zijn we, en wat is er normaal." },
  probleem: { label: "Probleem", uitleg: "Er gebeurt iets waardoor het niet meer normaal is. Iemand wil iets, en iets zit in de weg." },
  tegenslag: { label: "Tegenslag", uitleg: "De eerste poging lukt niet of maakt het erger. Hier wordt nog niets opgelost." },
  omslag: { label: "Omslag", uitleg: "Het moment waarop het draait. Dat zie je gebeuren, niet buiten beeld." },
  slot: { label: "Slot", uitleg: "Hoe het afloopt, en wat er anders is dan aan het begin." },
};

export const VERHAAL_MODI = ["volgen", "verzinnen"] as const;
export type VerhaalModus = (typeof VERHAAL_MODI)[number];

export const isVerhaalModus = (w: unknown): w is VerhaalModus =>
  (VERHAAL_MODI as readonly string[]).includes(w as string);

/** Hooguit zoveel momenten in een gevolgd verhaal. Meer past niet in vijf minuten video. */
export const MAX_DELEN = 20;

/**
 * Seconden die één moment minstens nodig heeft: een zin van de verteller en een of
 * twee beelden. Daaronder flitst het verhaal voorbij.
 */
export const SECONDEN_PER_MOMENT = 9;

/** Een zin die in de tekst van de gebruiker letterlijk gezegd wordt. */
export interface Citaat {
  /** Bibliotheek-id (characterId) van wie hem zegt. */
  wie: string;
  /** De zin, precies zoals hij in de tekst staat. */
  tekst: string;
}

export interface VerhaalDeel {
  /** Alleen bij een verzonnen verhaal: welk van de vijf vaste delen. Bij een gevolgd verhaal null. */
  fase: Fase | null;
  /** Korte naam van dit moment ("Fort Zeelandia"). Vooral bij een gevolgd verhaal. */
  titel: string;
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
  /**
   * Alleen bij een gevolgd verhaal: de zinnen die in dit moment letterlijk in de
   * tekst staan, met wie ze zegt. Zie zorgVoorCitaten.
   */
  citaten?: Citaat[];
}

/** Tekst zonder hoofdletters, leestekens en dubbele spaties — om zinnen te vergelijken. */
export const kaalTekst = (t?: string | null) =>
  (t ?? "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();

const isFase = (w: unknown): w is Fase => (FASEN as readonly string[]).includes(w as string);
const tekst = (w: unknown) => (typeof w === "string" ? w.trim() : "");

/** Hoe een deel heet in het scherm: zijn titel, zijn vaste deel, of gewoon zijn nummer. */
export function deelLabel(d: VerhaalDeel | null | undefined, i: number): string {
  if (d?.titel) return d.titel;
  if (d?.fase) return FASE_INFO[d.fase].label;
  return `Moment ${i + 1}`;
}

/**
 * Is dit een uitgewerkt verhaal (volgen) of een idee (verzinnen)?
 *
 * Bewust simpel en zonder model: een idee is een paar zinnen, een verhaal heeft
 * lengte, alinea's of dialoog. De gebruiker ziet in de opzet welke keuze er
 * gemaakt is en kan met één klik wisselen, dus een verkeerde gok kost niets.
 */
export function isUitgewerktVerhaal(invoer: string): boolean {
  const woorden = invoer.trim().split(/\s+/).filter(Boolean).length;
  if (woorden >= 120) return true;
  const citaten = (invoer.match(/["“”„]/g) ?? []).length / 2;
  const alineas = invoer.split(/\n\s*\n/).filter((a) => a.trim()).length;
  return woorden >= 60 && (citaten >= 2 || alineas >= 4);
}

/**
 * Maakt van wat het model aanlevert een verhaallijn die gegarandeerd klopt.
 *
 * Een VERZONNEN verhaal (de delen hebben een fase) krijgt vijf delen in de vaste
 * volgorde; een overgeslagen deel komt er leeg in te staan in plaats van dat de
 * rest opschuift. Een GEVOLGD verhaal houdt zoveel momenten als het heeft, in de
 * volgorde waarin het model ze gaf. In beide gevallen overleven alleen
 * personages die echt bestaan.
 */
export function normaliseerVerhaallijn(ruw: unknown, bekendeIds: string[]): VerhaalDeel[] {
  if (!Array.isArray(ruw)) return [];
  const bekend = new Set(bekendeIds);
  const items = ruw.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");

  const maakDeel = (bron: Record<string, unknown> | undefined, fase: Fase | null): VerhaalDeel => {
    const citaten = (Array.isArray(bron?.citaten) ? bron.citaten : [])
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({ wie: tekst(c.wie), tekst: tekst(c.tekst) }))
      .filter((c) => c.tekst && bekend.has(c.wie));
    // Wie iets zegt, staat in beeld. Anders tekent het basisbeeld een scène zonder
    // de persoon die er straks praat.
    const wie = [
      ...(Array.isArray(bron?.wie) ? bron.wie : []).map(tekst).filter((id) => bekend.has(id)),
      ...citaten.map((c) => c.wie),
    ];
    return {
      fase,
      titel: tekst(bron?.titel),
      wat: tekst(bron?.wat),
      plek: tekst(bron?.plek),
      wie: [...new Set(wie)].slice(0, MAX_PER_SCENE),
      verteller: tekst(bron?.verteller),
      citaten,
    };
  };

  if (items.some((r) => isFase(r.fase))) {
    const lijn = FASEN.map((fase, i) =>
      maakDeel(items.find((r) => r.fase === fase) ?? (isFase(items[i]?.fase) ? undefined : items[i]), fase),
    );
    return lijn.some((d) => d.wat) ? lijn : [];
  }

  return items.map((r) => maakDeel(r, null)).filter((d) => d.wat).slice(0, MAX_DELEN);
}

/** Hoeveelste deel (1 = eerste), of null als het nergens op slaat. */
export function leesDeel(ruw: unknown, max: number = MAX_DELEN): number | null {
  const n = typeof ruw === "number" ? ruw : Number(ruw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
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
 * GEWOGEN (verzonnen verhaal, vijf delen): een vijfde voor het begin, een vijfde
 * voor het slot, en de rest voor het midden — waar het verhaal gebeurt. De
 * tegenslag krijgt als eerste een extra scène: dat deel maakt een verhaal
 * spannend, en precies dat ontbrak in de kerstvideo.
 *
 * GELIJK (gevolgd verhaal): elk moment evenveel, en wat overblijft naar de
 * momenten in het midden. Bij een reis langs zeven plekken is geen enkele plek
 * belangrijker dan de andere.
 */
export function scenesPerDeel(aantalScenes: number, aantalDelen: number = FASEN.length, gewogen = true): number[] {
  const delen = Math.max(1, Math.round(aantalDelen));
  const n = Math.max(delen, Math.round(aantalScenes));

  if (!gewogen || delen !== FASEN.length) {
    const basis = Math.floor(n / delen);
    const rest = n - basis * delen;
    const uit: number[] = Array(delen).fill(basis);
    const midden = (delen - 1) / 2;
    const volgorde = [...Array(delen).keys()].sort((a, b) => Math.abs(a - midden) - Math.abs(b - midden));
    for (let k = 0; k < rest; k++) uit[volgorde[k]]++;
    return uit;
  }

  const begin = Math.max(1, Math.round(n * 0.2));
  const slot = Math.max(1, Math.round(n * 0.2));
  const middenDeel = n - begin - slot;
  const basis = Math.floor(middenDeel / 3);
  const rest = middenDeel - basis * 3;
  const tegenslag = basis + (rest >= 1 ? 1 : 0);
  const probleem = basis + (rest >= 2 ? 1 : 0);
  return [begin, probleem, tegenslag, basis, slot].map((x) => Math.max(1, x));
}

/** De kortste lengte uit de keuzes waarin elk moment genoeg tijd krijgt. */
export function passendeLengte(aantalDelen: number, keuzes: readonly number[]): number {
  const nodig = aantalDelen * SECONDEN_PER_MOMENT;
  return keuzes.find((k) => k >= nodig) ?? keuzes[keuzes.length - 1];
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
    const wie = d.wie
      .map(persoon)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => `${c.name} [${c.id}]`)
      .join(", ");
    return [
      `${i + 1}. ${deelLabel(d, i).toUpperCase()}${d.plek ? ` — plek: ${d.plek}` : ""}${wie ? ` — in beeld: ${wie}` : ""}`,
      `   Wat er gebeurt: ${d.wat || "(nog niet ingevuld — verzin iets dat past bij de rest)"}`,
      d.verteller ? `   De verteller opent dit deel met: "${d.verteller}"` : "",
      ...(d.citaten ?? []).map((c) => {
        const p = persoon(c.wie);
        return `   ${p ? `${p.name} [${p.id}]` : "?"} zegt LETTERLIJK: "${c.tekst}"`;
      }),
    ].filter(Boolean).join("\n");
  });

  return `DE VERHAALLIJN LIGT VAST — dit gebeurt er, in deze volgorde:\n${delen.join("\n")}`;
}

// Een telefoontje, appje of videogesprek: het moment gebeurt ergens anders dan
// waar wij kijken. In de kerstvideo was precies de omslag zo'n telefoontje.
const BUITEN_BEELD = /\b(bel(t|len|de|den)?|opgebeld|telefo\w*|app(t|en|je|jes)?|sms\w*|bericht(je)?|videobel\w*|facetime)\b/i;

// Wie er in het verhaal voorkomt, moet ook in de cast staan. In de eerste proef
// met de verhaallijn zaten "hun ouders" in het slot aan tafel, terwijl er geen papa
// of mama in de cast stond: dan tekent het beeldmodel willekeurige volwassenen, of
// niemand. "Ouders" telt als papa én mama: in een verhaal over gescheiden ouders
// moeten ze allebei in beeld kunnen.
const GENOEMDE_ROLLEN: { woord: RegExp; label: string; past: RegExp }[] = [
  { woord: /\b(papa|vader|ouders)\b/i, label: "Papa", past: /\b(papa|vader|ouder)\b/i },
  { woord: /\b(mama|moeder|ouders)\b/i, label: "Mama", past: /\b(mama|moeder|ouder)\b/i },
  { woord: /\b(opa|grootvader|grootouders)\b/i, label: "Opa", past: /\b(opa|grootvader)\b/i },
  { woord: /\b(oma|grootmoeder|grootouders)\b/i, label: "Oma", past: /\b(oma|grootmoeder)\b/i },
  { woord: /\b(juf|meester|leraar|lerares)\b/i, label: "De juf of meester", past: /\b(juf|meester|leraar|lerares)\b/i },
];

/**
 * Rollen die in een tekst genoemd worden maar door niemand in de cast gespeeld.
 *
 * Een personage telt als die rol als zijn naam of zijn rol erop past: "Papa" of
 * "Ousmane, de vader van Tyrrell" allebei. "De oudere broer" telt niet als ouder.
 */
export function ontbrekendeRollen(
  invoer: string,
  cast: { name: string; role?: string | null }[],
): string[] {
  const castTekst = cast.map((c) => `${c.name} ${c.role ?? ""}`).join(" | ");
  return GENOEMDE_ROLLEN.filter((r) => r.woord.test(invoer) && !r.past.test(castTekst)).map((r) => r.label);
}

// Een lidwoord hoort niet bij de naam: "De Waterkant" en "de Waterkant" zijn
// dezelfde plek, en een verhaallijn die gewoon "Waterkant" schrijft ook.
const LIDWOORD = /^(de|het|een)\s+/i;

/**
 * Eigennamen uit een tekst: plekken, gebouwen, landen, personen.
 *
 * Een reeks woorden met een hoofdletter, niet aan het begin van een zin. Geen
 * perfecte herkenning, maar in een Nederlandse tekst staan hoofdletters midden in
 * een zin vrijwel alleen bij namen — en juist die namen (Fort Zeelandia, de
 * Palmentuin) vielen uit de eerste verhaallijn van de Wonderwagen.
 */
export function namenUitTekst(invoer: string): string[] {
  const schoon = invoer.replace(/[*_#>`]/g, " ");
  const namen = new Set<string>();
  const reeks = /(^|[^\p{L}\p{N}'-])(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)*)/gu;

  for (const m of schoon.matchAll(reeks)) {
    const start = (m.index ?? 0) + m[1].length;
    const woorden = m[2].split(/\s+/);
    // Begin van een zin, een alinea of een citaat: dat eerste woord heeft zijn
    // hoofdletter om een andere reden. De woorden erna kunnen wél een naam zijn
    // ("Bij De Waterkant").
    const ervoor = schoon.slice(0, start);
    if (/(^|[.!?:]|\n\s*\n|\n)[\s"“”„'‘’(]*$/u.test(ervoor)) woorden.shift();
    const naam = woorden.join(" ").replace(LIDWOORD, "").trim();
    if (naam.length >= 4) namen.add(naam);
  }
  return [...namen];
}

/**
 * Namen uit de tekst van de gebruiker die nergens in de verhaallijn terugkomen.
 *
 * Losjes vergeleken: elk woord hoeft er alleen met zijn eerste letters in te staan,
 * zodat "Presidentieel Paleis" ook "het presidentiële paleis" vindt.
 */
export function ontbrekendeNamen(bron: string, lijn: VerhaalDeel[] | null | undefined): string[] {
  if (!lijn?.length) return [];
  const hooiberg = lijn.map((d) => `${d.titel} ${d.wat} ${d.plek} ${d.verteller}`).join(" ").toLowerCase();
  return namenUitTekst(bron).filter((naam) =>
    !naam
      .toLowerCase()
      .split(/[\s-]+/)
      .filter((w) => w.length >= 4)
      .every((w) => hooiberg.includes(w.slice(0, 5))),
  );
}

/**
 * Wat er aantoonbaar mis is met een verhaallijn, in gewone taal.
 *
 * Alleen dingen die je zonder smaakoordeel kunt vaststellen. Of het verhaal
 * GOED is, beslist de gebruiker; deze lijst vangt de fouten die de kerstvideo en
 * de Wonderwagen onderuit haalden en die je in een opzet makkelijk mist.
 *
 * `bron` is de tekst van de gebruiker, alleen mee te geven bij een gevolgd
 * verhaal: dan hoort alles wat erin staat ook in de verhaallijn.
 */
export function verhaalProblemen(
  lijn: VerhaalDeel[] | null | undefined,
  cast: { characterId: string; name: string; role?: string | null }[],
  bron?: string | null,
): string[] {
  if (!lijn?.length) return [];
  const uit: string[] = [];

  lijn.forEach((d, i) => {
    const label = deelLabel(d, i);
    if (!d.wat) uit.push(`${label}: er staat nog niet wat er gebeurt.`);
    else if (d.wie.length === 0) uit.push(`${label}: er is niemand in beeld.`);
  });

  const spelend = new Set(lijn.flatMap((d) => d.wie));
  for (const c of cast) {
    if (!spelend.has(c.characterId)) uit.push(`${c.name} zit in de cast maar speelt in geen enkel deel mee.`);
  }

  for (const rol of ontbrekendeRollen(lijn.map((d) => d.wat).join(" "), cast)) {
    uit.push(
      `${rol} komt in het verhaal voor, maar niemand in de cast speelt die rol, dus die kan niet in beeld. ` +
      `Voeg bij de rolverdeling iemand toe en geef die de rol "${rol.toLowerCase()}".`
    );
  }

  // In elk deel, niet alleen de omslag. In een proef "belde papa onverwacht op"
  // in de tegenslag, terwijl hij als in beeld stond in mama's keuken: dan tekent
  // het beeldmodel hem gewoon in de verkeerde kamer.
  lijn.forEach((d, i) => {
    if (BUITEN_BEELD.test(d.wat)) {
      uit.push(`${deelLabel(d, i)}: dit gebeurt via de telefoon, dus buiten beeld. Laat het gebeuren waar de kijker bij is.`);
    }
  });

  if (lijn[0]?.wat && !lijn[0].verteller) {
    uit.push(`${deelLabel(lijn[0], 0)}: er is geen verteller die het verhaal neerzet.`);
  }

  if (bron?.trim()) {
    const weg = ontbrekendeNamen(bron, lijn);
    if (weg.length) uit.push(`Uit je verhaal ontbreekt: ${weg.join(", ")}.`);
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
    // Alleen een verteller die iets ZEGT telt. Bij de Wonderwagen stonden er bij elke
    // plek in Paramaribo vertellerbeelden zonder tekst; die telden als "er is al een
    // verteller", waardoor de vertellerzin nergens terechtkwam en zeven plekken
    // alleen uit muziek bestonden.
    if (vanDeel.some((s) => s.lines.some((l) => l.characterId === VERTELLER_ID && kaalTekst(l.text)))) return;

    // Het model zet de vertellerzin soms al neer, maar in de mond van een
    // personage. Bij de Wonderwagen zei Tyrell in elke scène "Hun eerste stop was
    // Fort Zeelandia", en kwam de verteller er daarna nog eens met dezelfde zin bij:
    // twaalf keer dubbel, veertig seconden te lang. Dan wordt DIE regel de verteller.
    for (const s of vanDeel) {
      const j = s.lines.findIndex((l) => kaalTekst(l.text) === kaalTekst(zin));
      if (j < 0) continue;
      const l = s.lines[j];
      s.lines[j] = {
        ...l,
        kind: "actie",
        characterId: VERTELLER_ID,
        kader: "totaal",
        actie: (l.actie ?? "").trim() || vertellerBeeld(zin, s.setting),
        seconden: l.seconden ?? ACTIE_STANDAARD_SEC,
      };
      return;
    }

    // Een vertellerbeeld zonder tekst is al het moment van de verteller, alleen
    // zonder zin. Die zin hoort daar, in plaats van een tweede beeld ervoor.
    for (const s of vanDeel) {
      const j = s.lines.findIndex((l) => l.characterId === VERTELLER_ID && !kaalTekst(l.text));
      if (j < 0) continue;
      s.lines[j] = { ...s.lines[j], text: zin, kader: s.lines[j].kader ?? "totaal" };
      return;
    }

    const eerste = vanDeel[0];
    const regel: DialogueLine = {
      kind: "actie",
      characterId: VERTELLER_ID,
      kader: "totaal",
      text: zin,
      emotion: "",
      actie: vertellerBeeld(zin, eerste.setting),
      seconden: ACTIE_STANDAARD_SEC,
      verband: `de verteller opent dit deel van het verhaal (${deelLabel(d, i).toLowerCase()})`,
    };
    eerste.lines.unshift(regel);
  });

  // Vangnet voor draaiboeken die al een verteller hadden én dezelfde zin nog eens
  // in de mond van een personage: die tweede keer valt weg.
  return uit.map((s) => {
    const verteld = new Set(s.lines.filter((l) => l.characterId === VERTELLER_ID).map((l) => kaalTekst(l.text)).filter(Boolean));
    if (verteld.size === 0) return s;
    const lines = s.lines.filter((l) => l.characterId === VERTELLER_ID || !kaalTekst(l.text) || !verteld.has(kaalTekst(l.text)));
    return lines.length ? { ...s, lines } : s;
  });
}

/**
 * Een zin in de derde persoon hoort bij de verteller, niet bij een personage.
 *
 * In de Wonderwagen zei Tyrell "De kinderen keken elkaar nieuwsgierig aan, benieuwd
 * naar oma's geheim" — over zichzelf, in de verleden tijd, terwijl Lilly niet eens in
 * beeld stond. Zo'n zin herken je aan een personage dat zijn eigen naam noemt, of
 * aan "de kinderen" aan het begin van een zin. Een naam als aanspreking van iemand
 * ánders ("Kijk Tyrell", gezegd door Lilly) blijft staan, en een zin met "ik" of
 * "mijn" ook: dat is iemand die over zichzelf praat.
 */
export function vertellerZinnenBijVerteller(
  scenes: DialogueScene[],
  cast: { id: string; name: string }[],
): DialogueScene[] {
  return scenes.map((s) => ({
    ...s,
    lines: s.lines.map((l) => {
      const kaal = kaalTekst(l.text);
      if (l.characterId === VERTELLER_ID || !kaal) return l;
      const t = ` ${kaal} `;
      if (/ (ik|mijn|me|mij) /.test(t)) return l;
      const spreker = cast.find((c) => c.id === l.characterId);
      const eigenNaam = !!spreker && t.includes(` ${kaalTekst(spreker.name)} `);
      const overDeKinderen = /(^|[.!?]\s+)de kinderen\b/i.test((l.text ?? "").trim());
      if (!eigenNaam && !overDeKinderen) return l;
      return {
        ...l,
        kind: "actie",
        characterId: VERTELLER_ID,
        kader: l.kind === "actie" ? l.kader ?? "totaal" : "totaal",
        actie: (l.actie ?? "").trim() || vertellerBeeld(l.text, s.setting),
        seconden: l.seconden ?? ACTIE_STANDAARD_SEC,
      };
    }),
  }));
}

/**
 * Elk moment van een GEVOLGD verhaal staat in het draaiboek, ook als het schrijven
 * ervan mislukte of alles eruit gefilterd werd.
 *
 * Bij de Wonderwagen verdwenen oma's geheim, de synagoge en de binnenstad
 * stilletjes: hun scène bleef leeg achter en werd weggegooid. Een plek uit je eigen
 * verhaal die zomaar ontbreekt, is precies wat niet mag. Wat vastligt — de
 * vertellerzin (of anders wat er gebeurt) en de letterlijke zinnen — komt er dan in
 * elk geval te staan, op zijn plek in de volgorde. Een verzonnen verhaal (met fasen)
 * blijft ongemoeid.
 */
export function zorgVoorMomenten(
  scenes: DialogueScene[],
  lijn: VerhaalDeel[] | null | undefined,
  cast: { id: string; characterId: string }[],
): DialogueScene[] {
  if (!lijn?.length || lijn.some((d) => d.fase)) return scenes;
  const uit = [...scenes];
  const alGezegd = (zin: string) =>
    uit.some((s) => s.lines.some((l) => kaalTekst(l.text).includes(kaalTekst(zin))));

  lijn.forEach((d, i) => {
    const deel = i + 1;
    if (uit.some((s) => s.deel === deel)) return;

    const setting = d.plek || d.titel;
    const zin = d.verteller || d.wat;
    const lines: DialogueLine[] = [];
    if (zin) {
      lines.push({
        kind: "actie", characterId: VERTELLER_ID, kader: "totaal", text: zin, emotion: "",
        actie: vertellerBeeld(zin, setting), seconden: ACTIE_STANDAARD_SEC,
        verband: `${deelLabel(d, i).toLowerCase()}: dit moment kwam niet uit het schrijven, dus staat het vaste deel erin`,
      });
    }
    for (const c of d.citaten ?? []) {
      const p = cast.find((k) => k.characterId === c.wie);
      // Staat de zin al ergens (bij een verkeerd moment), dan niet nog een keer.
      if (p && !alGezegd(c.tekst)) lines.push({ kind: "dialoog", characterId: p.id, kader: null, text: c.tekst, emotion: "neutraal" });
    }
    if (lines.length === 0) return;

    const scene: DialogueScene = { id: `moment-${deel}`, setting, licht: null, deel, lines };
    const erna = uit.findIndex((s) => (s.deel ?? 0) > deel);
    if (erna < 0) uit.push(scene);
    else uit.splice(erna, 0, scene);
  });

  return uit;
}

/**
 * Elke letterlijke zin uit het verhaal van de gebruiker staat in het draaiboek, bij
 * het juiste moment en in de mond van de juiste persoon.
 *
 * De schrijfstap kreeg die zinnen al mee en deed het bijna goed: zes van de zeven
 * stonden erin. Maar "Wat voor geheim?" zei Lilly in plaats van Tyrell, "Kunnen we
 * echt overal naartoe?" zei Tyrell in plaats van Lilly, en oma's "Overal waar
 * jullie nieuwsgierig naar zijn." ontbrak. Voor wie zijn eigen verhaal aanlevert
 * zijn dat precies de zinnen die hij terug wil horen, dus dit hangt niet van een
 * model af: een verkeerde spreker wordt rechtgezet, een ontbrekende zin komt
 * achteraan het moment. Veilig om vaker te draaien.
 */
export function zorgVoorCitaten(
  scenes: DialogueScene[],
  lijn: VerhaalDeel[] | null | undefined,
  cast: { id: string; characterId: string }[],
): DialogueScene[] {
  if (!lijn?.some((d) => d.citaten?.length)) return scenes;
  const uit = scenes.map((s) => ({ ...s, lines: [...s.lines] }));

  lijn.forEach((d, i) => {
    const vanDeel = uit.filter((s) => s.deel === i + 1);
    // Eerst bij het eigen moment zoeken, daarna in de rest van het draaiboek. Het
    // model nummert de delen niet altijd goed: bij de Wonderwagen stonden de zinnen
    // van moment 2 in de scène van moment 1. Alleen bij het eigen moment zoeken gaf
    // dan elke zin twee keer — één keer van het model, één keer van ons erbij.
    const zoekIn = [...vanDeel, ...uit.filter((s) => !vanDeel.includes(s))];

    for (const c of d.citaten ?? []) {
      const spreker = cast.find((k) => k.characterId === c.wie)?.id;
      const doel = kaalTekst(c.tekst);
      if (!spreker || !doel) continue;
      // Een korte zin ("Ja!") alleen bij een exacte match; anders vindt hij hem overal.
      const past = (tekstRegel: string) =>
        doel.length >= 8 ? kaalTekst(tekstRegel).includes(doel) : kaalTekst(tekstRegel) === doel;

      let gevonden = false;
      for (const s of zoekIn) {
        const j = s.lines.findIndex((l) => l.characterId !== VERTELLER_ID && past(l.text));
        if (j < 0) continue;
        if (s.lines[j].characterId !== spreker) s.lines[j] = { ...s.lines[j], characterId: spreker };
        gevonden = true;
        break;
      }
      if (!gevonden && vanDeel.length > 0) {
        vanDeel[vanDeel.length - 1].lines.push({
          kind: "dialoog", characterId: spreker, kader: null, text: c.tekst, emotion: "neutraal",
        });
      }
    }
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
