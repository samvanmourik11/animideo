// De gereedschappen van de Regisseur: wat Claude in de app mag doen. Elk gereedschap is
// een bestaande maker (beeld, video, apps, montage) of iets gratis (een pagina lezen, je
// werk bekijken). Drie zijn bijzonder, die pauzeren het gesprek: een vraag met knoppen,
// stappen die credits kosten (eerst bevestigen) en wachten tot creaties klaar zijn.
// Alleen op de server.

import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { maakOpdracht, FORMATEN } from "@/lib/creaties/makers";
import { receptOpdracht } from "@/lib/creaties/recepten-opdrachten";
import { RECEPTEN, recept } from "@/lib/creaties/recepten";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { POST_CREDITS } from "@/lib/social/types";
import { MUSIC_CATEGORIES } from "@/lib/music/library";
import { UGC_STEMMEN } from "@/lib/ugc/types";
import { BIBLIOTHEEK, vindStem } from "@/lib/stem/bibliotheek";
import { FILM_BETAALD, FILM_GRATIS, FILM_TOOLS, filmBereidVoor, filmGratis, filmOpties } from "@/lib/film/tools";
import { EIGEN, GEBRUIK_LABEL, type BibliotheekStem } from "@/lib/stem/types";
import { startCreatie } from "@/lib/creaties/wachtrij";
import { leesProductpagina } from "@/lib/reclame/pagina";
import { montageCredits, leesMontage } from "./montage";
import { schrijfUgcScript } from "@/lib/ugc/script";
import { leesCreator, leesOnderwerp } from "@/lib/ugc/regie";
import { CREATORS } from "@/lib/ugc/creators";
import { UGC_LENGTES, ugcCredits, type UgcLengte } from "@/lib/ugc/types";
import { schrijfPlan } from "@/lib/reclame/plan";
import { RECLAME_CREDITS, RECLAME_FORMATEN, STIJLEN, type Product, type ReclameFormaat, type StijlId } from "@/lib/reclame/types";
import { schrijfTrailer } from "@/lib/trailer/plan";
import { TRAILER_LENGTES, trailerCredits, type TrailerLengte } from "@/lib/trailer/types";
import { datumTekst, maakTaak, ritmeTekst } from "./taken";
import { accountsVan } from "@/lib/social/zernio";
import { bedenkIdeeen, maakKalender } from "@/lib/social/kalender";

type Tool = Anthropic.Beta.BetaTool;

export const BETAALDE_TOOLS = new Set([...FILM_BETAALD, "maak_beeld", "maak_voiceover", "maak_video", "gebruik_app", "monteer", "maak_ugc_video", "maak_reclame", "maak_trailer"]);
/** Gratis, meteen uitgevoerd. */
export const GRATIS_TOOLS = new Set([...FILM_GRATIS, "lees_webpagina", "mijn_werk", "ugc_creators", "zoek_stemmen", "onthoud", "vaste_taak", "lees_huisstijl", "social_kanalen", "maak_contentkalender"]);

// De lijst apps staat in de omschrijving van het gereedschap. Die verandert alleen als we
// apps toevoegen, dus de cache van het verzoek blijft gewoon geldig.
const APPS_LIJST = RECEPTEN.map((r) => `${r.id} (${r.naam}${r.soort === "video" ? ", video" : ""}${r.zonderFoto ? ", zonder foto" : ""}${r.tekst?.verplicht ? ", tekst verplicht" : ""})`).join("; ");

export const TOOLS: Tool[] = [
  {
    name: "vraag_keuze",
    description:
      "Laat de gebruiker kiezen via een klikbaar menu; het gesprek pauzeert tot er antwoord is (de gebruiker kan ook zelf iets typen). Soorten: 'creator' toont alle UGC-creators met portret (geen opties nodig), 'stem' toont jouw aanraders uit 'stemmen' (3-5 stuks, gevonden met zoek_stemmen, elk met waarom ze bij dit verhaal passen) met luisterknop, 'beeld' toont de beelden uit beeld_ids naast elkaar (bijv. versies om uit te kiezen, alleen als de gebruiker om meerdere versies vroeg; met meerdere: true mag de gebruiker er meer kiezen), 'storyboard' toont de beelden uit beeld_ids op volgorde met per scène een bijschrift en de knoppen Goedkeuren / Aanpassen, 'tekst' toont de opties als knoppen (2-6, eventueel met korte uitleg). Gebruik dit voor alle echte keuzes in plaats van in je tekst te vragen of zelf te kiezen.",
    input_schema: {
      type: "object",
      properties: {
        vraag: { type: "string", description: "De vraag, kort, in het Nederlands." },
        soort: { type: "string", enum: ["tekst", "creator", "stem", "beeld", "storyboard", "scene"] },
        scene_nummer: { type: "integer", description: "Alleen bij soort 'scene': de scène die ter keuring gaat (toont de video met Goedkeuren / Aanpassen)." },
        opties: {
          type: "array",
          maxItems: 6,
          items: { type: "object", properties: { label: { type: "string" }, uitleg: { type: "string" } }, required: ["label"] },
          description: "Alleen bij soort 'tekst'.",
        },
        beeld_ids: { type: "array", items: { type: "string" }, maxItems: 12, description: "Bij soort 'beeld' en 'storyboard': creatie-ids (storyboard: op volgorde van de scènes)." },
        bijschriften: { type: "array", items: { type: "string" }, maxItems: 12, description: "Alleen bij soort 'storyboard': per scène één korte zin (wat er gebeurt of gezegd wordt)." },
        stemmen: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            properties: { id: { type: "string", description: "Stem-id uit zoek_stemmen." }, waarom: { type: "string", description: "Eén korte zin waarom deze stem bij dit verhaal past." } },
            required: ["id", "waarom"],
          },
          description: "Alleen bij soort 'stem': je aanraders, de beste eerst.",
        },
        meerdere: { type: "boolean", description: "Meer dan één antwoord toestaan." },
      },
      required: ["vraag", "soort"],
    },
  },
  {
    name: "lees_webpagina",
    description: "Lees een productpagina of website (gratis): naam, omschrijving, voordelen, prijs, merkkleur en foto-adressen. Gebruik de foto-adressen als voorbeelden in maak_beeld.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "mijn_werk",
    description: "Bekijk het recente werk van de gebruiker in de bibliotheek (gratis): id, soort, wat het is en het adres. Gebruik ids om naar bestaande beelden te verwijzen.",
    input_schema: {
      type: "object",
      properties: { soort: { type: "string", enum: ["beeld", "video"] }, aantal: { type: "integer", minimum: 1, maximum: 30 } },
    },
  },
  {
    name: "maak_beeld",
    description:
      `Maak een beeld (${CREDIT_COSTS.IMAGE_GENERATION} credit). Geef voorbeelden (creatie-ids of https-adressen) mee om personages, gezichten of producten in elk beeld gelijk te houden; maximaal 4. Dit beeld is meteen het eindbeeld: maak een scène nooit een tweede keer "mooier". Schrijf de prompt in het Engels.`,
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        formaat: { type: "string", enum: [...FORMATEN] },
        voorbeelden: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["prompt", "formaat"],
    },
  },
  {
    name: "maak_voiceover",
    description:
      `Spreek een tekst in als losse voice-over (mp3, te downloaden; kost ${CREDIT_COSTS.VOICE} credits per 1.000 tekens). Kies de stem eerst samen met de gebruiker (zoek_stemmen, dan vraag_keuze soort 'stem'). Schrijf de tekst zoals hij uitgesproken moet worden; met [fluisterend], [lachend] of [enthousiast] stuur je de toon bij.`,
    input_schema: {
      type: "object",
      properties: {
        tekst: { type: "string", description: "Max 5.000 tekens." },
        stem: { type: "string", description: "Stem-id uit zoek_stemmen (ook een eigen stem, 'eigen:…')." },
        snelheid: { type: "number", description: "0.7-1.3, standaard 1; rustiger voor slaapverhalen." },
      },
      required: ["tekst", "stem"],
    },
  },
  {
    name: "maak_video",
    description: `Laat een bestaand beeld 5 seconden bewegen (kost credits). Beschrijf de beweging in het Engels. Modellen: ${VIDEO_MODELLEN.map((m) => `${m.id} (${m.waarvoor} ${m.credits} cr.)`).join("; ")}. Gebruik altijd ${STANDAARD_VIDEO_MODEL} (laat model weg); een duurder model alleen als de gebruiker daar zelf om vraagt.`,
    input_schema: {
      type: "object",
      properties: { beeld_id: { type: "string" }, beweging: { type: "string" }, model: { type: "string", enum: VIDEO_MODELLEN.map((m) => m.id) } },
      required: ["beeld_id", "beweging"],
    },
  },
  {
    name: "gebruik_app",
    description: `Gebruik een kant-en-klare app of effect van Animideo op een foto (kost credits). Beschikbaar: ${APPS_LIJST}.`,
    input_schema: {
      type: "object",
      properties: { app_id: { type: "string" }, foto_id: { type: "string", description: "Creatie-id of https-adres van de foto." }, tekst: { type: "string" }, formaat: { type: "string", enum: [...FORMATEN] } },
      required: ["app_id"],
    },
  },
  {
    name: "monteer",
    description: `Zet klare clips en/of beelden achter elkaar tot één video, met optioneel titelkaart, eindkaart, Nederlandse voice-over en muziek. Voice-over kost ${CREDIT_COSTS.VOICE} credits. Stem: het stem-id dat de gebruiker koos (eerst zoek_stemmen, dan vraag_keuze soort 'stem'); zonder stem een diepe verteller. Muziek: ${MUSIC_CATEGORIES.map((c) => c.id).join(", ")}.`,
    input_schema: {
      type: "object",
      properties: {
        clip_ids: { type: "array", items: { type: "string" }, minItems: 1 },
        titel: { type: "string" },
        eindtekst: { type: "string" },
        voiceover: { type: "string", description: "Wat de stem zegt, Nederlands." },
        stem: { type: "string" },
        muziek: { type: "string", enum: MUSIC_CATEGORIES.map((c) => c.id) },
      },
      required: ["clip_ids"],
    },
  },
  {
    name: "zoek_stemmen",
    description:
      "Bekijk de stemmenbibliotheek (gratis): de 100 beste stemmen voor Nederlands, met id, naam, typering, geslacht, leeftijd, accent (Nederlands/Vlaams/Brabants), soort (verteller, gewoon praten, reclame, social media, personage…) en beschrijving. Gebruik dit vóór je een stem voorstelt, en kies stemmen waarvan de typering en beschrijving passen bij het verhaal, de toon en het publiek. Filters zijn optioneel.",
    input_schema: {
      type: "object",
      properties: {
        geslacht: { type: "string", enum: ["man", "vrouw"] },
        leeftijd: { type: "string", enum: ["jong", "volwassen", "ouder"] },
        accent: { type: "string", enum: ["Nederlands", "Vlaams", "Brabants"] },
      },
    },
  },
  {
    name: "ugc_creators",
    description: "Bekijk de AI-creators voor UGC-video's (gratis): de vaste set en de eigen creators van de gebruiker, met id, omschrijving en portret.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "maak_ugc_video",
    description: `Maak een UGC-video (kost credits): een AI-creator praat in de camera over een product of dienst, met lipsync, Nederlandse stem en meelopende ondertitels, staand formaat. Kies eerst een creator met ugc_creators. Zonder script schrijft de UGC-studio er zelf een. Lengtes: ${UGC_LENGTES.map((l) => l.sec).join(", ")} s. Duurt 5-8 min.`,
    input_schema: {
      type: "object",
      properties: {
        naam: { type: "string", description: "Product of dienst." },
        omschrijving: { type: "string" },
        voordelen: { type: "array", items: { type: "string" }, maxItems: 3 },
        website: { type: "string" },
        foto_id: { type: "string", description: "Productfoto (creatie-id of https); leeg bij een dienst." },
        creator_id: { type: "string" },
        stem: { type: "string", description: "Stem-id uit zoek_stemmen of het stemmenmenu; leeg = de vaste stem van de creator." },
        sec: { type: "integer", enum: UGC_LENGTES.map((l) => l.sec) },
        broll: { type: "boolean", description: "Productbeelden tussendoor." },
      },
      required: ["naam", "creator_id"],
    },
  },
  {
    name: "maak_reclame",
    description: `Maak een productreclame van ±17 s (kost ${RECLAME_CREDITS} credits): drie filmische shots met het echte product, voice-over door Hugo, muziek en eindkaart in de merkkleur. Werkt het best met een productlink (de pagina wordt gelezen) of met naam + foto. Stijlen: ${STIJLEN.map((s) => s.id).join(", ")}. Duurt 3-6 min.`,
    input_schema: {
      type: "object",
      properties: {
        link: { type: "string" },
        naam: { type: "string" },
        omschrijving: { type: "string" },
        foto_id: { type: "string" },
        kleur: { type: "string", description: "#rrggbb" },
        stijl: { type: "string", enum: STIJLEN.map((s) => s.id) },
        formaat: { type: "string", enum: RECLAME_FORMATEN.map((f) => f.id) },
      },
      required: ["stijl"],
    },
  },
  {
    name: "maak_trailer",
    description: `Maak een filmtrailer (fantasy) van ${TRAILER_LENGTES.map((l) => l.sec).join(" of ")} s volgens het trailer-regelboek: personages, filmbeelden, clips, verteller en montage (kost veel credits, ~70 voor 60 s). Duurt 10-20 min.`,
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string" },
        verhaal: { type: "string" },
        personages: { type: "array", items: { type: "object", properties: { naam: { type: "string" }, omschrijving: { type: "string" } }, required: ["naam"] }, maxItems: 3 },
        sec: { type: "integer", enum: TRAILER_LENGTES.map((l) => l.sec) },
        taal: { type: "string", enum: ["en", "nl"], description: "Taal van de verteller; standaard Engels (klassieke trailerstem)." },
      },
      required: ["verhaal"],
    },
  },
  {
    name: "onthoud",
    description: "Sla iets blijvends op over de gebruiker of het bedrijf (gratis), voor alle volgende projecten: bedrijfsnaam, huisstijl, doelgroep, voorkeuren. Alleen dingen die over dit project heen gelden, kort.",
    input_schema: { type: "object", properties: { feit: { type: "string" } }, required: ["feit"] },
  },
  {
    name: "vaste_taak",
    description:
      "Leg een vaste taak vast (gratis): iets dat de Regisseur voortaan zelf op een vast moment maakt, zonder dat de gebruiker erbij is (bijvoorbeeld elke maandag 3 Instagram-posts). " +
      "Alleen als de gebruiker dat echt wil, en pas nadat hij met vraag_keuze heeft bevestigd: het ritme, het tijdstip en het maximum aan credits per keer (stel een maximum voor dat ruim past bij wat één keer kost). " +
      "Schrijf de opdracht volledig en op zichzelf staand (wat, hoeveel, formaat, stijl, toon, onderwerpen, bedrijf), want bij het uitvoeren is dit gesprek er niet meer. " +
      "Een bestaande taak aanpassen: geef taak_id mee en weer alle velden (de nieuwe volledige opdracht).",
    input_schema: {
      type: "object",
      properties: {
        taak_id: { type: "string", description: "Alleen bij aanpassen van een bestaande taak." },
        titel: { type: "string", description: "Kort, bv. 'Instagram-posts bakkerij'." },
        opdracht: { type: "string" },
        ritme: { type: "string", enum: ["dag", "week", "maand"] },
        weekdag: { type: "integer", minimum: 0, maximum: 6, description: "Bij 'week': 0 = zondag, 1 = maandag … 6 = zaterdag." },
        maanddag: { type: "integer", minimum: 1, maximum: 28, description: "Bij 'maand'." },
        uur: { type: "integer", minimum: 0, maximum: 23, description: "Nederlandse tijd; standaard 8." },
        max_credits: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["titel", "opdracht", "ritme", "max_credits"],
    },
  },
  {
    name: "lees_huisstijl",
    description: "Lees de huisstijlen die de gebruiker in Animideo heeft vastgelegd (gratis): naam, beschrijving, toon, kernwaarden, kleuren, lettertypen, omgeving, wat niet mag, logo en voorbeeldbeelden. Gebruik dit bij elke opdracht voor een bedrijf of merk, vóór je beelden of teksten maakt.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "social_kanalen",
    description: "Bekijk welke socialmedia-accounts de gebruiker in de Social-studio heeft gekoppeld (gratis): id, platform (instagram, tiktok, facebook, youtube, twitter = X) en naam.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "maak_contentkalender",
    description:
      `Zet een contentkalender op in de Social-studio (gratis): jij (een strateeg) bedenkt meteen alle posts met tekst; de gebruiker keurt ze daar goed, daarna maakt Animideo ze per week vooruit (beeldpost ${POST_CREDITS.beeld} credit, videopost met voice-over en muziek ${POST_CREDITS.video}) en plaatst ze automatisch of na keuring. ` +
      "Eerst social_kanalen. Vraag vóór het aanmaken met vraag_keuze één keer akkoord op: kanalen, periode (weken), aantal posts per week en of posts eerst gekeurd moeten worden of meteen geplaatst. Schrijf de briefing volledig (bedrijf, doelgroep, thema's, acties, toon). " +
      "Foto's: creatie-ids van eigen foto's (product, logo) uit dit gesprek, die komen dan echt in beeld.",
    input_schema: {
      type: "object",
      properties: {
        briefing: { type: "string" },
        accounts: { type: "array", items: { type: "string" }, description: "Account-ids uit social_kanalen; leeg = alle." },
        start: { type: "string", description: "YYYY-MM-DD, standaard morgen." },
        weken: { type: "integer", minimum: 1, maximum: 6 },
        per_week: { type: "integer", minimum: 1, maximum: 7 },
        modus: { type: "string", enum: ["controleren", "plaatsen"] },
        eindkaart: { type: "string", description: "Tekst op het eind van video's, bv. de website." },
        fotos: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["briefing", "weken", "per_week", "modus"],
    },
  },
  {
    name: "wacht_op",
    description: "Wacht tot creaties klaar zijn (beelden duren ~20 s, video's 1-3 min, een montage ~1 min). Je krijgt daarna de resultaten te zien, beelden ook als plaatje, zodat je ze kunt beoordelen. Gebruik dit na het starten van stappen waarop je wilt verder bouwen.",
    input_schema: { type: "object", properties: { creatie_ids: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["creatie_ids"] },
  },
  {
    name: "begroting",
    description:
      "Leg de gebruiker vóór het maken één keer voor wat het hele project kost, als lijst met posten (pauzeert tot akkoord). Wat daarna binnen de begroting valt, start zonder nieuwe vraag. " +
      `Prijzen: beeld ${CREDIT_COSTS.IMAGE_GENERATION} cr.; clip van 5 s ${VIDEO_MODELLEN.find((m) => m.id === STANDAARD_VIDEO_MODEL)!.credits} cr.; voice-over ${CREDIT_COSTS.VOICE} cr. per 1.000 tekens; montage zonder voice-over gratis; reclame ${RECLAME_CREDITS} cr. ` +
      "Reken precies, zonder reserve. Komt er later iets bij, maak dan een nieuwe begroting met alleen wat erbij komt.",
    input_schema: {
      type: "object",
      properties: {
        posten: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: { omschrijving: { type: "string", description: "Kort, bv. '6 beelden (storyboard = eindbeelden)'." }, credits: { type: "integer", minimum: 0 } },
            required: ["omschrijving", "credits"],
          },
        },
      },
      required: ["posten"],
    },
  },
  ...FILM_TOOLS,
];

/** De posten van een begroting, gecontroleerd; het totaal rekenen we zelf uit. */
export function leesBegroting(input: unknown): { posten: { omschrijving: string; credits: number }[]; totaal: number } {
  const ruw = Array.isArray((input as { posten?: unknown })?.posten) ? (input as { posten: unknown[] }).posten : [];
  const posten = ruw
    .slice(0, 12)
    .map((x) => x as { omschrijving?: unknown; credits?: unknown })
    .map((x) => ({ omschrijving: String(x.omschrijving ?? "").slice(0, 120), credits: Math.max(0, Math.round(Number(x.credits) || 0)) }))
    .filter((x) => x.omschrijving);
  return { posten, totaal: posten.reduce((s, x) => s + x.credits, 0) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Een creatie-id of een https-adres → een adres. Alleen eigen creaties. */
async function naarUrl(userId: string, ref: unknown): Promise<string> {
  const r = String(ref ?? "").trim();
  if (/^https:\/\//.test(r)) return r;
  if (!UUID.test(r)) throw new Error(`Onbekende verwijzing: ${r || "(leeg)"}`);
  const { data } = await createServiceClient().from("creaties").select("url, status").eq("id", r).eq("user_id", userId).maybeSingle();
  if (!data?.url || data.status !== "klaar") throw new Error(`Creatie ${r} is er niet of nog niet klaar.`);
  return data.url;
}

async function formaatVan(userId: string, ref: unknown): Promise<string | undefined> {
  if (!UUID.test(String(ref ?? ""))) return undefined;
  const { data } = await createServiceClient().from("creaties").select("invoer").eq("id", String(ref)).eq("user_id", userId).maybeSingle();
  return (data?.invoer as { formaat?: string } | undefined)?.formaat;
}

export interface Stap {
  toolUseId: string;
  naam: string;
  input: Record<string, unknown>;
  /** Wat de maker krijgt (al opgelost: ids naar adressen). */
  maker: string;
  invoer: Record<string, unknown>;
  credits: number;
  omschrijving: string;
  /** Wat de gebruiker bij de bevestiging te zien krijgt: een beeld en het script. */
  details?: { beelden?: string[]; regels?: string[] };
}

/** Eén keuze in een menu van de Regisseur. */
export interface Optie {
  label: string;
  /** Wat er naar Claude teruggaat (bv. "Chantal (creator-id chantal)"). */
  waarde: string;
  uitleg?: string;
  beeld?: string;
  /** Een stemvoorbeeld om te beluisteren. */
  geluid?: string;
  /** Een video om te bekijken (een scène ter keuring). */
  video?: string;
  /** Een storyboard ter keuring: de schetsen op volgorde, met bijschrift. */
  storyboard?: { url: string; tekst: string }[];
}

/**
 * Het menu bij een vraag. Creators en stemmen vult de app zelf: zo hoeft Claude ze niet
 * op te sommen, en staan er altijd echte portretten en echte stemvoorbeelden in.
 */
export async function bouwOpties(userId: string, input: Record<string, unknown>, projectId?: string): Promise<Optie[]> {
  const soort = input.soort;
  if (soort === "scene") return filmOpties(userId, projectId, input);
  if (soort === "creator") {
    const lijst = JSON.parse(await gratis(userId, { name: "ugc_creators", input: {} } as Anthropic.Beta.BetaToolUseBlock)) as { id: string; naam: string; omschrijving?: string; portret: string; eigen?: boolean }[];
    return lijst.map((c) => ({
      label: c.naam,
      waarde: `${c.naam} (creator-id ${c.id}${(c as { stem?: string }).stem ? `, vaste stem ${(c as { stem?: string }).stem}` : ""})`,
      uitleg: c.eigen ? "Eigen creator" : CREATORS.find((x) => x.id === c.id)?.omschrijving,
      beeld: c.portret,
    }));
  }
  if (soort === "stem") {
    // Claudes aanraders uit de bibliotheek, met zijn reden erbij en het Nederlandse voorbeeld.
    const ruw = (Array.isArray(input.stemmen) ? input.stemmen : []).map((x) => x as { id?: unknown; waarom?: unknown }).slice(0, 5);
    // Een eigen stem staat niet in de bibliotheek: zoek hem op bij de creaties van deze gebruiker.
    const eigenIds = ruw.map((x) => String(x.id ?? "")).filter((id) => id.startsWith(EIGEN)).map((id) => id.slice(EIGEN.length));
    const { data: eigen } = eigenIds.length
      ? await createServiceClient().from("creaties").select("id, url, invoer").eq("user_id", userId).eq("maker", "stem-kloon").in("id", eigenIds)
      : { data: [] as { id: string; url: string | null; invoer: unknown }[] };
    const eigenStem = (id: string): BibliotheekStem | undefined => {
      const c = (eigen ?? []).find((x) => `${EIGEN}${x.id}` === id);
      if (!c) return undefined;
      return { id, naam: (c.invoer as { naam?: string }).naam ?? "Eigen stem", typering: "je eigen stem", geslacht: "neutraal", leeftijd: "volwassen", accent: "Nederlands", moedertaal: true, taal: "nl", talen: ["nl"], gebruik: "", beschrijving: "", voorbeeld: c.url ?? "", populariteit: 0 };
    };
    const aanraders = ruw
      .map((x) => ({ s: vindStem(x.id) ?? eigenStem(String(x.id ?? "")), waarom: String(x.waarom ?? "").slice(0, 160) }))
      .filter((x): x is { s: BibliotheekStem; waarom: string } => !!x.s);
    if (aanraders.length) {
      return aanraders.map(({ s, waarom }) => ({
        label: s.naam,
        waarde: `stem ${s.naam} (stem-id ${s.id})`,
        uitleg: [waarom, s.id.startsWith(EIGEN) ? "⭐ je eigen stem" : `${s.geslacht} · ${s.leeftijd}${s.accent !== "Nederlands" ? ` · ${s.accent}` : ""} · ${s.typering}`].filter(Boolean).join(" — "),
        geluid: s.voorbeeld,
      }));
    }
    return UGC_STEMMEN.map((s) => ({ label: s.naam, waarde: `stem ${s.naam}`, uitleg: `${s.geslacht} · ${s.omschrijving}`, geluid: `/voice-previews/${s.id}.mp3` }));
  }
  if (soort === "storyboard") {
    // Het controlemoment vóór de dure clips: alle schetsen op volgorde, dan één keuze.
    const ids = (Array.isArray(input.beeld_ids) ? input.beeld_ids : []).map(String).slice(0, 12);
    const bijschriften = (Array.isArray(input.bijschriften) ? input.bijschriften : []).map(String);
    const { data } = ids.length ? await createServiceClient().from("creaties").select("id, url").eq("user_id", userId).in("id", ids) : { data: [] as { id: string; url: string | null }[] };
    const storyboard = ids
      .map((id, i) => ({ url: (data ?? []).find((c) => c.id === id)?.url ?? "", tekst: bijschriften[i]?.slice(0, 200) ?? "" }))
      .filter((s) => s.url);
    if (!storyboard.length) throw new Error("Geen klare storyboardbeelden gevonden; wacht eerst met wacht_op tot ze klaar zijn.");
    return [
      { label: "✅ Goedkeuren", waarde: "Storyboard goedgekeurd", storyboard },
      { label: "✏️ Aanpassen", waarde: "Storyboard: ik wil iets aanpassen", uitleg: "Of typ hieronder meteen welke scène anders moet." },
    ];
  }
  if (soort === "beeld") {
    const ids = (Array.isArray(input.beeld_ids) ? input.beeld_ids : []).map(String).slice(0, 8);
    const { data } = ids.length
      ? await createServiceClient().from("creaties").select("id, url, prompt").eq("user_id", userId).in("id", ids)
      : { data: [] as { id: string; url: string | null; prompt: string | null }[] };
    return ids
      .map((id, i) => (data ?? []).find((c) => c.id === id))
      .filter((c): c is { id: string; url: string | null; prompt: string | null } => !!c?.url)
      .map((c, i) => ({ label: `Versie ${i + 1}`, waarde: `beeld ${c.id}`, beeld: c.url! }));
  }
  return (Array.isArray(input.opties) ? input.opties : [])
    .slice(0, 6)
    .map((o) => (typeof o === "string" ? { label: o } : (o as { label?: unknown; uitleg?: unknown })))
    .filter((o) => o.label)
    .map((o) => ({ label: String(o.label), waarde: String(o.label), ...(o.uitleg ? { uitleg: String(o.uitleg) } : {}) }));
}

/**
 * Zet een betaalde tool-aanroep om in een stap: controleren, prijs uitrekenen, ids naar
 * adressen. Gooit met een melding die als foutresultaat terug naar Claude gaat.
 */
export async function bereidVoor(userId: string, blok: Anthropic.Beta.BetaToolUseBlock, projectId?: string): Promise<Stap> {
  if (FILM_BETAALD.has(blok.name)) return filmBereidVoor(userId, projectId, blok);
  const i = (blok.input ?? {}) as Record<string, unknown>;
  const basis = { toolUseId: blok.id, naam: blok.name, input: i };
  if (blok.name === "maak_beeld") {
    const voorbeelden = await Promise.all((Array.isArray(i.voorbeelden) ? i.voorbeelden : []).slice(0, 4).map((v) => naarUrl(userId, v)));
    // Altijd het gewone beeld (1 credit): de Regisseur maakt geen Pro-beelden (Sam, 28-10-2026).
    // Pro kostte 5 credits per beeld en werd na het storyboard nog eens over elke schets
    // heen gemaakt, waardoor klanten elk beeld twee keer betaalden.
    const invoer = { prompt: i.prompt, formaat: i.formaat, kwaliteit: "standaard", referentieUrls: voorbeelden };
    const o = maakOpdracht("beeld", invoer);
    return { ...basis, maker: "beeld", invoer, credits: o.credits, omschrijving: `Beeld${voorbeelden.length ? ` met ${voorbeelden.length} voorbeeld(en)` : ""}: ${String(i.prompt).slice(0, 90)}` };
  }
  if (blok.name === "maak_voiceover") {
    const id = String(i.stem ?? "");
    const stem = vindStem(id);
    if (!stem && !id.startsWith(EIGEN)) throw new Error(`Onbekende stem: ${id}. Zoek er een met zoek_stemmen.`);
    const invoer = { tekst: i.tekst, stemId: stem?.id ?? id, stemNaam: stem?.naam ?? "Eigen stem", snelheid: i.snelheid ?? 1, taal: "nl" };
    // Een eigen stem krijgt zijn MiniMax-id pas in de wachtrij; voor de prijs maakt het niet uit.
    const o = maakOpdracht("voice-over", { ...invoer, minimaxVoiceId: stem ? undefined : "nog-op-te-zoeken" });
    return { ...basis, maker: "voice-over", invoer, credits: o.credits, omschrijving: `Voice-over door ${invoer.stemNaam}: ${String(i.tekst).slice(0, 90)}`, details: { regels: [String(i.tekst)] } };
  }
  if (blok.name === "maak_video") {
    const invoer = { bronUrl: await naarUrl(userId, i.beeld_id), prompt: i.beweging, model: i.model ?? STANDAARD_VIDEO_MODEL, formaat: await formaatVan(userId, i.beeld_id) };
    const o = maakOpdracht("beeld-naar-video", invoer);
    return { ...basis, maker: "beeld-naar-video", invoer, credits: o.credits, omschrijving: `Video: ${String(i.beweging).slice(0, 90)}` };
  }
  if (blok.name === "gebruik_app") {
    const r = recept(i.app_id);
    if (!r) throw new Error(`Onbekende app: ${String(i.app_id)}`);
    const invoer = {
      receptId: r.id,
      ...(r.zonderFoto ? {} : { fotoUrl: await naarUrl(userId, i.foto_id) }),
      tekst: i.tekst ?? "",
      formaat: i.formaat ?? (await formaatVan(userId, i.foto_id)) ?? r.zonderFoto?.formaat,
      // De Regisseur gebruikt alleen door AI bedachte personen of foto's die de gebruiker zelf aanleverde.
      toestemming: true,
    };
    const o = receptOpdracht(invoer);
    return { ...basis, maker: "recept", invoer, credits: o.credits, omschrijving: `${r.icoon} ${r.naam}${i.tekst ? `: ${String(i.tekst).slice(0, 60)}` : ""}` };
  }
  if (blok.name === "monteer") {
    const invoer = { clipIds: i.clip_ids, titel: i.titel, eindtekst: i.eindtekst, voiceover: i.voiceover, stem: i.stem, muziek: i.muziek };
    const m = leesMontage(invoer);
    return { ...basis, maker: "montage", invoer, credits: montageCredits(m), omschrijving: `Montage van ${m.clipIds.length} stukken${m.titel ? ` — "${m.titel}"` : ""}${m.voiceover ? " met voice-over" : ""}` };
  }
  if (blok.name === "maak_ugc_video") {
    const foto = i.foto_id ? await naarUrl(userId, i.foto_id) : "";
    const onderwerp = leesOnderwerp({ naam: i.naam, omschrijving: i.omschrijving, voordelen: i.voordelen, website: i.website }, !!foto);
    const gekozen = UGC_STEMMEN.find((x) => x.id === i.stem || x.naam.toLowerCase() === String(i.stem ?? "").replace(/^stem\s+/i, "").toLowerCase()) ?? vindStem(i.stem);
    const creator = { ...(await leesCreator(userId, i.creator_id)), ...(gekozen ? { stem: gekozen.id } : {}) };
    const sec = (UGC_LENGTES.some((l) => l.sec === i.sec) ? i.sec : 15) as UgcLengte;
    const broll = i.broll === true;
    // Het script nu al schrijven: de prijs hangt ervan af, en de gebruiker ziet bij de
    // bevestiging waar hij voor betaalt.
    const script = await schrijfUgcScript(onderwerp, { ...creator, omschrijving: "" }, sec, broll);
    const invoer = { onderwerp, fotoUrl: foto, creator: creator.id, stem: creator.stem, sec, broll, script };
    return {
      ...basis, maker: "ugc", invoer, credits: ugcCredits(script),
      omschrijving: `UGC-video (${sec} s) door ${creator.naam}, stem ${UGC_STEMMEN.find((x) => x.id === creator.stem)?.naam ?? vindStem(creator.stem)?.naam ?? "eigen"}`,
      details: { beelden: [creator.portretUrl, ...(foto ? [foto] : [])], regels: script.stukjes.map((x) => (x.soort === "broll" ? `🎬 ${x.tekst}` : x.tekst)) },
    };
  }
  if (blok.name === "maak_reclame") {
    let product: Product = { naam: String(i.naam ?? ""), merk: "", omschrijving: String(i.omschrijving ?? ""), voordelen: [], prijs: "", kleur: String(i.kleur ?? "#1c72ed"), website: "", fotos: [] };
    if (typeof i.link === "string" && i.link.trim()) product = { ...(await leesProductpagina(i.link)), ...(i.naam ? { naam: String(i.naam) } : {}), ...(i.kleur ? { kleur: String(i.kleur) } : {}) };
    const fotoUrl = i.foto_id ? await naarUrl(userId, i.foto_id) : product.fotos[0];
    if (!fotoUrl) throw new Error("Voor een reclame is een productfoto nodig: geef foto_id mee.");
    if (!product.naam) throw new Error("Geef de naam van het product mee.");
    const stijl = (STIJLEN.some((s) => s.id === i.stijl) ? i.stijl : "strak") as StijlId;
    const formaat = (RECLAME_FORMATEN.some((f) => f.id === i.formaat) ? i.formaat : "9:16") as ReclameFormaat;
    const plan = await schrijfPlan(product, stijl);
    const invoer = { product, fotoUrl, stijl, formaat, plan };
    return {
      ...basis, maker: "reclame", invoer, credits: RECLAME_CREDITS,
      omschrijving: `Reclame voor ${product.naam} (${STIJLEN.find((x) => x.id === stijl)?.naam}, ${formaat})`,
      details: { beelden: [fotoUrl], regels: [`🎙️ ${plan.voiceover}`, ...plan.shots.map((x, n) => `Shot ${n + 1}: ${x.uitleg || x.tekst}`), `Eindkaart: ${plan.eindtekst}`] },
    };
  }
  if (blok.name === "maak_trailer") {
    const sec = (TRAILER_LENGTES.some((l) => l.sec === i.sec) ? i.sec : 60) as TrailerLengte;
    const personages = (Array.isArray(i.personages) ? i.personages : [])
      .map((p) => ({ naam: String((p as { naam?: unknown }).naam ?? ""), omschrijving: String((p as { omschrijving?: unknown }).omschrijving ?? "") }))
      .filter((p) => p.naam)
      .slice(0, 3);
    const plan = await schrijfTrailer({ titel: String(i.titel ?? ""), verhaal: String(i.verhaal ?? ""), personages, genre: "fantasy", sec, taal: i.taal === "nl" ? "nl" : "en" });
    const invoer = { genre: "fantasy", sec, plan };
    return {
      ...basis, maker: "trailer", invoer, credits: trailerCredits(plan),
      omschrijving: `Trailer "${plan.titel}" (${sec} s, ${plan.clips.length} filmclips)`,
      details: {
        regels: [
          ...plan.personages.map((x) => `🎭 ${x.naam}: ${x.rol}`),
          ...plan.tijdlijn.filter((e) => e.regel?.tekst).map((e) => `${e.regel!.wie === "verteller" ? "🎙️" : `${e.regel!.wie}:`} ${e.regel!.tekst}`),
        ],
      },
    };
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}

// ── Geheugen ─────────────────────────────────────────────────────────────

const MAX_GEHEUGEN = 3000;

export async function leesGeheugen(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("regie_geheugen").select("tekst").eq("user_id", userId).maybeSingle();
  return (data?.tekst as string | undefined) ?? "";
}

/** Een regel erbij. Wordt het te lang, dan vallen de oudste regels eraf. */
async function onthoud(userId: string, feit: string) {
  const regels = (await leesGeheugen(userId)).split("\n").filter(Boolean);
  regels.push(`- ${feit}`);
  while (regels.join("\n").length > MAX_GEHEUGEN) regels.shift();
  const { error } = await createServiceClient()
    .from("regie_geheugen")
    .upsert({ user_id: userId, tekst: regels.join("\n"), updated_at: new Date().toISOString() });
  if (error) throw new Error("Onthouden lukte niet.");
}

/** Voert een stap uit: de creatie start in de wachtrij. Geeft het id terug. */
export async function voerUit(userId: string, s: Stap): Promise<string> {
  const c = await startCreatie(userId, s.maker, s.invoer);
  if (c.status === "mislukt") throw new Error(c.foutmelding ?? "Mislukt bij het insturen.");
  return c.id;
}

/** De gratis gereedschappen, meteen uitgevoerd. */
export async function gratis(userId: string, blok: Anthropic.Beta.BetaToolUseBlock, projectId?: string): Promise<string> {
  if (FILM_GRATIS.has(blok.name)) return filmGratis(userId, projectId, blok);
  const i = (blok.input ?? {}) as Record<string, unknown>;
  if (blok.name === "lees_webpagina") {
    const p = await leesProductpagina(String(i.url ?? ""));
    return JSON.stringify({ ...p, fotos: p.fotos.slice(0, 6) });
  }
  if (blok.name === "mijn_werk") {
    let q = createServiceClient()
      .from("creaties")
      .select("id, soort, maker, prompt, url, created_at")
      .eq("user_id", userId)
      .eq("status", "klaar")
      .order("created_at", { ascending: false })
      .limit(Math.min(30, Number(i.aantal) || 15));
    if (i.soort === "beeld" || i.soort === "video") q = q.eq("soort", i.soort);
    const { data } = await q;
    return JSON.stringify(data ?? []);
  }
  if (blok.name === "ugc_creators") {
    const { data } = await createServiceClient()
      .from("creaties")
      .select("id, url, invoer")
      .eq("user_id", userId)
      .eq("maker", "ugc-creator")
      .eq("status", "klaar")
      .limit(20);
    const eigen = (data ?? []).map((c) => ({ id: c.id, naam: (c.invoer as { naam?: string }).naam, omschrijving: (c.invoer as { beschrijving?: string }).beschrijving, portret: c.url, eigen: true }));
    const stemNaam = (id?: string) => UGC_STEMMEN.find((x) => x.id === id)?.naam;
    return JSON.stringify([
      ...eigen.map((c, n) => ({ ...c, stem: stemNaam(((data ?? [])[n]?.invoer as { stem?: string }).stem) })),
      ...CREATORS.map((c) => ({ id: c.id, naam: c.naam, omschrijving: `${c.omschrijving}. ${c.persona}`, portret: c.portretUrl, stem: stemNaam(c.stem) })),
    ]);
  }
  if (blok.name === "zoek_stemmen") {
    const { data: eigen } = await createServiceClient()
      .from("creaties")
      .select("id, invoer")
      .eq("user_id", userId)
      .eq("maker", "stem-kloon")
      .eq("status", "klaar")
      .limit(10);
    return JSON.stringify([
      // Eigen stemmen alleen voor maak_voiceover; de montage en UGC spreken via ElevenLabs.
      ...(eigen ?? []).map((c) => ({ id: `${EIGEN}${c.id}`, naam: (c.invoer as { naam?: string }).naam ?? "Eigen stem", typering: "de eigen, getrainde stem van de gebruiker (alleen voor maak_voiceover)" })),
      ...BIBLIOTHEEK.filter((s) => (!i.geslacht || s.geslacht === i.geslacht) && (!i.leeftijd || s.leeftijd === i.leeftijd) && (!i.accent || s.accent === i.accent)).map((s) => ({
        id: s.id,
        naam: s.naam,
        typering: s.typering,
        geslacht: s.geslacht,
        leeftijd: s.leeftijd,
        accent: s.accent,
        soort: GEBRUIK_LABEL[s.gebruik] ?? s.gebruik,
        beschrijving: s.beschrijving,
      })),
    ]);
  }
  if (blok.name === "onthoud") {
    const feit = String(i.feit ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!feit) throw new Error("Niets om te onthouden.");
    await onthoud(userId, feit);
    return "Onthouden.";
  }
  if (blok.name === "lees_huisstijl") {
    const { data } = await createServiceClient()
      .from("brand_kits")
      .select("id, name, description, tone_of_voice, brand_values, colors, fonts, environment, do_nots, default_language, default_format, logo_url, reference_images")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (!data?.length) return "Nog geen huisstijl vastgelegd (dat kan onder Huisstijlen, /brand). Gebruik wat je in het geheugen weet, of vraag het kort.";
    return JSON.stringify(
      data.map((b) => ({
        ...b,
        reference_images: (Array.isArray(b.reference_images) ? b.reference_images : []).slice(0, 4),
        gebruik: "Kleuren als hex in je Engelse beeldprompts noemen; logo_url en reference_images zijn bruikbaar als voorbeelden in maak_beeld (logo alleen waar een logo hoort, zoals de eindkaart of een verpakking).",
      })),
    );
  }
  if (blok.name === "social_kanalen") {
    const a = await accountsVan(userId);
    return a.length
      ? JSON.stringify(a.map((x) => ({ id: x.id, platform: x.platform, naam: x.naam, ...(x.actief ? {} : { let_op: "verbinding verlopen, opnieuw koppelen" }) })))
      : "Nog geen kanalen gekoppeld. De gebruiker koppelt ze in de Social-studio (menu Studio's → Social, /studios/social).";
  }
  if (blok.name === "maak_contentkalender") {
    // Het bedenken duurt ~1 minuut; de Regisseur wacht erop, zodat hij de ideeën kan bespreken.
    const id = await maakKalender(userId, i);
    await bedenkIdeeen(id);
    const db = createServiceClient();
    const { data: k } = await db.from("content_kalenders").select("titel, status, foutmelding").eq("id", id).single();
    if (k?.status === "fout") throw new Error(k.foutmelding ?? "Ideeën bedenken mislukt.");
    const { data: posts } = await db.from("content_posts").select("gepland_op, platforms, soort, idee").eq("kalender_id", id).order("gepland_op");
    const regels = (posts ?? []).map((p) => `- ${datumTekst(p.gepland_op)} · ${p.platforms.join("+")} · ${p.soort}: ${p.idee}`);
    return `Kalender "${k?.titel}" staat klaar met ${regels.length} ideeën; de gebruiker moet ze nog goedkeuren op [de kalender](/studios/social/${id}) (daar kan hij ook aanpassen). Pas als hij goedkeurt worden ze gemaakt.\n${regels.join("\n")}`;
  }
  if (blok.name === "vaste_taak") {
    const t = await maakTaak(userId, i, projectId);
    return `${i.taak_id ? "Aangepast" : "Vastgelegd"} (taak-id ${t.id}): "${t.titel}", ${ritmeTekst(t)}, max ${t.max_credits} credits per keer. De eerste keer: ${datumTekst(t.volgende_op)}. De gebruiker beheert zijn taken onder Regisseur → Vaste taken (pauzeren, maximum aanpassen, meteen uitvoeren, weghalen) en krijgt na elke keer een mail.`;
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}
