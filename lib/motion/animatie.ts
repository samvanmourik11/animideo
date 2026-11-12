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
import type { MotionBeeld, MotionPlan, MotionSoort } from "./types";
import { stijlVan } from "./stijlen";

const MODEL = "claude-opus-5-5";
// Het nakijken en bijwerken is kleiner werk dan het ontwerp: kijken naar proefbeelden en een
// paar plekken in bestaande code aanpassen. Dat kan een goedkoper model (Sam, 11-11-2026:
// "waarom is dit zo duur?"). Sinds 12-11-2026 het kleinste model: op een proef van 2,5 minuut
// kostte het nakijken $0,04 in plaats van ±$0,30 en bleef er geen fout over. Het ontwerp door
// datzelfde model laten maken is ook geprobeerd: bijna gratis, maar kaler getekend en ruim
// twee keer zo traag. MOTION_CONTROLE_MODEL is er alleen om modellen naast elkaar te testen.
const CONTROLE_MODEL = process.env.MOTION_CONTROLE_MODEL || "claude-haiku-5-5";
/** Dollars per miljoen tokens (november 2026). */
const PRIJZEN: Record<string, { in: number; uit: number; cacheLezen: number; cacheSchrijven: number }> = {
  "claude-opus-5-5": { in: 4, uit: 20, cacheLezen: 0.2, cacheSchrijven: 5 },
  "claude-sonnet-5-5": { in: 2, uit: 10, cacheLezen: 0.1, cacheSchrijven: 2.5 },
  "claude-haiku-5-5": { in: 0.1, uit: 0.5, cacheLezen: 0.01, cacheSchrijven: 0.125 },
};
function kosten(model: string, u: Anthropic.Beta.BetaUsage): number {
  // Een onbekend model rekenen we tegen de duurste prijs: liever te hoog dan te laag in het logboek.
  const p = PRIJZEN[model] ?? PRIJZEN[MODEL];
  return (u.input_tokens * p.in + u.output_tokens * p.uit + (u.cache_read_input_tokens ?? 0) * p.cacheLezen + (u.cache_creation_input_tokens ?? 0) * p.cacheSchrijven) / 1e6;
}
/** Hooguit zoveel keer verbeteren na de eerste versie. */
const MAX_RONDES = 2;

export interface Gebruik {
  usd: number;
  rondes: number;
  /** Wat het eerste ontwerp kostte en wat de controlerondes samen kostten. */
  usdOntwerp?: number;
  usdControle?: number;
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
  const pl = v.plek;
  const heeftEind = !pl || pl.laatste;
  const stijl = stijlVan(v.pagina.stijl);
  // De algemene uitleg beschrijft de standaardstijl (witte kaarten, zachte schaduw, verloop).
  // Bij een gekozen stijl gaan deze regels daarboven.
  const stijlBlok = stijl
    ? `
## Tekenstijl van deze video: ${stijl.naam}
De klant koos een eigen tekenstijl. Deze regels gaan vóór op wat de algemene uitleg en het voorbeeld over het uiterlijk zeggen (witte kaarten, zachte schaduw, verloop, glans); wat daar staat over opbouw, timing, leesbaarheid en de veilige rand blijft gelden.
${stijl.regels}
De bouwstenen zijn al op deze stijl ingesteld: de achtergrond, het lettertype, het merk linksboven, de titel rechtsboven, de veeg en de eindkaart. De kleurnamen (C.inkt, C.wit, C.rood, C.blauw, ...) hebben de kleuren van deze stijl: C.inkt is de kleur voor lijnen en tekst, C.wit de kleur van een vlak waar iets op staat. Gebruik daarom steeds die namen en geen eigen kleurcodes zoals '#fff' of '#000'. pil() en kaart() zonder kleur krijgen vanzelf de vorm van deze stijl.${stijl.thema.accent ? " De merkkleuren van de klant passen niet in deze stijl: C.accent en C.accent2 zijn hier de accentkleuren van de stijl." : ""}
`
    : "";
  return `${pl ? `Maak de animatie voor hoofdstuk ${pl.nummer} van ${pl.aantal} van een lange video. Elk hoofdstuk wordt apart getekend en daarna worden ze aan elkaar gezet; jij maakt alleen dit hoofdstuk. De tijden hieronder tellen vanaf het begin van dit hoofdstuk.${pl.nummer > 1 ? ` Het merk linksboven staat vanaf het eerste beeld in beeld, dus houd ook in de eerste scene de bovenste strook vrij.${pl.hiervoor ? ` In het hoofdstuk hiervoor was te zien: ${pl.hiervoor}` : ""}` : ""}${pl.hierna ? ` In het hoofdstuk hierna komt: ${pl.hierna}` : ""} Laat terugkerende dingen (het product, de hoofdpersoon) er net zo uitzien als ze in de beschrijvingen van de andere hoofdstukken heten, in dezelfde platte stijl en de merkkleuren.${heeftEind ? "" : " Dit hoofdstuk heeft geen eindkaart: laat `eind` weg uit window.VIDEO en eindig met het laatste beeld van de laatste scene."}` : "Maak de animatie voor deze video."}

${v.soort && v.soort !== "bedrijf" ? `Let op: dit is geen bedrijfsvideo maar ${v.soort === "verhaal" ? "een verhaal (geschiedenis, documentaire)" : v.soort === "uitleg" ? "een uitleg of les" : "een vrije video"}. Teken wat het verhaal vraagt: kaarten, tijdlijnen, portretten als eenvoudige figuur, voorwerpen, plekken. Geen kantoor-iconen, knoppen of verkooptaal waar het verhaal daar niet om vraagt.\n` : ""}${v.pagina.merk.naam ? `${v.soort && v.soort !== "bedrijf" ? "Afzender" : "Bedrijf"}: ${v.pagina.merk.naam}${v.pagina.merk.website ? ` (${v.pagina.merk.website})` : ""}` : "Afzender: geen. Er staat geen merk linksboven; de eindkaart toont alleen de slotregels."}
Formaat: ${v.pagina.w} x ${v.pagina.h} (${v.pagina.h > v.pagina.w ? "staand" : "liggend"})
Merkkleur C.accent = ${v.pagina.merk.kleur}, tweede kleur C.accent2 = ${v.pagina.merk.kleur2}
${v.taal === "en" ? "Taal: dit is een Engelstalige video. Alle tekst in beeld is Engels, ook als de beschrijving bij Beeld Nederlands is. Schrijf getallen op zijn Engels (1,250 en 3.5); gebruik daarvoor nl() niet.\n" : ""}Onderwerp volgens de klant: ${v.onderwerp}${v.nietDoen ? `\nWat er van dit bedrijf niet in beeld mag: ${v.nietDoen}` : ""}${fotos.length ? `\nFoto's die je met foto() kunt plaatsen: ${fotos.map((f) => `'${f.id}' (${f.w} x ${f.h})`).join(", ")}` : ""}
${stijlBlok}
De scenes, met wat de stem zegt, wat de klant als beeld heeft goedgekeurd, en de gemeten woordtijden (seconden, zoals wt ze teruggeeft):

${perScene
  .filter((s) => s.id !== "eind")
  .map((s, i) => `### ${s.id} (${s.start.toFixed(1)} tot ${s.eind.toFixed(1)} s)${plan.scenes[i]?.kop ? `, titel rechtsboven: "${plan.scenes[i].kop}"` : ""}
Stem: ${plan.scenes[i]?.tekst ?? ""}
Beeld: ${plan.scenes[i]?.beeld ?? ""}
Woordtijden: ${s.tijden}`)
  .join("\n\n")}

${heeftEind ? `### eind (vanaf ${perScene.find((s) => s.id === "eind")?.start.toFixed(1)} s): tekent het systeem zelf
Stem: ${plan.eind.tekst}
Gebruik precies: eind: { regel1: ${JSON.stringify(plan.eind.regel1)}, regel2: ${JSON.stringify(plan.eind.regel2)}, knop: ${JSON.stringify(plan.eind.knop)} }
` : ""}
De beschrijving bij "Beeld" is wat de klant verwacht te zien; werk die uit tot een sterke compositie en vul aan waar het de uitleg helpt. Let op: de transcriptie schrijft sommige woorden anders dan het script (cijfers, samenstellingen); kies voor wt woorden die in de lijst met woordtijden staan.`;
}

// ── Wijzigingen ──────────────────────────────────────────────────────────────
// Een controleronde gaf eerst de complete code opnieuw terug, ook als er drie regels
// veranderden: drie keer hetzelfde lange stuk schrijven was het grootste deel van de kosten.
// Nu geeft Claude alleen de stukken terug die anders moeten, als zoek-en-vervang-blokken.

const WIJZIG_UITLEG = `Geef in deze ronde NIET de complete code terug, maar alleen de stukken die anders moeten, elk als een blok in precies deze vorm:

<<<<<<< ZOEK
(de regels die nu in de code staan, letterlijk gekopieerd, inclusief inspringing)
=======
(wat ervoor in de plaats komt)
>>>>>>> KLAAR

Regels voor de blokken:
- De tekst onder ZOEK moet letterlijk en precies één keer in de code voorkomen. Neem genoeg regels mee om hem uniek te maken, maar niet meer dan nodig.
- Iets toevoegen: neem de regel ervoor onder ZOEK en herhaal die in de vervanging, met de nieuwe regels erachter. Iets weghalen: laat de vervanging leeg.
- Moet een waarde op meerdere plekken anders, geef dan per plek een blok.
- De blokken worden in jouw volgorde toegepast; elk blok zoekt in de code zoals die is ná de blokken ervoor.
- Geen uitleg ervoor, ertussen of erna.`;

export interface Wijziging {
  zoek: string;
  nieuw: string;
}

/** De zoek-en-vervang-blokken uit het antwoord halen. */
export function wijzigingenUit(tekst: string): Wijziging[] {
  return [...tekst.matchAll(/<{7} ZOEK[^\n]*\n([\s\S]*?)\n?={7}[^\n]*\n([\s\S]*?)\n?>{7} KLAAR/g)].map((m) => ({ zoek: m[1], nieuw: m[2] }));
}

/**
 * Past de blokken toe. Een blok dat niet precies één keer past, wordt overgeslagen en
 * gemeld: half toepassen op de verkeerde plek maakt de code stuk zonder dat iemand het ziet.
 */
export function pasToe(code: string, ws: Wijziging[]): { code: string; mis: string[] } {
  const mis: string[] = [];
  ws.forEach((w, i) => {
    const eerste = w.zoek.split("\n").find((r) => r.trim())?.trim().slice(0, 80) ?? "";
    const aantal = w.zoek ? code.split(w.zoek).length - 1 : 0;
    if (aantal === 1) code = code.replace(w.zoek, () => w.nieuw);
    else mis.push(`Blok ${i + 1} (begint met "${eerste}"): de tekst onder ZOEK staat ${aantal === 0 ? "niet letterlijk" : `${aantal} keer`} in de code.`);
  });
  return { code, mis };
}

function terugkoppeling(p: Proef, code: string, laatste: boolean): Blok[] {
  const blokken: Blok[] = [{ type: "text", text: `Dit is de code van de animatie zoals hij nu is:\n\n\`\`\`js\n${code}\n\`\`\`` }];
  const kapot = p.fouten.filter(ernstig);
  if (!p.beelden.length) {
    blokken.push({
      type: "text",
      text: `De code werkt nog niet; er konden geen beelden van gemaakt worden.\n\nFouten:\n${p.fouten.map((f) => `- ${f}`).join("\n")}\n\nHerstel dit. ${WIJZIG_UITLEG}`,
    });
    return blokken;
  }
  blokken.push({ type: "text", text: "Dit zijn proefbeelden van deze animatie, per scene halverwege en vlak voor het einde van de scene (het volste moment)." });
  for (const b of p.beelden) {
    blokken.push({ type: "text", text: `Scene ${b.scene}, t = ${b.t} s:` });
    blokken.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.jpg.toString("base64") } });
  }
  blokken.push({
    type: "text",
    text: `${p.fouten.length ? `De automatische controle meldt:\n${p.fouten.map((f) => `- ${f}`).join("\n")}\n\n` : "De automatische controle vond geen fouten in de code en geen tekst buiten beeld.\n\n"}Bekijk de beelden zoals een strenge art director dat zou doen, voordat dit naar de klant gaat. Waar het om gaat: teksten of vormen die over elkaar heen staan of buiten beeld vallen; iets dat door het merk linksboven of de titel rechtsboven loopt; een scene die leeg of scheef oogt, waarvan het hoofdbeeld te klein is of waar een helft van het beeld ongebruikt blijft (kijk daarvoor juist naar het beeld halverwege de scene); tekst die te klein is om te lezen; een beeld dat niet uitlegt wat de stem zegt; iets dat er onaf of slordig uitziet.

${kapot.length ? "Er zitten nog fouten in de code, dus die moeten er in elk geval uit. " : ""}${laatste ? "Dit is de laatste ronde: verbeter alleen wat echt fout is en verander niets dat goed werkt. " : ""}Is alles goed genoeg voor de klant, antwoord dan alleen met het woord GOED. Is er iets te verbeteren: ${WIJZIG_UITLEG}`,
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
  /** Een bestaand ontwerp om na te kijken, in plaats van een nieuw te tekenen (voor proeven). */
  startCode?: string;
  /** Bij een lange video: welk hoofdstuk dit is, en wat ervoor en erna te zien is. */
  plek?: { nummer: number; aantal: number; laatste: boolean; hiervoor: string; hierna: string };
  /** De taal van de stem en van de tekst in beeld. Standaard Nederlands. */
  taal?: "nl" | "en";
  /** Wat voor video het is; standaard een bedrijfsvideo. */
  soort?: MotionSoort;
}

export interface AnimatieUitkomst {
  code: string;
  gebruik: Gebruik;
  /** Wat er na de laatste controle nog aan schoonheidsfouten overbleef (voor het logboek). */
  rest: string[];
  einde: number;
}

/** De begintijden van de scenes, zoals de kern ze ook bepaalt: via een lege video. */
export async function sceneTijden(pagina: Omit<PaginaInvoer, "code">): Promise<Proef> {
  return proef({ ...pagina, code: "window.VIDEO = { bouw() {}, teken() {} };" });
}

const alleTekst = (m: Anthropic.Beta.BetaMessage) => m.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");

export async function tekenAnimatie(v: AnimatieVraag, opVoortgang?: (tekst: string) => void): Promise<AnimatieUitkomst> {
  const leeg = await sceneTijden(v.pagina);
  if (!leeg.scenes.length) throw new Error("De scenes konden niet op de stem worden gelegd.");
  const sys = await systeem();
  const voorbeelden = v.beelden?.length ? await beeldBlokken(v.beelden, true) : [];
  const taak = opdracht(v, leeg.scenes, leeg.einde);
  const gebruik: Gebruik = { usd: 0, rondes: 0, sec: 0, usdOntwerp: 0, usdControle: 0 };

  // Alleen voor proeven: het ontwerp door een ander model of met minder denkwerk laten maken.
  const ontwerpModel = process.env.MOTION_ONTWERP_MODEL || MODEL;
  // "low": gemeten op hetzelfde script (12-11-2026) kostte het ontwerp op "medium" $0,81 en
  // 5,5 minuut, op "low" $0,30 en 2 minuten, met een video die er net zo verzorgd uitziet;
  // het meeste denkwerk op "medium" ging niet in het beeld zitten. Sonnet 5.5 was nog iets
  // goedkoper ($0,20) maar tekende slordiger.
  const ontwerpEffort = (process.env.MOTION_ONTWERP_EFFORT || "low") as "low" | "medium" | "high";

  async function vraag(model: string, berichten: Bericht[], soort: "usdOntwerp" | "usdControle") {
    const begin = Date.now();
    const antwoord = await claude()
      .beta.messages.stream({
        model,
        max_tokens: 48000,
        // De vaste uitleg is voor elke video gelijk en wordt gecachet.
        system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
        messages: berichten,
        // De controleronde met proefbeelden vangt meer fouten dan langer nadenken vooraf.
        output_config: { effort: soort === "usdOntwerp" ? ontwerpEffort : "medium" },
        // Weigert het model iets op een beleidsgrond, dan neemt een passend model het over.
        // Het kleinste model kent die overname niet.
        ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01" as const], fallbacks: "default" as const }),
      })
      .finalMessage();
    const usd = kosten(model, antwoord.usage);
    if (process.env.MOTION_DEBUG_DIR) console.log(`  ${soort} ${model}: $${usd.toFixed(3)}, ${Math.round((Date.now() - begin) / 1000)} s`, JSON.stringify({ in: antwoord.usage.input_tokens, uit: antwoord.usage.output_tokens, lees: antwoord.usage.cache_read_input_tokens, schrijf: antwoord.usage.cache_creation_input_tokens }));
    gebruik.usd += usd;
    gebruik[soort] = (gebruik[soort] ?? 0) + usd;
    gebruik.sec = (gebruik.sec ?? 0) + Math.round((Date.now() - begin) / 1000);
    if (antwoord.stop_reason === "refusal") throw new Error("Over dit onderwerp kunnen we geen animatie maken. Probeer het anders te omschrijven.");
    return antwoord;
  }

  async function bewaar(ronde: number, code: string, p: Proef) {
    // Voor onderzoek: elke versie met wat de controle ervan vond (scripts/motion-eind-tot-eind).
    if (!process.env.MOTION_DEBUG_DIR) return;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(process.env.MOTION_DEBUG_DIR, `ronde${ronde}.js`), code).catch(() => {});
    await writeFile(path.join(process.env.MOTION_DEBUG_DIR, `ronde${ronde}.fouten.json`), JSON.stringify(p.fouten, null, 1)).catch(() => {});
  }

  // ── Het ontwerp: de eerste complete versie, door het beste model ──
  let code = v.startCode ?? null;
  let laatsteFout = "";
  if (!code) {
    opVoortgang?.("tekenen");
    const berichten: Bericht[] = [{ role: "user", content: [...voorbeelden, { type: "text", text: taak }] }];
    // Eén herkansing als er geen code terugkomt (te lang, of alleen tekst).
    for (let poging = 0; poging < 2 && !code; poging++) {
      const antwoord = await vraag(ontwerpModel, berichten, "usdOntwerp");
      code = codeUit(alleTekst(antwoord));
      if (code) break;
      laatsteFout = antwoord.stop_reason === "max_tokens" ? "De code werd te lang." : "Er kwam geen code terug.";
      // Het hele antwoord terug in het gesprek, ook de denkblokken: die horen erbij.
      berichten.push({ role: "assistant", content: antwoord.content });
      berichten.push({ role: "user", content: `${laatsteFout} Geef de complete code in één js-blok dat window.VIDEO zet${antwoord.stop_reason === "max_tokens" ? ", en houd hem compacter" : ""}.` });
    }
    if (!code) throw new Error(`De animatie kon niet worden gemaakt. ${laatsteFout}`.trim());
  }
  gebruik.rondes = 1;
  let p = await proef({ ...v.pagina, code });
  await bewaar(0, code, p);

  // De beste versie tot nu toe: de laatste zonder kapotte code. Een verbeterronde die
  // iets stukmaakt, mag een werkende versie niet verdringen.
  let beste: { code: string; proef: Proef } | null = null;
  const keur = (c: string, pr: Proef) => {
    const kapot = pr.fouten.filter(ernstig);
    if (!kapot.length && pr.beelden.length) beste = { code: c, proef: pr };
    else laatsteFout = kapot[0] ?? "De code gaf geen beeld.";
  };
  keur(code, p);

  // ── De controlerondes: elke ronde een nieuw, kort gesprek ──
  // Niet doorpraten in het gesprek van het ontwerp: dan betaal je elke ronde opnieuw voor
  // alle eerdere versies en proefbeelden, en een ander model kan de denkblokken van het
  // eerste niet lezen. De opdracht staat vooraan en wordt gecachet voor de ronde erna.
  for (let ronde = 1; ronde <= MAX_RONDES; ronde++) {
    opVoortgang?.(`controleronde ${ronde}`);
    const berichten: Bericht[] = [
      {
        role: "user",
        content: [...voorbeelden, { type: "text", text: taak, cache_control: { type: "ephemeral" } }, ...terugkoppeling(p, code, ronde === MAX_RONDES)],
      },
    ];
    let antwoord = await vraag(CONTROLE_MODEL, berichten, "usdControle");
    gebruik.rondes = ronde + 1;
    let tekst = alleTekst(antwoord);
    let nieuw = codeUit(tekst);
    if (!nieuw) {
      let ws = wijzigingenUit(tekst);
      // "GOED": de versie is goedgekeurd. Dat geldt alleen als er ook echt niets te wijzigen viel.
      if (!ws.length && /\bGOED\b/.test(tekst)) {
        if (beste) break;
        continue;
      }
      let uit = pasToe(code, ws);
      if (uit.mis.length || !ws.length) {
        // Eén herkansing in hetzelfde gesprek: wat wel paste is al toegepast.
        berichten.push({ role: "assistant", content: antwoord.content });
        berichten.push({
          role: "user",
          content: ws.length
            ? `Deze blokken konden niet worden toegepast (de andere wel):\n${uit.mis.map((m) => `- ${m}`).join("\n")}\n\nGeef alleen deze blokken opnieuw, met onder ZOEK tekst die letterlijk en precies één keer in de code staat.`
            : `Er kwamen geen bruikbare blokken terug. ${WIJZIG_UITLEG}`,
        });
        antwoord = await vraag(CONTROLE_MODEL, berichten, "usdControle");
        tekst = alleTekst(antwoord);
        ws = wijzigingenUit(tekst);
        // Wat nu nog niet past laten we zitten: de rest van de verbeteringen telt wel.
        uit = pasToe(uit.code, ws);
      }
      nieuw = uit.code;
    }
    if (nieuw === code) continue;
    code = nieuw;
    p = await proef({ ...v.pagina, code });
    await bewaar(ronde, code, p);
    keur(code, p);
  }

  const klaar = beste as { code: string; proef: Proef } | null;
  if (!klaar) throw new Error(`De animatie kon niet foutloos worden gemaakt. ${laatsteFout}`.trim());
  return { code: klaar.code, gebruik, rest: klaar.proef.fouten, einde: klaar.proef.einde };
}
