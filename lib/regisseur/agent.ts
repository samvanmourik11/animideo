// DE REGISSEUR — Claude als regisseur die de gereedschappen van de app aanstuurt.
//
// Een eigen lus in plaats van de tool runner van de SDK: het gesprek moet kunnen pauzeren
// (een vraag met knoppen, een bevestiging voor credits, wachten op video's die minuten
// duren) en later in een ánder verzoek verdergaan. Daarom staat alles in de database
// (regie_projecten) en draait elke ronde in een serverfunctie.
//
// Twee regels van de API die we bewaken:
//   - alle tool-resultaten van één antwoord gaan samen terug in één bericht, in volgorde;
//   - het gesprek wordt alleen aangevuld, nooit herschreven (het meedenken van het model
//     is aan de geschiedenis gebonden).

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { verversLopende } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { tijd } from "./video";
import { binnenBudget, taakRun } from "./taken";
import { BETAALDE_TOOLS, GRATIS_TOOLS, TOOLS, bereidVoor, bouwOpties, gratis, leesGeheugen, voerUit, type Optie, type Stap } from "./tools";

const MODEL = "claude-opus-5-5";
const MAX_RONDES = 12;

// Opus 5.5, per miljoen tokens (stand 06-10-2026): in $4, uit $20, cache lezen $0,20, schrijven $5.
const PRIJS = { in: 4, uit: 20, cacheLezen: 0.2, cacheSchrijven: 5 };

type Bericht = Anthropic.Beta.BetaMessageParam;
type Resultaat = Anthropic.Beta.BetaToolResultBlockParam;

export type Wachtend =
  | { soort: "antwoord"; toolUseId: string; vraag: string; opties: Optie[]; meerdere: boolean; volgorde: string[]; klaar: Record<string, Resultaat> }
  | { soort: "bevestiging"; stappen: Stap[]; totaal: number; volgorde: string[]; klaar: Record<string, Resultaat>; wachtId?: string; wachtIds?: string[] }
  | { soort: "maken"; toolUseId: string; ids: string[]; volgorde: string[]; klaar: Record<string, Resultaat> };

export interface RegieProject {
  id: string;
  user_id: string;
  titel: string;
  berichten: Bericht[];
  status: string;
  wachtend: Wachtend | null;
  foutmelding: string | null;
  galerij: string[];
  automatisch: boolean;
  gebruik: { input?: number; output?: number; cacheLezen?: number; cacheSchrijven?: number; usd?: number };
}

const SYSTEEM = `Je bent de Regisseur van Animideo, een Nederlandse app om beelden en video's met AI te maken. Je praat Nederlands, kort en hartelijk, zonder jargon, en je regelt het werk voor de gebruiker met je gereedschappen.

Werkwijze:
- Begrijp eerst wat de gebruiker wil. Ontbreekt er iets wezenlijks (doel, stijl, lengte, formaat), stel dan één vraag met vraag_keuze in plaats van te gokken. Vraag niet meer dan nodig.
- Laat de gebruiker zelf kiezen bij persoonlijke smaakkeuzes, met het menu van vraag_keuze: welke creator (soort 'creator'), welke stem (soort 'stem'), welke versie van een beeld (soort 'beeld'), welke stijl of richting (soort 'tekst', met korte uitleg per optie). Kies dat niet zelf, tenzij de gebruiker zegt dat jij mag kiezen of het al in het geheugen staat. Eén vraag per keer. Bij een stem (voice-over of UGC-video): denk eerst na over het verhaal, de toon en het publiek, zoek dan met zoek_stemmen 3-5 stemmen waarvan de typering en beschrijving daar echt bij passen (verschillend genoeg om te kiezen, de beste eerst), en geef ze via vraag_keuze soort 'stem' met per stem één korte zin waarom hij past. Gebruik daarna het gekozen stem-id. Bij een UGC-video: eerst de creator, dan de stem; zet de vaste stem van de creator als één van de opties als die in de bibliotheek staat, anders vermeld je hem in de vraag. Zet de vraag alleen in vraag_keuze, niet ook nog eens in je tekst (die verschijnen allebei op het scherm).
- Gaat het om een bedrijf of merk: kijk eerst met lees_huisstijl (stil, zonder erover te praten) en gebruik kleuren, toon, logo en wat niet mag in alles wat je maakt.
- Maak een kort plan (welke beelden, welke clips, welke montage) en voer het uit. Elke betaalde stap wordt de gebruiker vooraf voorgelegd; je hoeft niet zelf om toestemming te vragen.
- Houd personages, gezichten en producten gelijk door steeds dezelfde voorbeelden (creatie-ids of foto-adressen) mee te geven aan maak_beeld.
- Start wat tegelijk kan in één keer (bijvoorbeeld alle beelden), en gebruik daarna wacht_op. Bekijk de resultaten kritisch; is iets mislukt of klopt het niet, maak alleen dat opnieuw.
- Werk zuinig: niet meer beelden of video's dan nodig. Een korte film of reclame: meestal 3-6 clips, dan monteer.
- Voor een complete productreclame, een UGC-video (een creator die over een product of dienst praat) of een filmtrailer zijn er kant-en-klare studio's: maak_reclame, maak_ugc_video (kies eerst een creator met ugc_creators) en maak_trailer. Die leveren in één stap een afgemonteerde video en zijn meestal beter dan zelf losse clips aan elkaar zetten.
- Je hebt een geheugen over deze gebruiker (onderaan). Gebruik het: huisstijl, bedrijfsnaam, voorkeuren. Vertelt de gebruiker iets dat ook voor volgende projecten geldt, sla het dan op met onthoud (kort), zonder erover te zeuren.
- Sluit af met een korte samenvatting van wat er gemaakt is en wat de gebruiker nog kan laten aanpassen.
- Geen echte bestaande personen, geen merken van anderen namaken, niets misleidends.

Verhaal eerst (bij elke video met een boodschap of verhaal; niet bij losse beelden of een simpele opdracht):
- Schrijf eerst het script en zet het als gewoon bericht in de chat: per scène één regel (wat je ziet + wat er gezegd wordt). Vraag in één zin of het zo goed is; geen formulieren, geen extra stappen.
- Reclame, uitleg of bedrijfsvideo: volg de huisformule. 1) Hook: direct tegen de kijker (je/jij), een herkenbaar probleem, "Wist je dat…?" of "Droom jij van…?". 2) Het merk als antwoord ("Daarom is er X…"). 3) Hoe het werkt (stappen of kernpunten). 4) Wat het oplevert (rust, tijd, zekerheid). 5) Afsluiter: merknaam, belofte, website. Warm, spreektaal, 1-3 korte zinnen per scène.
- Een verhaal (sprookje, karakters, film): een begin, een probleem, iets wat tegenzit, een omslag die je ZIET gebeuren en een slot. De personen over wie het gaat, staan zelf in beeld. Een paar personages die alleen tegen elkaar praten zonder conflict is geen verhaal.
- Lees je eigen script kritisch voor je het laat zien: zit de oplossing al in de eerste regels, gebeurt de omslag buiten beeld, is het saai? Verbeter het dan eerst.

Storyboard (bij video's van 3 of meer scènes, tenzij het project op automatisch staat):
- Is het script goed, maak dan per scène één schets met maak_beeld in kwaliteit 'standaard' (goedkoop), wacht_op, en laat ze zien met vraag_keuze soort 'storyboard' (beeld_ids op volgorde, bijschriften per scène). Zeg erbij wat dat kostte.
- Goedgekeurd: maak de eindbeelden in kwaliteit 'pro' met de schets als voorbeeld (zelfde compositie), dan pas de clips. Feedback: maak alleen de scènes opnieuw die anders moeten en laat het storyboard nog één keer zien.
- Dit is het controlemoment. Ga na de clips niet zelf op zoek naar fouten om opnieuw te maken; dat kost veel en lost zelden iets op.

Films (de filmstudio): een film van een paar minuten bouw je SAMEN met de gebruiker, scène voor scène. Werkwijze:
1. Verhaal: begrijp het verhaal. Heeft de gebruiker een script geüpload, lees het en volg het (vraag alleen wat echt ontbreekt). Anders werk je het verhaal samen uit: stel een korte opzet voor (logline + scènes in één regel elk) en vraag of het zo goed is.
2. film_opzet: titel, logline, de filmlook (stijl, Engels) en de taal. Zelfde film = zelfde look in elk beeld.
3. Cast: per personage een portret (maak_beeld, kwaliteit pro, neutrale donkere achtergrond, gezicht goed zichtbaar; laat de gebruiker bij hoofdpersonen kiezen uit versies) en een vaste stem (zoek_stemmen, laat de gebruiker kiezen met vraag_keuze soort 'stem'). Terugkerende wezens/voorwerpen krijgen ook een referentiebeeld. Zet alles met film_cast.
4. Per scène: film_scene_schrijf (shots van 1,5-4,2 s; wie praat staat in een (medium) close-up in beeld en krijgt lipsync; wissel close-ups, wijde shots en details af; plek en licht per scène vast), daarna film_scene_maak, wacht_op, en stuur de scène ter keuring met vraag_keuze soort 'scene' (scene_nummer). Maak niet meer dan één scène tegelijk zonder dat de gebruiker de vorige heeft gezien, tenzij hij zegt dat het mag.
5. Keuring: "goedgekeurd" → film_scene_keur goedgekeurd, door naar de volgende scène. Feedback → film_scene_keur met de feedback, herschrijf ALLEEN de shots die anders moeten (houd de id's van de rest gelijk, dan blijven die staan en kosten ze niets), maak hem opnieuw en stuur hem weer ter keuring.
6. Zijn alle scènes goedgekeurd: film_monteer, wacht_op, en geef de link.
Gebruik film_bekijk om de stand te zien (ook na een pauze). Een film is een dure functie: noem bij elke scène wat hij kost.

Vaste taken: wil de gebruiker iets regelmatig laten maken ("elke week", "iedere maandag", "elke maand"), stel dan voor er een vaste taak van te maken. Vraag met vraag_keuze (soort 'tekst') één keer om akkoord op ritme, tijdstip en maximum aan credits per keer, en leg hem daarna vast met vaste_taak. Een vaste taak maak je alleen als de gebruiker erom vraagt of instemt.

Social media: wil de gebruiker posts voor Instagram, TikTok, Facebook, YouTube of X over een periode (een contentkalender), gebruik dan de Social-studio: social_kanalen, één akkoordvraag, dan maak_contentkalender. Daarna vat je de ideeën kort samen en geef je de link; goedkeuren doet de gebruiker op de kalender zelf. Een losse post nu maken kan gewoon met maak_beeld. Zijn er nog geen kanalen gekoppeld, verwijs dan naar de Social-studio.`;

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("De Claude-sleutel (ANTHROPIC_API_KEY) ontbreekt nog.");
  return (client ??= new Anthropic());
}

async function laad(id: string): Promise<RegieProject> {
  const { data } = await createServiceClient().from("regie_projecten").select("*").eq("id", id).single();
  if (!data) throw new Error("Project niet gevonden.");
  return data as RegieProject;
}

async function bewaar(id: string, wijziging: Partial<RegieProject>) {
  await createServiceClient()
    .from("regie_projecten")
    .update({ ...wijziging, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Neemt het project over voor een ronde, alleen als het nu in een van deze toestanden staat. */
export async function neemOver(id: string, van: string[]): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("regie_projecten")
    .update({ status: "denkt", foutmelding: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", van)
    .select("id");
  return !!data?.length;
}

function resultaatTekst(id: string, tekst: string, fout = false): Resultaat {
  return { type: "tool_result", tool_use_id: id, content: tekst, ...(fout ? { is_error: true } : {}) };
}

/** De tool-resultaten in de volgorde van de aanroepen, als één gebruikersbericht. */
function resultatenBericht(volgorde: string[], klaar: Record<string, Resultaat>): Bericht {
  return { role: "user", content: volgorde.map((id) => klaar[id] ?? resultaatTekst(id, "Niet uitgevoerd.", true)) };
}

/**
 * Laat Claude verder werken tot hij klaar is of moet pauzeren. Wordt aangeroepen nadat
 * het project is overgenomen (status 'denkt').
 */
export async function draai(id: string): Promise<void> {
  const p = await laad(id);
  const berichten = [...p.berichten];
  const gebruik = { ...p.gebruik };
  const galerij = [...p.galerij];
  try {
    for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
      const geheugen = await leesGeheugen(p.user_id);
      const antwoord = await claude()
        .beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          // De vaste tekst (en de gereedschappen ervoor) is voor iedereen gelijk en wordt
          // gecachet; het geheugen verschilt per gebruiker en staat erachter. De cache
          // bovenaan het verzoek neemt daarnaast het hele gesprek tot nu toe mee, zodat
          // elke volgende ronde de geschiedenis voor ~een tiende van de prijs leest.
          system: [
            { type: "text", text: SYSTEEM, cache_control: { type: "ephemeral" } },
            { type: "text", text: geheugen ? `Wat je blijvend over deze gebruiker weet:\n${geheugen}` : "Je weet nog niets blijvends over deze gebruiker." },
            { type: "text", text: p.automatisch ? "Dit project staat op automatisch: de gebruiker wil niet steeds bevestigen. Sla het storyboard over." : "Dit project staat niet op automatisch." },
          ],
          cache_control: { type: "ephemeral" },
          tools: TOOLS,
          messages: berichten,
          output_config: { effort: "medium" },
          // Weigert het model iets op een beleidsgrond, dan neemt een passend model het over.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        })
        .finalMessage();

      const u = antwoord.usage;
      gebruik.input = (gebruik.input ?? 0) + u.input_tokens;
      gebruik.output = (gebruik.output ?? 0) + u.output_tokens;
      gebruik.cacheLezen = (gebruik.cacheLezen ?? 0) + (u.cache_read_input_tokens ?? 0);
      gebruik.cacheSchrijven = (gebruik.cacheSchrijven ?? 0) + (u.cache_creation_input_tokens ?? 0);
      gebruik.usd =
        ((gebruik.input ?? 0) * PRIJS.in + (gebruik.output ?? 0) * PRIJS.uit + (gebruik.cacheLezen ?? 0) * PRIJS.cacheLezen + (gebruik.cacheSchrijven ?? 0) * PRIJS.cacheSchrijven) / 1e6;

      berichten.push({ role: "assistant", content: antwoord.content });

      if (antwoord.stop_reason === "refusal") {
        await bewaar(id, { berichten, gebruik, status: "fout", foutmelding: "Dit verzoek kan de Regisseur niet uitvoeren.", wachtend: null });
        return;
      }
      if (antwoord.stop_reason === "pause_turn") continue;

      const aanroepen = antwoord.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (!aanroepen.length) {
        await bewaar(id, { berichten, gebruik, galerij, status: "klaar", wachtend: null });
        return;
      }

      const volgorde = aanroepen.map((b) => b.id);
      const klaar: Record<string, Resultaat> = {};
      for (const b of aanroepen.filter((x) => GRATIS_TOOLS.has(x.name))) {
        try {
          klaar[b.id] = resultaatTekst(b.id, await gratis(p.user_id, b, p.id));
        } catch (e) {
          klaar[b.id] = resultaatTekst(b.id, e instanceof Error ? e.message : String(e), true);
        }
      }

      const vraag = aanroepen.find((b) => b.name === "vraag_keuze");
      if (vraag) {
        for (const b of aanroepen) if (b.id !== vraag.id && !klaar[b.id]) klaar[b.id] = resultaatTekst(b.id, "Uitgesteld: eerst het antwoord op je vraag.", true);
        const i = vraag.input as Record<string, unknown>;
        await bewaar(id, {
          berichten, gebruik, galerij, status: "wacht_op_antwoord",
          wachtend: { soort: "antwoord", toolUseId: vraag.id, vraag: String(i.vraag ?? ""), opties: await bouwOpties(p.user_id, i, p.id), meerdere: i.meerdere === true, volgorde, klaar },
        });
        return;
      }

      const stappen: Stap[] = [];
      for (const b of aanroepen.filter((x) => BETAALDE_TOOLS.has(x.name))) {
        try {
          stappen.push(await bereidVoor(p.user_id, b, p.id));
        } catch (e) {
          klaar[b.id] = resultaatTekst(b.id, e instanceof Error ? e.message : String(e), true);
        }
      }
      const wacht = aanroepen.find((b) => b.name === "wacht_op");

      // Een vaste taak draait zonder iemand erbij: zelf doorgaan zolang het binnen het
      // plafond van deze uitvoering blijft; daarboven wacht hij op de gebruiker (die een mail krijgt).
      const run = stappen.length ? await taakRun(p.id) : null;
      const zelf = p.automatisch || (!!run && (await binnenBudget(run, stappen.reduce((s, x) => s + x.credits, 0))));
      if (stappen.length && !zelf) {
        await bewaar(id, {
          berichten, gebruik, galerij, status: "wacht_op_bevestiging",
          wachtend: {
            soort: "bevestiging", stappen, totaal: stappen.reduce((s, x) => s + x.credits, 0), volgorde, klaar,
            ...(wacht ? { wachtId: wacht.id, wachtIds: ((wacht.input as { creatie_ids?: string[] }).creatie_ids ?? []).map(String) } : {}),
          },
        });
        return;
      }
      for (const s of stappen) {
        try {
          const cid = await voerUit(p.user_id, s);
          galerij.push(cid);
          klaar[s.toolUseId] = resultaatTekst(s.toolUseId, `Gestart: creatie ${cid}. Gebruik wacht_op om het resultaat te zien.`);
        } catch (e) {
          klaar[s.toolUseId] = resultaatTekst(s.toolUseId, e instanceof Error ? e.message : String(e), true);
        }
      }

      if (wacht) {
        const ids = ((wacht.input as { creatie_ids?: string[] }).creatie_ids ?? []).map(String);
        await bewaar(id, { berichten, gebruik, galerij, status: "wacht_op_maken", wachtend: { soort: "maken", toolUseId: wacht.id, ids, volgorde, klaar } });
        return;
      }
      berichten.push(resultatenBericht(volgorde, klaar));
    }
    await bewaar(id, { berichten, gebruik, galerij, status: "klaar", wachtend: null });
  } catch (e) {
    console.error("[regisseur]", e);
    await bewaar(id, {
      berichten, gebruik, galerij, status: "fout", wachtend: null,
      foutmelding: e instanceof Anthropic.APIError ? `Claude gaf een fout (${e.status}). Probeer het opnieuw.` : e instanceof Error ? e.message : String(e),
    });
  }
}

// ── Bijlagen ─────────────────────────────────────────────────────────────

export interface BijlageInvoer {
  soort?: unknown;
  id?: unknown;
  url?: unknown;
  naam?: unknown;
}

const MAX_BIJLAGEN = 8;

/**
 * Tekst + bijlagen → wat Claude krijgt. Foto's en video's alleen uit de eigen bibliotheek (opnieuw
 * opgezocht, nooit een adres uit de browser overnemen), pdf's alleen uit de eigen map in
 * onze opslag. Geeft ook de foto- en video-ids terug, die horen in de galerij van het project.
 */
export async function maakInhoud(
  userId: string,
  tekst: string,
  bijlagen: BijlageInvoer[] = [],
): Promise<{ inhoud: string | Anthropic.Beta.BetaContentBlockParam[]; fotoIds: string[] }> {
  const lijst = bijlagen.slice(0, MAX_BIJLAGEN);
  if (!lijst.length) return { inhoud: tekst, fotoIds: [] };
  const blokken: Anthropic.Beta.BetaContentBlockParam[] = [];
  const fotoIds: string[] = [];
  const ids = lijst.filter((b) => b.soort === "beeld" || b.soort === "video").map((b) => String(b.id ?? ""));
  const { data } = ids.length
    ? await createServiceClient().from("creaties").select("id, soort, url, prompt, invoer").eq("user_id", userId).in("id", ids)
    : { data: [] as { id: string; soort: string; url: string | null; prompt: string | null; invoer: Record<string, unknown> | null }[] };
  for (const b of lijst) {
    const naam = String(b.naam ?? "bestand").slice(0, 120);
    if (b.soort === "beeld") {
      const c = (data ?? []).find((x) => x.id === b.id);
      if (!c?.url) continue;
      blokken.push({ type: "image", source: { type: "url", url: c.url } });
      blokken.push({ type: "text", text: `(Bijlage: foto "${naam}", creatie-id ${c.id}. Bruikbaar als voorbeeld in maak_beeld, maak_video en gebruik_app.)` });
      fotoIds.push(c.id);
    } else if (b.soort === "video") {
      // Claude ziet geen video: de beelden en de uitgeschreven tekst van het inlezen.
      const c = (data ?? []).find((x) => x.id === b.id && x.soort === "video");
      const v = (c?.invoer ?? {}) as { duur?: number; beelden?: { t: number; url: string }[]; tekst?: string };
      if (!c?.url || !v.beelden?.length) continue;
      blokken.push({
        type: "text",
        text:
          `(Bijlage: video "${naam}", adres ${c.url} , creatie-id ${c.id}, ${Math.round(v.duur ?? 0)} s. Je kunt hem niet afspelen; hieronder ${v.beelden.length} stilstaande beelden, in deze volgorde:\n` +
          v.beelden.map((x) => `${tijd(x.t)} ${x.url}`).join("\n") +
          (v.tekst ? `\nWat er gezegd wordt:\n${v.tekst}\n` : "\nEr wordt niets gezegd.\n") +
          `De video is bruikbaar als clip in monteer; een beeld eruit als voorbeeld in maak_beeld of gebruik_app via het adres.)`,
      });
      for (const x of v.beelden) blokken.push({ type: "image", source: { type: "url", url: x.url } });
      fotoIds.push(c.id);
    } else if (b.soort === "document") {
      const url = String(b.url ?? "");
      if (!url.includes(`/scene-assets/${userId}/creaties/`)) continue;
      if (url.endsWith(".pdf")) blokken.push({ type: "document", source: { type: "url", url }, title: naam });
      else if (url.endsWith(".txt") && eigenOpslag(url, userId)) {
        // Een script als tekst (Word of .txt/.fountain, omgezet bij het uploaden).
        const res = await fetch(url);
        if (res.ok) blokken.push({ type: "document", source: { type: "text", media_type: "text/plain", data: await res.text() }, title: naam });
      }
    }
  }
  blokken.push({ type: "text", text: tekst || "(Zie de bijlage.)" });
  return { inhoud: blokken, fotoIds };
}

/** Alleen onze eigen Supabase-opslag, map van deze gebruiker: die tekst halen wij zelf op. */
function eigenOpslag(url: string, userId: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".supabase.co") && u.pathname.startsWith(`/storage/v1/object/public/scene-assets/${userId}/creaties/`);
  } catch {
    return false;
  }
}

// ── Verder na een pauze ──────────────────────────────────────────────────

/** Een nieuw bericht van de gebruiker. Tijdens een pauze telt het als antwoord of als nee. */
export async function nieuwBericht(p: RegieProject, tekst: string, bijlagen: BijlageInvoer[] = []): Promise<void> {
  const w = p.wachtend;
  if (w?.soort === "antwoord") return beantwoord(p, tekst, bijlagen);
  // Bijlagen bij een "nee" zouden verloren gaan: dan eerst nee, en het bericht erachteraan.
  if (w?.soort === "bevestiging" && !bijlagen.length) return bevestig(p, false, tekst);
  const { inhoud, fotoIds } = await maakInhoud(p.user_id, tekst, bijlagen);
  if (w?.soort === "bevestiging") {
    const klaar = { ...w.klaar };
    for (const s of w.stappen) klaar[s.toolUseId] = resultaatTekst(s.toolUseId, "De gebruiker stuurde eerst een nieuw bericht; dit is niet gestart.", true);
    if (w.wachtId) klaar[w.wachtId] = resultaatTekst(w.wachtId, "Niet gewacht: er is niets gestart.", true);
    p = { ...p, berichten: [...p.berichten, resultatenBericht(w.volgorde, klaar)] };
  }
  await bewaar(p.id, { berichten: [...p.berichten, { role: "user", content: inhoud }], galerij: [...p.galerij, ...fotoIds], wachtend: null });
  await draai(p.id);
}

export async function beantwoord(p: RegieProject, antwoord: string, bijlagen: BijlageInvoer[] = [], waarde?: string): Promise<void> {
  const w = p.wachtend;
  if (w?.soort !== "antwoord") return draai(p.id);
  // Op het scherm staat wat de gebruiker koos ("Chantal"); Claude krijgt er de precieze
  // waarde bij ("creator-id chantal") tussen haakjes, die de weergave weer weglaat.
  const extra = waarde && waarde !== antwoord ? ` [waarde: ${waarde}]` : "";
  const klaar = { ...w.klaar, [w.toolUseId]: resultaatTekst(w.toolUseId, `Antwoord van de gebruiker: ${antwoord}${extra}`) };
  const berichten = [...p.berichten, resultatenBericht(w.volgorde, klaar)];
  // Stuurt de gebruiker bij zijn antwoord een bestand mee, dan komt dat er als gewoon
  // bericht achteraan (twee gebruikersbeurten na elkaar voegt de API samen).
  const { inhoud, fotoIds } = await maakInhoud(p.user_id, "", bijlagen);
  if (fotoIds.length || typeof inhoud !== "string") berichten.push({ role: "user", content: inhoud });
  await bewaar(p.id, { berichten, galerij: [...p.galerij, ...fotoIds], wachtend: null });
  await draai(p.id);
}

export async function bevestig(p: RegieProject, ja: boolean, reden?: string): Promise<void> {
  const w = p.wachtend;
  if (w?.soort !== "bevestiging") return draai(p.id);
  const klaar = { ...w.klaar };
  const galerij = [...p.galerij];
  for (const s of w.stappen) {
    if (!ja) {
      klaar[s.toolUseId] = resultaatTekst(s.toolUseId, `De gebruiker wilde dit niet${reden ? `: ${reden}` : ""}.`, true);
      continue;
    }
    try {
      const cid = await voerUit(p.user_id, s);
      galerij.push(cid);
      klaar[s.toolUseId] = resultaatTekst(s.toolUseId, `Gestart: creatie ${cid}. Gebruik wacht_op om het resultaat te zien.`);
    } catch (e) {
      klaar[s.toolUseId] = resultaatTekst(s.toolUseId, e instanceof Error ? e.message : String(e), true);
    }
  }
  // Wachten op ids die pas net bestaan, kan niet in hetzelfde antwoord; dat zegt het resultaat.
  if (w.wachtId) klaar[w.wachtId] = resultaatTekst(w.wachtId, "Wachten kan pas als de stappen gestart zijn: roep wacht_op opnieuw aan met de nieuwe ids.", true);
  await bewaar(p.id, { berichten: [...p.berichten, resultatenBericht(w.volgorde, klaar)], galerij, wachtend: null });
  await draai(p.id);
}

/**
 * Bij wachten op creaties: de wachtrij laten doorlopen en, als alles klaar is, Claude de
 * resultaten laten zien (beelden ook als plaatje). Geeft true als er een ronde start.
 */
export async function controleerMaken(p: RegieProject): Promise<boolean> {
  const w = p.wachtend;
  if (p.status !== "wacht_op_maken" || w?.soort !== "maken") return false;
  const { data } = await createServiceClient().from("creaties").select("*").eq("user_id", p.user_id).in("id", w.ids);
  const lijst = await verversLopende((data ?? []) as Creatie[]);
  if (lijst.some((c) => c.status === "bezig")) return false;
  if (!(await neemOver(p.id, ["wacht_op_maken"]))) return false;

  const inhoud: Anthropic.Beta.BetaToolResultBlockParam["content"] = [];
  const tekst = w.ids.map((cid) => {
    const c = lijst.find((x) => x.id === cid);
    if (!c) return `${cid}: niet gevonden`;
    return c.status === "klaar" ? `${cid}: klaar (${c.soort}) ${c.url}` : `${cid}: mislukt — ${c.foutmelding ?? "onbekend"}`;
  });
  inhoud.push({ type: "text", text: tekst.join("\n") });
  for (const c of lijst.filter((x) => x.status === "klaar" && x.soort === "beeld" && x.url).slice(0, 8)) {
    inhoud.push({ type: "text", text: `Beeld ${c.id}:` });
    inhoud.push({ type: "image", source: { type: "url", url: c.url! } });
  }
  const klaar = { ...w.klaar, [w.toolUseId]: { type: "tool_result" as const, tool_use_id: w.toolUseId, content: inhoud } };
  await bewaar(p.id, { berichten: [...p.berichten, resultatenBericht(w.volgorde, klaar)], wachtend: null });
  await draai(p.id);
  return true;
}
