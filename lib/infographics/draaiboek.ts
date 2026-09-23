// Een aangeleverd draaiboek uit elkaar trekken.
//
// Een klant die "zijn script" aanlevert, levert zelden kale voice-over aan. Wat
// er binnenkomt is een draaiboek: een briefing (doel, doelgroep, tone of voice),
// een shotlijst als tabel met kolommen (#, tijd, beeld, voice-over, tekst in
// beeld), soms twee eindversies, en onderaan nog een keer het volledige
// voice-overscript. Knippen op alinea's maakt daar onzin van: dan hoor je
// "Shotlijst hekje Tijd Beeld Voice-over" voorgelezen worden.
//
// Daarom leest een model het document en haalt per shot drie dingen eruit: de
// voice-over (letterlijk), het beeld en een eventuele bewegingsaanwijzing. Wat
// het model teruggeeft wordt hier nagerekend: een voice-over die niet
// woord-voor-woord in het document staat, is verzonnen en wordt gemarkeerd.

/** Eén shot zoals hij uit een draaiboek komt. */
export interface DraaiboekScene {
  /** Letterlijk de voice-over uit het document. */
  voiceover: string;
  /** Wat er te zien is, in de woorden van het draaiboek (Nederlands). */
  beeld: string;
  /** Camera- of bewegingsaanwijzing, als het draaiboek die geeft. */
  beweging: string;
  /** Tekst die in beeld moet verschijnen ("Tekst in beeld"-kolom). */
  tekstInBeeld: string;
  /** Staat deze voice-over letterlijk in het document? Zo niet: tonen als waarschuwing. */
  letterlijk: boolean;
}

export interface DraaiboekLezing {
  /** Was dit een draaiboek, of gewoon een lap voice-overtekst? */
  isDraaiboek: boolean;
  titel: string;
  scenes: DraaiboekScene[];
  /** Wat er is overgeslagen of gekozen; wordt aan de gebruiker getoond. */
  opmerkingen: string[];
}

/** JSON-schema voor de modelaanroep (strict). */
export const DRAAIBOEK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isDraaiboek", "titel", "scenes", "opmerkingen"],
  properties: {
    isDraaiboek: { type: "boolean" },
    titel: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["voiceover", "beeld", "beweging", "tekstInBeeld"],
        properties: {
          voiceover: { type: "string" },
          beeld: { type: "string" },
          beweging: { type: "string" },
          tekstInBeeld: { type: "string" },
        },
      },
    },
    opmerkingen: { type: "array", items: { type: "string" } },
  },
} as const;

export const DRAAIBOEK_SYSTEEM = [
  "Je leest een draaiboek voor een video en zet het om in een lijst shots.",
  "",
  "Je verzint NIETS. Je haalt alleen uit het document wat er al staat.",
  "",
  "PER SHOT haal je eruit:",
  '- "voiceover": de gesproken tekst, LETTERLIJK overgenomen, teken voor teken zoals hij in het document staat.',
  "  Geen tijdcodes, geen shotnummers, geen kolomkoppen, geen aanhalingstekens die in het document alleen de kolom markeren.",
  '  Spreekt er in dit shot niemand, dan is "voiceover" leeg.',
  '- "beeld": wat er te zien is, in de woorden van het draaiboek. Laat weg wat over de camera of beweging gaat.',
  '- "beweging": alleen de camera- of bewegingsaanwijzing ("camera glijdt", "macro-inzoom", "snelle cuts", "split-screen"). Staat die er niet, dan leeg.',
  '- "tekstInBeeld": tekst die in beeld moet verschijnen. Een streepje of "—" betekent geen tekst: dan leeg.',
  "",
  "WAT JE WEGLAAT:",
  "- de briefing: doel, positionering, doelgroep, tone of voice, gebruik, woordaantallen, planning;",
  "- tabelkoppen, shotnummers en tijdcodes;",
  "- een eindcard of shot waarin alleen muziek staat en niets te zien is dat een beeld oplevert — die mag je wél als shot opnemen als er beeld bij staat;",
  "- een herhaling van het volledige voice-overscript onderaan. De shotlijst is de baas: staat dezelfde tekst ook in zo'n samenvattend script, neem hem dan één keer op, bij zijn shot.",
  "",
  "MEERDERE VERSIES: heeft een shot twee varianten (versie A en B, of twee CTA's), neem dan ALLEEN de eerste variant op",
  'en schrijf in "opmerkingen" welke je hebt gekozen en welke je hebt laten liggen.',
  'Staat bij het shot zelf alleen een verwijzing ("CTA — verschilt per versie, zie hieronder"), zoek de varianten dan verderop in',
  "het document op en neem van de eerste variant zowel het beeld als de gesproken tekst over. Laat dat shot nooit leeg.",
  "",
  'REGIEAANWIJZINGEN: tekst tussen haakjes die niemand uitspreekt ("(muziek loopt uit)", "(stilte)") hoort NIET in "voiceover".',
  "Die laat je leeg; wat er te zien is zet je bij \"beeld\".",
  "",
  'Is het document geen draaiboek maar gewoon een lap gesproken tekst, zet dan "isDraaiboek" op false en geef de tekst terug',
  "als shots met alleen voice-over, geknipt op alinea's.",
  "",
  'Zet in "titel" de titel van de video zoals het document hem noemt; is er geen, verzin dan een korte, feitelijke titel.',
  'Zet in "opmerkingen" in gewone taal wat je hebt overgeslagen of gekozen (bijv. "briefing en tone of voice overgeslagen").',
].join("\n");

/** Witruimte en aanhalingstekens gelijktrekken, zodat vergelijken eerlijk is. */
function normaliseer(t: string): string {
  return t
    .replace(/[“”„"']/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Staat deze voice-over echt in het document? Dat is de belofte aan de
 * gebruiker: zijn tekst wordt niet herschreven. Zo niet, dan markeren we de
 * scene in plaats van hem stilletjes te laten passeren.
 */
export function staatInDocument(voiceover: string, document: string): boolean {
  const naald = normaliseer(voiceover);
  if (!naald) return true;
  return normaliseer(document).includes(naald);
}

/** Ruwe modeluitvoer opschonen en nakijken. */
export function keurLezing(ruw: unknown, document: string): DraaiboekLezing | null {
  const d = ruw as Partial<DraaiboekLezing> & { scenes?: Partial<DraaiboekScene>[] };
  if (!d || !Array.isArray(d.scenes)) return null;

  const streepje = (t: string) => (/^[-–—…\s]*$/.test(t) ? "" : t);
  // "(muziek loopt uit)" of "(stilte)" is een regieaanwijzing, geen tekst die
  // iemand uitspreekt. Zonder deze regel leest de stem hem gewoon voor.
  const gesproken = (t: string) => (/^\(.*\)$/.test(t.trim()) ? "" : t);
  const scenes: DraaiboekScene[] = d.scenes
    .map((s) => {
      const voiceover = gesproken(streepje((s?.voiceover ?? "").trim()));
      return {
        voiceover,
        beeld: streepje((s?.beeld ?? "").trim()),
        beweging: streepje((s?.beweging ?? "").trim()),
        tekstInBeeld: streepje((s?.tekstInBeeld ?? "").trim()),
        letterlijk: staatInDocument(voiceover, document),
      };
    })
    // Een shot zonder tekst én zonder beeld levert niets op om te tonen.
    .filter((s) => s.voiceover || s.beeld);

  if (scenes.length === 0) return null;
  return {
    isDraaiboek: d.isDraaiboek !== false,
    titel: (d.titel ?? "").trim(),
    scenes,
    opmerkingen: (Array.isArray(d.opmerkingen) ? d.opmerkingen : []).map((o) => String(o).trim()).filter(Boolean),
  };
}

/**
 * Lijkt dit op een draaiboek in plaats van op kale voice-over? Bewust een
 * simpele telling en geen model: dit bepaalt alleen of we de leesstap
 * aanbieden, en die stap is gratis en omkeerbaar.
 */
export function lijktOpDraaiboek(tekst: string): boolean {
  const t = tekst.toLowerCase();
  const kenmerken = [
    /voice-?over/.test(t),
    /tekst in beeld/.test(t),
    /\bshotlijst\b|\bshot\b|\bscène\s*\d|\bscene\s*\d/.test(t),
    /\b\d{1,2}:\d{2}\s*[–—-]\s*\d{1,2}:\d{2}/.test(tekst), // tijdcodes 0:00–0:04
    /\bbeeld\b\s*[:|]/.test(t),
    /\btone of voice\b|\bdoelgroep\b|\bkernboodschap\b/.test(t),
    (tekst.match(/\|/g) ?? []).length >= 4, // tabelkolommen
  ];
  return kenmerken.filter(Boolean).length >= 2;
}
