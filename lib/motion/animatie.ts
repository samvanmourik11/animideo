// Claude tekent de animatie: hij schrijft de code van de video op de woordtijden van de
// stem, krijgt daarna proefbeelden van zijn eigen werk terug (plus wat de automatische
// controle vond) en verbetert tot het klopt.
//
// Die controleronde is waar het om draait. Zonder terugkijken staat er in één op de drie
// video's een tekst over een andere tekst of half buiten beeld: fouten die een mens in één
// oogopslag ziet, maar die je in code niet ziet. Dit is dezelfde werkwijze als waarmee de
// Lichtveld-video's zijn gemaakt, alleen kijkt hier niemand mee.

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WhisperWord } from "@/lib/openai";
import { claude } from "./plan";
import { ernstig, proef, type Proef } from "./render";
import type { PaginaInvoer } from "./pagina";
import { beeldBlokken } from "./beelden";
import type { MotionBeeld, MotionPlan } from "./types";

const MODEL = "claude-opus-5-5";
/** Dollars per miljoen tokens (Opus 5.5, november 2026). */
const PRIJS = { in: 4, uit: 20, cacheLezen: 0.2, cacheSchrijven: 5 };
/** Hooguit zoveel keer verbeteren na de eerste versie. */
const MAX_RONDES = 2;

export interface Gebruik {
  usd: number;
  rondes: number;
  /** Hoe lang Claude er in totaal over deed, in seconden. */
  sec?: number;
}

type Bericht = Anthropic.Beta.BetaMessageParam;
type Blok = Anthropic.Beta.BetaContentBlockParam;

let voorbeeldCache: string | null = null;
async function voorbeeld(): Promise<string> {
  return (voorbeeldCache ??= await readFile(path.join(process.cwd(), "public", "motion", "voorbeeld.js"), "utf8"));
}

async function systeem(): Promise<string> {
  return `Je bent een motion designer die uitlegvideo's maakt in code. Je schrijft JavaScript die een SVG-animatie tekent voor een Nederlandse bedrijfsvideo. De voice-over is al ingesproken; jij maakt het beeld erbij, precies op de woorden van de stem. Je werk wordt beeld voor beeld omgezet naar een video die de klant zonder verdere controle te zien krijgt, dus het moet in één keer kloppen en er gelikt uitzien: het niveau van een goed animatiebureau.

## Hoe een video in elkaar zit

Je levert één stuk code dat \`window.VIDEO\` zet:

\`\`\`js
window.VIDEO = {
  hfd: { s2: '01  Het probleem' },          // titel rechtsboven per scene (mag ontbreken)
  eind: { regel1: '...', regel2: '...', knop: '...' },   // teksten van de eindkaart; krijg je aangeleverd
  bouw(E, SC) { ... },                       // één keer: alle elementen maken, tijden opzoeken
  teken(tt, cur, E, SC) { ... },             // elk beeld: alles op zijn plek zetten voor tijdstip tt
};
\`\`\`

- \`SC.s1\`, \`SC.s2\` ... zijn de groepen van de scenes. Wat je in \`SC.s2\` tekent, is alleen tijdens scene s2 te zien. De scene-ids krijg je aangeleverd.
- \`E\` is een leeg object om je elementen en tijden in te bewaren (\`E.t = {}\`).
- \`tt\` is de tijd in seconden vanaf het begin van de stem; \`cur\` is de id van de scene die nu loopt.
- De scene \`eind\` (donkere eindkaart met logo, knop en website) tekent het systeem zelf. Ook de achtergrond, de veeg tussen scenes, het merk linksboven en de titel rechtsboven komen vanzelf. Teken die dus niet.

De hoofdregel: \`teken\` berekent elk beeld opnieuw uit alleen \`tt\`. Hetzelfde tijdstip moet altijd exact hetzelfde beeld geven, want de beelden worden los van elkaar en door elkaar getekend. Dus: geen toestand die je van beeld tot beeld bijhoudt, geen Math.random of Date, geen CSS-animaties of transitions, geen setTimeout of requestAnimationFrame, geen plaatjes of lettertypes van buiten (een foto van de klant alleen via \`foto\`, zie hieronder), geen fetch en geen eigen font-family: het lettertype van de klant staat al ingesteld.

## Wat je tot je beschikking hebt (allemaal gewone globale namen)

Beeld: \`W\`, \`H\` (pixels), \`MX\`, \`MY\` (het midden), \`STAAND\` (true bij 9:16), \`RAND\` (140: zo ver blijven tekst en belangrijke vormen van de rand).

Rekenen met tijd:
- \`P(t, a, b)\` loopt van 0 naar 1 tussen tijdstip a en b. \`cl(v, min, max)\`, \`lerp(a, b, x)\`.
- \`eo(x)\` zacht uitlopen, \`eio(x)\` zacht in en uit, \`back(x)\` met een kleine doorschieter.
- \`pop(tt, a, duur = .45)\`: 0 → 1 met een veertje vanaf tijdstip a. Dé manier om iets te laten verschijnen.
- \`win(tt, a, b, fi, fo)\`: 1 tussen a en b, met in- en uitfaden. \`golf(tt, freq, uitslag, fase)\`: een rustige sinus om iets te laten ademen, zweven of schudden.
- \`mix(kleurA, kleurB, x)\`, \`nl(getal)\` (Nederlandse notatie: 1.250).

Woordtijden:
- \`wt('woord', na)\`: het tijdstip waarop de stem dat woord zegt, het eerste op of na \`na\`. Het woord moet letterlijk in het script staan. Komt een woord vaker voor, geef dan \`na\` mee (bijvoorbeeld \`sStart('s3')\` of de tijd van een eerder woord). Zoek de tijden op in \`bouw\` en bewaar ze in \`E.t\`.
- \`sStart('s2')\`, \`sEind('s2')\`: begin en einde van een scene.

SVG:
- \`el(tag, attributen, parent, tekst)\` maakt een element. \`G(parent, attributen)\` een groep.
- \`T(parent, x, y, tekst, grootte, attributen)\`: gecentreerde vette tekst in de inktkleur.
- \`tf(e, x, y, schaal = 1, graden = 0)\`: positie, schaal en draaiing van een groep. \`op(e, 0..1)\`: zichtbaarheid (verbergt het element helemaal bij 0).
- \`draw(pad, p)\`: laat een lijn zichzelf tekenen, p van 0 naar 1.
- Filters en vullingen die klaarstaan: \`filter: 'url(#sch)'\` (zachte schaduw), \`'url(#gloei)'\`, \`'url(#zacht)'\` (grote vervaging voor een lichtvlek).

Kleuren: \`C.inkt\` (donkerblauw, voor tekst en lijnen), \`C.accent\` (de merkkleur van de klant), \`C.accent2\` (tweede kleur), \`C.groen\`, \`C.rood\`, \`C.geel\`, \`C.oranje\`, \`C.blauw\`, \`C.paars\`, \`C.grijs\`, \`C.licht\`, \`C.muted\` (grijze tekst), \`C.wit\`. Gebruik \`F(C.accent)\` als vulling: dat geeft dezelfde kleur met een zacht verloop, wat er verzorgder uitziet dan een egaal vlak. Gebruik groen voor goed/winst en rood voor fout/verlies; de merkkleur voor wat van de klant is.

Bouwstenen (elk geeft een groep terug die je met tf en op animeert):
- \`pil(parent, tekst, { fill, kleur, size = 42, h = 84, padX, rand, icoon })\`: tekstpil; \`.breedte\` is de breedte. Wit met donkere tekst als standaard; met \`fill: C.accent\` gekleurd. \`icoon: g => IC.vink(G(g, { transform: 'scale(.34)' }))\` zet er een icoon voor.
- \`kaart(parent, breedte, hoogte, fill = '#fff')\`: kaart met schaduw, midden op 0,0. Teken de inhoud in de groep die je erin meegeeft.
- \`balk(parent, breedte, hoogte, kleur)\` → \`{ r, zet(0..1) }\`: balk die volloopt.
- \`munt(parent, kleur, '€')\`.
- \`stroom(parent, padD, aantal, straal, kleur)\` en in teken \`flow(stroomObject, tt, van, tot, snelheid)\`: bolletjes die langs een pad stromen (geld, data, mensen, energie).
- \`langsPad(e, padElement, 0..1, schaal)\`: zet iets op een pad.
- \`zinAuto(parent, x, y, 'zin uit het script', na, grootte)\` en in teken \`woordenIn(zin, tt)\`: een regel waarvan elk woord verschijnt als het wordt uitgesproken. Voor een kernzin of een citaat.
- \`tekstBlok(parent, x, y, tekst, grootte, { max: 28 })\`: gecentreerde tekst over meerdere regels.
- \`persoon(parent, { kleur, huid, haar })\` → \`{ r, hoofd, armL, armR }\`: eenvoudig poppetje, ±315 hoog, voeten op 0,0.
- \`foto(parent, 'f1', breedte, { hoogte, rond = 28, rand = 10 })\`: zet een foto van de klant in beeld, gecentreerd op 0,0, met ronde hoeken, een witte rand en een schaduw; \`.breedte\` en \`.hoogte\` geven de maat. Alleen voor voorbeelden met het doel "Zet deze foto in beeld"; welke dat zijn, staat in de opdracht. Geef \`hoogte\` mee om de foto passend uit te snijden.
- Iconen, elk ±120 pixels en gecentreerd op 0,0: \`IC.vink\`, \`kruis\`, \`euro\`, \`vraag\`, \`uitroep\`, \`plus\`, \`bliksem\`, \`vlam\`, \`blad\`, \`hart\`, \`ster\`, \`klok\` (met \`.wijzer\` en \`.uur\` om te draaien), \`doc\`, \`telefoon\` en \`laptop\` (met \`.scherm\`, een groep om iets op het scherm te tekenen), \`vergroot\`, \`team\`, \`gebruiker\`, \`tandwiel\` (met \`.wiel\`), \`mail\`, \`kalender\`, \`grafiek\`, \`schild\`, \`lamp\`, \`huis\`, \`gebouw\`, \`winkelwagen\`, \`pijl\`, \`duim\`, \`spraak\`, \`wereld\`, \`slot\`, \`raket\`. Aanroep: \`IC.klok(parent)\`; de meeste nemen een kleur als tweede argument.

Wat er niet bij staat, teken je zelf met \`el\`: dat is juist wat een video eigen maakt. Een bestelbus, een kassa, een dakgoot, een grafiek met de cijfers van de klant, een plattegrond. Houd één tekenstijl aan: platte vormen, witte of gekleurde vlakken, lijnen van 6 tot 8 pixels in \`C.inkt\` met ronde hoeken (\`'stroke-linejoin': 'round'\`), geen fotorealisme.

## Wat een video goed maakt

- Het beeld legt uit wat de stem zegt: het laat het mechanisme zien (iets stroomt, groeit, wordt vergeleken, valt weg), niet alleen een icoon bij elk zelfstandig naamwoord. Per scene één duidelijk hoofdbeeld dat zich opbouwt in drie tot vijf stappen.
- Elk element verschijnt op het woord waar het bij hoort (\`wt\`), een fractie eerder mag (0,1 tot 0,3 s). Er staat nooit iets in beeld waar de stem nog niet is.
- Het beeld staat nooit stil: wat er al staat, ademt of beweegt licht door (\`golf\`), tellers lopen, lijnen tekenen zich.
- Vul het beeld. Het hoofdbeeld is groot (ruwweg de helft van de beeldbreedte of meer) en de compositie is in balans; geen klein figuurtje in een lege vlakte, geen alles-in-een-hoek.
- Tekst in beeld is kort: labels van een paar woorden, getallen groot. Nooit hele zinnen van de stem uitschrijven, behalve één kernzin als dat het punt is. Letters minstens 30 pixels (liggend) of 40 pixels (staand), koppen en getallen veel groter.
- Niets overlapt per ongeluk. Wat op dezelfde plek komt als iets eerders, laat je het eerdere eerst weghalen of opzij schuiven. Reken de plekken uit: een pil van 6 woorden op grootte 42 is ruim 600 pixels breed.
- Blijf uit de bovenste strook: daar staan het merk (links) en de scenetitel (rechts). Liggend: houd alles onder y = 190. Staand: onder y = 330. Blijf 140 pixels van de andere randen.
- In de eerste scene is er nog geen merk of titel in beeld; daar mag je de hele hoogte gebruiken voor een sterke opening.
- Staand (1080 x 1920) is geen liggend beeld dat is ingezoomd: stapel de elementen onder elkaar en maak ze groot.

## Voorbeelden en foto's van de klant

Soms geeft de klant beelden mee, elk met een doel. Die staan dan bovenaan de opdracht.
- "Teken dit na": de klant wil zijn eigen product, bus, pand, apparaat of app-scherm herkennen. Teken het na met \`el\` in de tekenstijl van de video (platte vlakken, lijnen in \`C.inkt\`), met dezelfde vorm, verhoudingen en kleuren en de details waaraan je het herkent. Neem de kleuren van het voorbeeld over, ook als dat niet de merkkleuren zijn. Maak er een eigen functie van als het in meer scenes terugkomt, zodat het overal hetzelfde is.
- "Leg dit uit": bouw het schema, de grafiek of het stappenplan uit het voorbeeld op in beeld, stap voor stap op de stem, met dezelfde onderdelen, volgorde en cijfers. Neem cijfers en namen letterlijk over.
- "Neem deze stijl over": laat de sfeer van het voorbeeld terugkomen in vormen, compositie en kleurgebruik, binnen de merkkleuren.
- "Zet deze foto in beeld": gebruik \`foto\`. Geef de foto een duidelijke plek en een rol (laat hem binnenkomen op het woord waar hij bij hoort, zet er een label of pijl bij); teken hem niet na.
Het logo van de klant zet het systeem zelf linksboven en op de eindkaart. Teken het logo dus niet na en zet het nergens anders neer.

## Voorbeeld

Een complete, goedgekeurde video. Let op de werkwijze (alles maken in bouw, tijden met wt, in teken alleen tf/op en waarden zetten), niet op het onderwerp. Jouw video krijgt zijn eigen beelden.

\`\`\`js
${await voorbeeld()}
\`\`\`

## Wat je teruggeeft

De complete code in één blok \`\`\`js ... \`\`\`, zonder uitleg ervoor of erna.`;
}

/** De code uit het antwoord halen: het laatste js-blok. */
export function codeUit(tekst: string): string | null {
  const blokken = [...tekst.matchAll(/```(?:js|javascript)?\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  const code = blokken.filter((b) => b.includes("window.VIDEO")).pop();
  return code ?? null;
}

function opdracht(v: AnimatieVraag, scenes: [string, number][], einde: number): string {
  const woorden = v.pagina.woorden;
  // De woordtijden per scene, compact: "0.00 Ken 0.21 je 0.38 dat".
  const perScene = scenes.map(([id, start], i) => {
    const eind = i + 1 < scenes.length ? scenes[i + 1][1] : einde;
    const ws = woorden.filter((w) => w.start >= start - 0.05 && w.start < eind - 0.05);
    return { id, start, eind, tijden: ws.map((w) => `${w.start.toFixed(2)} ${w.word.trim()}`).join("  ") };
  });
  const plan = v.plan;
  const fotos = Object.entries(v.pagina.fotos ?? {}).map(([id, f]) => ({ id, w: f.w, h: f.h }));
  return `Maak de animatie voor deze video.

Bedrijf: ${v.pagina.merk.naam}${v.pagina.merk.website ? ` (${v.pagina.merk.website})` : ""}
Formaat: ${v.pagina.w} x ${v.pagina.h} (${v.pagina.h > v.pagina.w ? "staand" : "liggend"})
Merkkleur C.accent = ${v.pagina.merk.kleur}, tweede kleur C.accent2 = ${v.pagina.merk.kleur2}
Onderwerp volgens de klant: ${v.onderwerp}${v.nietDoen ? `\nWat er van dit bedrijf niet in beeld mag: ${v.nietDoen}` : ""}${fotos.length ? `\nFoto's die je met foto() kunt plaatsen: ${fotos.map((f) => `'${f.id}' (${f.w} x ${f.h})`).join(", ")}` : ""}

De scenes, met wat de stem zegt, wat de klant als beeld heeft goedgekeurd, en de gemeten woordtijden (seconden, zoals wt ze teruggeeft):

${perScene
  .filter((s) => s.id !== "eind")
  .map((s, i) => `### ${s.id} (${s.start.toFixed(1)} tot ${s.eind.toFixed(1)} s)${plan.scenes[i]?.kop ? `, titel rechtsboven: "${plan.scenes[i].kop}"` : ""}
Stem: ${plan.scenes[i]?.tekst ?? ""}
Beeld: ${plan.scenes[i]?.beeld ?? ""}
Woordtijden: ${s.tijden}`)
  .join("\n\n")}

### eind (vanaf ${perScene.find((s) => s.id === "eind")?.start.toFixed(1)} s): tekent het systeem zelf
Stem: ${plan.eind.tekst}
Gebruik precies: eind: { regel1: ${JSON.stringify(plan.eind.regel1)}, regel2: ${JSON.stringify(plan.eind.regel2)}, knop: ${JSON.stringify(plan.eind.knop)} }

De beschrijving bij "Beeld" is wat de klant verwacht te zien; werk die uit tot een sterke compositie en vul aan waar het de uitleg helpt. Let op: de transcriptie schrijft sommige woorden anders dan het script (cijfers, samenstellingen); kies voor wt woorden die in de lijst met woordtijden staan.`;
}

function terugkoppeling(p: Proef, ronde: number): Blok[] {
  const blokken: Blok[] = [];
  const kapot = p.fouten.filter(ernstig);
  if (!p.beelden.length) {
    blokken.push({
      type: "text",
      text: `De code werkt nog niet; er konden geen beelden van gemaakt worden.\n\nFouten:\n${p.fouten.map((f) => `- ${f}`).join("\n")}\n\nHerstel dit en geef de complete code opnieuw in één js-blok.`,
    });
    return blokken;
  }
  blokken.push({ type: "text", text: "Dit zijn proefbeelden van jouw animatie zoals hij nu is, per scene halverwege en vlak voor het einde van de scene (het volste moment)." });
  for (const b of p.beelden) {
    blokken.push({ type: "text", text: `Scene ${b.scene}, t = ${b.t} s:` });
    blokken.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.jpg.toString("base64") } });
  }
  blokken.push({
    type: "text",
    text: `${p.fouten.length ? `De automatische controle meldt:\n${p.fouten.map((f) => `- ${f}`).join("\n")}\n\n` : "De automatische controle vond geen fouten in de code en geen tekst buiten beeld.\n\n"}Bekijk de beelden zoals een strenge art director dat zou doen, voordat dit naar de klant gaat. Waar het om gaat: teksten of vormen die over elkaar heen staan of buiten beeld vallen; iets dat door het merk linksboven of de titel rechtsboven loopt; een scene die leeg of scheef oogt, waarvan het hoofdbeeld te klein is of waar een helft van het beeld ongebruikt blijft (kijk daarvoor juist naar het beeld halverwege de scene); tekst die te klein is om te lezen; een beeld dat niet uitlegt wat de stem zegt; iets dat er onaf of slordig uitziet.

${kapot.length ? "Er zitten nog fouten in de code, dus die moeten er in elk geval uit. " : ""}Is er iets te verbeteren, geef dan de complete verbeterde code in één js-blok. ${ronde >= MAX_RONDES ? "Dit is de laatste ronde: verbeter alleen wat echt fout is en verander niets dat goed werkt. " : ""}Is alles goed genoeg voor de klant, antwoord dan alleen met het woord GOED.`,
  });
  return blokken;
}

export interface AnimatieVraag {
  /** Alles voor de pagina behalve de code. */
  pagina: Omit<PaginaInvoer, "code">;
  plan: MotionPlan;
  onderwerp: string;
  /** Voorbeelden en foto's van de klant, elk met een doel. */
  beelden?: MotionBeeld[];
  nietDoen?: string;
}

export interface AnimatieUitkomst {
  code: string;
  gebruik: Gebruik;
  /** Wat er na de laatste controle nog aan schoonheidsfouten overbleef (voor het logboek). */
  rest: string[];
  einde: number;
}

/** De begintijden van de scenes, zoals de kern ze ook bepaalt: via een lege video. */
async function sceneTijden(pagina: Omit<PaginaInvoer, "code">): Promise<Proef> {
  return proef({ ...pagina, code: "window.VIDEO = { bouw() {}, teken() {} };" });
}

export async function tekenAnimatie(v: AnimatieVraag, opVoortgang?: (tekst: string) => void): Promise<AnimatieUitkomst> {
  const leeg = await sceneTijden(v.pagina);
  if (!leeg.scenes.length) throw new Error("De scenes konden niet op de stem worden gelegd.");
  const sys = await systeem();
  const voorbeelden = v.beelden?.length ? await beeldBlokken(v.beelden, true) : [];
  const berichten: Bericht[] = [{ role: "user", content: [...voorbeelden, { type: "text", text: opdracht(v, leeg.scenes, leeg.einde) }] }];
  const gebruik: Gebruik = { usd: 0, rondes: 0, sec: 0 };

  // De beste versie tot nu toe: de laatste zonder kapotte code. Een verbeterronde die
  // iets stukmaakt, mag een werkende versie niet verdringen.
  let beste: { code: string; proef: Proef } | null = null;
  let laatsteFout = "";

  for (let ronde = 0; ronde <= MAX_RONDES; ronde++) {
    opVoortgang?.(ronde === 0 ? "tekenen" : `controleronde ${ronde}`);
    const begin = Date.now();
    const antwoord = await claude()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 48000,
        // De vaste uitleg is voor elke video gelijk en wordt gecachet; de cache bovenaan
        // neemt het gesprek tot nu toe mee, zodat een controleronde de eerdere code voor
        // een tiende van de prijs leest.
        system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        messages: berichten,
        // "medium": op "high" kostte de eerste proefvideo $2,09 en 12 minuten, vooral aan
        // denkwerk; de controleronde met proefbeelden vangt meer fouten dan langer nadenken.
        output_config: { effort: "medium" },
        // Weigert het model iets op een beleidsgrond, dan neemt een passend model het over.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();
    const u = antwoord.usage;
    gebruik.usd +=
      (u.input_tokens * PRIJS.in + u.output_tokens * PRIJS.uit + (u.cache_read_input_tokens ?? 0) * PRIJS.cacheLezen + (u.cache_creation_input_tokens ?? 0) * PRIJS.cacheSchrijven) / 1e6;
    gebruik.rondes = ronde + 1;
    gebruik.sec = (gebruik.sec ?? 0) + Math.round((Date.now() - begin) / 1000);
    if (antwoord.stop_reason === "refusal") throw new Error("Over dit onderwerp kunnen we geen animatie maken. Probeer het anders te omschrijven.");

    // Het hele antwoord terug in het gesprek, ook de denkblokken: die horen erbij.
    berichten.push({ role: "assistant", content: antwoord.content });
    const tekst = antwoord.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
    const code = codeUit(tekst);

    if (!code) {
      // "GOED": Claude keurt zijn vorige versie goed.
      if (beste && /\bGOED\b/.test(tekst)) break;
      laatsteFout = antwoord.stop_reason === "max_tokens" ? "De code werd te lang." : "Er kwam geen code terug.";
      if (ronde === MAX_RONDES) break;
      berichten.push({ role: "user", content: `${laatsteFout} Geef de complete code in één js-blok dat window.VIDEO zet${antwoord.stop_reason === "max_tokens" ? ", en houd hem compacter" : ""}.` });
      continue;
    }

    const p = await proef({ ...v.pagina, code });
    // Voor onderzoek: elke versie met wat de controle ervan vond (scripts/motion-eind-tot-eind).
    if (process.env.MOTION_DEBUG_DIR) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path.join(process.env.MOTION_DEBUG_DIR, `ronde${ronde}.js`), code).catch(() => {});
      await writeFile(path.join(process.env.MOTION_DEBUG_DIR, `ronde${ronde}.fouten.json`), JSON.stringify(p.fouten, null, 1)).catch(() => {});
    }
    const kapot = p.fouten.filter(ernstig);
    if (!kapot.length && p.beelden.length) beste = { code, proef: p };
    else laatsteFout = kapot[0] ?? "De code gaf geen beeld.";
    if (ronde === MAX_RONDES) break;
    berichten.push({ role: "user", content: terugkoppeling(p, ronde + 1) });
  }

  if (!beste) throw new Error(`De animatie kon niet foutloos worden gemaakt. ${laatsteFout}`.trim());
  return { code: beste.code, gebruik, rest: beste.proef.fouten, einde: beste.proef.einde };
}
