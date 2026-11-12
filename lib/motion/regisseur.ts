// De regisseur van de Motion graphics-studio: een gesprek in plaats van een formulier.
// De klant kiest links de vorm (soort video, tekenstijl, lengte, taal, stem) en praat daarna
// met de regisseur over de inhoud: die schrijft het script, past het aan en denkt mee.
//
// Bewust klein gehouden. De regisseur schrijft het script niet zelf: hij geeft een opdracht
// aan de bestaande scriptschrijver (schrijfPlan), zodat lengte, opbouw en controles dezelfde
// zijn als zonder gesprek. Wijzigingen doet hij per scene, zodat een script van tien minuten
// niet bij elke opmerking opnieuw wordt geschreven. De video starten kan hij niet: dat kost
// credits en blijft een knop van de klant.
//
// Het gesprek wordt niet op de server bewaard; de browser stuurt het elke keer mee.

import type Anthropic from "@anthropic-ai/sdk";
import { claude, controleerPlan, lengteVoorWoorden, schrijfPlan, telWoorden } from "./plan";
import { stijlVan } from "./stijlen";
import { MOTION_LENGTES, MOTION_SOORTEN, duurTekst, maxWoorden, type MotionBeeld, type MotionLengte, type MotionPlan, type MotionSoort, type MotionTaal } from "./types";

const MODEL = "claude-opus-5-5";

export interface RegieBericht {
  van: "klant" | "regisseur";
  tekst: string;
}

export interface RegieVraag {
  berichten: RegieBericht[];
  plan: MotionPlan | null;
  soort: MotionSoort;
  lengte: MotionLengte;
  staand: boolean;
  taal: MotionTaal;
  stijl: string;
  bedrijf: string;
  toon?: string;
  nietDoen?: string;
  beelden?: MotionBeeld[];
}

export interface RegieAntwoord {
  bericht: string;
  /** Het nieuwe of aangepaste script, als de regisseur er iets aan deed. */
  plan?: MotionPlan;
  /** Bij een eigen script volgt de lengte uit de tekst. */
  lengte?: MotionLengte;
  afwijkend?: number[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bericht", "actie", "opdracht", "wijzigingen"],
  properties: {
    bericht: { type: "string" },
    actie: { type: "string", enum: ["praat", "schrijf", "verdeel", "wijzig"] },
    opdracht: { type: "string" },
    wijzigingen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "wat", "tekst", "beeld", "kop"],
        properties: {
          scene: { type: "integer" },
          wat: { type: "string", enum: ["vervang", "verwijder", "voeg_toe_na", "eindkaart"] },
          tekst: { type: "string" },
          beeld: { type: "string" },
          kop: { type: "string" },
        },
      },
    },
  },
} as const;

function systeem(v: RegieVraag): string {
  const stijl = stijlVan(v.stijl);
  const soort = MOTION_SOORTEN.find((s) => s.id === v.soort);
  return `Je bent de regisseur van de Motion graphics-studio van Animideo. Je maakt met de klant een video die helemaal in code wordt getekend: strakke, platte animatie met vormen, kaarten, tijdlijnen, grafieken, tellers, eenvoudige figuren en tekst in beeld, precies op een ingesproken stem, met muziek eronder. Je praat met de klant in gewoon Nederlands, kort en hartelijk, zonder vaktaal.

Wat deze studio kan en niet kan (beloof niets anders):
- Alles wordt getekend. Er zijn geen gefilmde beelden, geen foto-echte of door AI gemaakte plaatjes en geen pratende personages met lipbeweging. Mensen zijn eenvoudige figuren.
- De klant kan onder het gesprek zelf beelden toevoegen ("Beeld toevoegen"): een foto of voorbeeld om na te tekenen, om de stijl van over te nemen, of om zelf in beeld te laten zien. Wil hij een eigen foto, logo of schilderij in de video, verwijs hem daarheen. Zelf kun je geen beelden zoeken of ophalen.
- Elke soort onderwerp kan: een bedrijfsvideo, een geschiedenisverhaal, een documentaire, een les, een weetje, een aankondiging, een verhaal voor kinderen.
- De vorm heeft de klant links van het gesprek gekozen en kan hij daar zelf veranderen: soort video, tekenstijl, formaat, lengte, taal, stem en muziek. Jij kunt die keuzes niet omzetten; wil de klant iets anders, zeg dan waar hij het aanpast.
- De video maken kost credits en start de klant zelf met de knop "Maak de video" onder het script. Jij start niets.

De keuzes van de klant op dit moment:
- Soort video: ${soort?.naam ?? v.soort} (${soort?.uitleg ?? ""})
- Lengte: ${duurTekst(v.lengte)} (ongeveer ${maxWoorden(v.lengte)} woorden gesproken tekst). Mogelijke lengtes: ${MOTION_LENGTES.map((l) => l.naam).join(", ")}.
- Formaat: ${v.staand ? "staand (telefoon)" : "liggend"}
- Taal van de video: ${v.taal === "en" ? "Engels" : "Nederlands"} (jij blijft met de klant Nederlands praten)
- Tekenstijl: ${stijl ? `${stijl.naam} (${stijl.uitleg})` : "Standaard (licht en strak, in de kleuren van de klant)"}
- Afzender: ${v.bedrijf || "geen (er komt geen naam of logo in beeld)"}${v.toon ? `\n- Schrijfstijl van de klant: ${v.toon}` : ""}${v.nietDoen ? `\n- Wat er niet in mag: ${v.nietDoen}` : ""}${v.beelden?.length ? `\n- De klant gaf ${v.beelden.length} voorbeeld(en) of foto('s) mee; de scriptschrijver krijgt die te zien.` : ""}

Bij elk bericht van de klant kies je één actie:
- "praat": alleen antwoorden. Gebruik dit om één gerichte vraag te stellen als je zonder het antwoord geen goed script kunt maken (bijvoorbeeld: een bedrijfsvideo zonder dat je weet wat het bedrijf doet), om advies te geven, of om uit te leggen wat kan.
- "schrijf": laat een nieuw script schrijven. In "opdracht" zet je de complete briefing voor de scriptschrijver, die het gesprek niet ziet: het onderwerp, voor wie, de invalshoek en toon, en alles wat de klant aan feiten, bedragen, namen en wensen heeft genoemd, letterlijk. Bij een verhaal of les mag je de rode draad en de belangrijkste feiten erbij zetten waar je zeker van bent. Schrijf de opdracht in het Nederlands, ook als de video Engels wordt.
- "verdeel": de klant heeft een kant-en-klaar script geplakt dat letterlijk gebruikt moet worden. Het systeem neemt dan zijn laatste bericht woord voor woord over en verdeelt het in scenes; "opdracht" laat je leeg.
- "wijzig": pas het bestaande script aan. In "wijzigingen" zet je alleen de scenes die veranderen, met het nummer zoals in het script hieronder:
  - wat "vervang": de scene krijgt de tekst, het beeld en de kop die je meegeeft; een veld dat je leeg laat blijft zoals het was.
  - wat "verwijder": de scene verdwijnt.
  - wat "voeg_toe_na": een nieuwe scene ná dat nummer (0 = helemaal vooraan), met tekst, beeld en eventueel kop.
  - wat "eindkaart": de slotzin van de stem (tekst); scene is dan 0.
  Geef nooit het hele script terug als er maar een paar scenes veranderen. Wil de klant iets dat het hele script raakt (andere toon, half zo lang, ander onderwerp), kies dan "schrijf" met een nieuwe opdracht waarin je de wens meeneemt.

Regels:
- Wees geen vragenlijst. Is het onderwerp duidelijk genoeg om te beginnen, schrijf dan meteen; de klant ziet het script en stuurt bij. Stel hooguit één vraag tegelijk.
- "bericht" is wat de klant leest: twee tot vijf zinnen. Vertel wat je hebt gedaan of gaat doen en, als er een script is, waar hij op kan letten of wat je zou aanraden. Herhaal het script niet in je bericht; dat staat eronder.
- In de scenes: "tekst" is wat de stem zegt, in de taal van de video, 20 tot 30 woorden per scene. "beeld" beschrijft in het Nederlands wat er getekend wordt. "kop" is een korte titel rechtsboven (hooguit 24 tekens).
- Past de wens niet in de gekozen lengte, zeg dat en noem de lengte die wel past.
- Feiten: neem wat de klant aanlevert letterlijk over. Vul zelf alleen feiten aan waar je zeker van bent, en zeg het erbij als de klant iets moet nakijken.
- Vraagt de klant iets dat deze studio niet kan (gefilmd beeld, een echte persoon natekenen, een bestaand merk of figuur namaken), zeg dat eerlijk en stel voor wat wel kan.`;
}

function planTekst(plan: MotionPlan | null): string {
  if (!plan) return "Er is nog geen script.";
  return `Het script zoals het nu is (de klant kan het ook zelf hebben aangepast):
Titel: ${plan.titel}
${plan.scenes.map((s, i) => `Scene ${i + 1}${s.kop ? ` [${s.kop}]` : ""}\n  Stem: ${s.tekst}\n  Beeld: ${s.beeld}`).join("\n")}
Eindkaart
  Stem: ${plan.eind.tekst}
  In beeld: "${plan.eind.regel1}" / "${plan.eind.regel2}", knop "${plan.eind.knop}"
Samen ${telWoorden(plan)} woorden.`;
}

interface Uitkomst {
  bericht: string;
  actie: "praat" | "schrijf" | "verdeel" | "wijzig";
  opdracht: string;
  wijzigingen: { scene: number; wat: "vervang" | "verwijder" | "voeg_toe_na" | "eindkaart"; tekst: string; beeld: string; kop: string }[];
}

/** Past de wijzigingen van de regisseur toe. Van achter naar voren, zodat de nummers blijven kloppen. */
export function pasPlanAan(plan: MotionPlan, ws: Uitkomst["wijzigingen"]): MotionPlan {
  const scenes = plan.scenes.map((s) => ({ ...s }));
  let eind = { ...plan.eind };
  // Toevoegen ná een nummer gebeurt na vervangen/verwijderen van datzelfde nummer.
  const volgorde = [...ws].sort((a, b) => b.scene - a.scene || (a.wat === "voeg_toe_na" ? -1 : 1));
  for (const w of volgorde) {
    const i = w.scene - 1;
    if (w.wat === "eindkaart") {
      if (w.tekst.trim()) eind = { ...eind, tekst: w.tekst.trim() };
    } else if (w.wat === "voeg_toe_na") {
      if (w.tekst.trim() && w.scene >= 0 && w.scene <= scenes.length) scenes.splice(w.scene, 0, { tekst: w.tekst.trim(), beeld: w.beeld.trim(), kop: w.kop.trim() });
    } else if (i >= 0 && i < scenes.length) {
      if (w.wat === "verwijder") scenes.splice(i, 1);
      else scenes[i] = { tekst: w.tekst.trim() || scenes[i].tekst, beeld: w.beeld.trim() || scenes[i].beeld, kop: w.kop.trim() || scenes[i].kop };
    }
  }
  return { ...plan, scenes, eind };
}

export async function regisseer(v: RegieVraag): Promise<RegieAntwoord> {
  // Alleen het recente deel van het gesprek: het script zelf staat er apart bij.
  const recent = v.berichten.slice(-16);
  const laatste = [...v.berichten].reverse().find((b) => b.van === "klant")?.tekst ?? "";
  const gesprek = recent.map((b) => `${b.van === "klant" ? "Klant" : "Regisseur"}: ${b.tekst.slice(0, b.van === "klant" ? 16000 : 1200)}`).join("\n\n");
  const antwoord = await claude()
    .beta.messages.stream({
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systeem(v),
      messages: [{ role: "user", content: `${planTekst(v.plan)}\n\nHet gesprek tot nu toe:\n\n${gesprek}\n\nReageer op het laatste bericht van de klant.` }],
    })
    .finalMessage();
  if (antwoord.stop_reason === "refusal") return { bericht: "Hier kan ik je niet mee helpen. Probeer het onderwerp anders te omschrijven." };
  const tekst = antwoord.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  let u: Uitkomst;
  try {
    u = JSON.parse(tekst) as Uitkomst;
  } catch {
    return { bericht: "Dat ging even mis aan mijn kant. Wil je je bericht nog een keer sturen?" };
  }
  const bericht = String(u.bericht ?? "").trim() || "Ik heb het aangepast.";
  const basis = { bedrijf: v.bedrijf, staand: v.staand, toon: v.toon, nietDoen: v.nietDoen, beelden: v.beelden, taal: v.taal, soort: v.soort };

  try {
    if (u.actie === "schrijf" && u.opdracht.trim().length >= 10) {
      const { plan } = await schrijfPlan({ ...basis, onderwerp: u.opdracht.trim().slice(0, 6000), lengte: v.lengte });
      return { bericht, plan };
    }
    if (u.actie === "verdeel" && laatste.trim().length >= 40) {
      const langste = MOTION_LENGTES[MOTION_LENGTES.length - 1].sec;
      const { plan, afwijkend } = await schrijfPlan({ ...basis, onderwerp: laatste.slice(0, 16000), lengte: langste, eigenScript: true });
      return { bericht, plan, afwijkend, lengte: lengteVoorWoorden(telWoorden(plan)) ?? langste };
    }
    if (u.actie === "wijzig" && v.plan && u.wijzigingen?.length) {
      // De klant kan door een wijziging over de gekozen lengte gaan; dan zegt het scherm dat
      // erbij. Hier alleen de vorm controleren, tegen de langste video.
      const plan = controleerPlan(pasPlanAan(v.plan, u.wijzigingen), MOTION_LENGTES[MOTION_LENGTES.length - 1].sec);
      return { bericht, plan };
    }
  } catch (e) {
    return { bericht: `Dat lukte niet: ${e instanceof Error ? e.message : "er ging iets mis"} Zeg het gerust nog eens, of pas het script hieronder zelf aan.` };
  }
  return { bericht };
}
