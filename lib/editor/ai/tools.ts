// ── De gereedschapskist van de editor-AI ─────────────────────────────────────
//
// Eén functie per operatie die EditorCore al kent, plus twee om te kíjken. De
// naam van de tool is exact de naam van de op, zodat route en client één mapping
// delen (zelfde afspraak als lib/studio/chat-tools.ts).
//
// Bewust klein begonnen. Het onderzoek achter dit project is er duidelijk over
// dat een AI-editor niet strandt op te weinig functies maar op onbetrouwbaar
// gedrag: eerst deze zes met een evalset eromheen, pas uitbreiden als die
// vertrouwd draaien.
//
// De AI muteert nooit rechtstreeks. Ze levert een op, EditorCore valideert hem,
// en bij een schending gaat er een leesbare fout terug waarmee het model zichzelf
// kan corrigeren.

import type OpenAI from "openai";
import type { Op } from "../core/ops";

const clipIdParam = {
  type: "string",
  description:
    "Het exacte id van de clip uit het manifest (bijvoorbeeld 'clp_8f2'). Nooit een naam, nooit een scènenummer, nooit zelf verzonnen.",
} as const;

export const EDITOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_timeline_summary",
      description:
        "Bekijk de huidige montage: welke clips er liggen, in welke volgorde, hoe lang en waar ze over gaan. Gebruik dit vóór je iets verandert als je twijfelt over de actuele stand.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transcript",
      description:
        "Zoek de clip waarin iets gezegd of getoond wordt, bijvoorbeeld om 'de scène waarin ze de prijs noemt' om te zetten naar een clip-id.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Woord of zinsdeel om op te zoeken." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trim_clip",
      description:
        "Haal materiaal weg aan het begin of het eind van een clip. Positief maakt korter, negatief zet materiaal terug. Dit is het meest gebruikte commando: AI-clips hebben vaak een zwak begin of eind.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          edge: { type: "string", enum: ["in", "out"], description: "'in' = voorkant, 'out' = achterkant." },
          deltaSeconds: { type: "number", description: "Hoeveel seconden eraf (positief) of erbij (negatief)." },
        },
        required: ["clipId", "edge", "deltaSeconds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_duration",
      description: "Zet de exacte lengte van een clip, bijvoorbeeld bij 'maak deze scène 3 seconden'.",
      parameters: {
        type: "object",
        properties: { clipId: clipIdParam, duration: { type: "number", description: "Nieuwe lengte in seconden." } },
        required: ["clipId", "duration"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "split_clip",
      description: "Knip een clip op een tijdstip in tweeën, zodat je daarna een van beide helften apart kunt bewerken.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          at: { type: "number", description: "Tijdstip op de tijdlijn in seconden (niet binnen de clip geteld)." },
        },
        required: ["clipId", "at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_clip",
      description:
        "Haal een clip weg. Op het videospoor schuift de rest automatisch door, dus er ontstaat nooit zwart beeld.",
      parameters: { type: "object", properties: { clipId: clipIdParam }, required: ["clipId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_clip",
      description:
        "Verander de volgorde op het videospoor: zet een clip vóór een andere clip, of achteraan als je geen doel opgeeft. Verhaalstructuur is de grootste hefboom van monteren.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          beforeClipId: {
            type: "string",
            description: "Id van de clip waar hij vóór moet komen. Weglaten = achteraan zetten.",
          },
        },
        required: ["clipId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plaats_icoon",
      description:
        "Zet een icoon uit de bibliotheek in beeld: vrachtwagen, gloeilamp, vinkje, euro, huis, klok en ruim honderd andere. Gratis en meteen klaar. Dit is je EERSTE keus als er een symbool bij moet — gebruik plaats_element alleen als er echt niets passends in de bibliotheek zit.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          wat: { type: "string", description: "Welk icoon, in gewone woorden ('vrachtwagen', 'groen vinkje', 'gloeilamp')." },
          waar: { type: "string", description: "Waar het ongeveer moet komen ('rechtsboven', 'naast de man'). Mag leeg." },
        },
        required: ["clipId", "wat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plaats_element",
      description:
        "Laat een NIEUW voorwerp maken dat niet in de iconenbibliotheek zit, en leg het als losse laag over de video. Kost 1 credit en duurt een halve minuut. Probeer altijd eerst plaats_icoon — dat is gratis en meteen klaar. Kan niet gebruikt worden om iets weg te halen.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          wat: { type: "string", description: "Wat er moet komen, kort beschreven ('een rode appel', 'een koffiekopje')." },
          waar: { type: "string", description: "Waar het ongeveer moet komen ('op het bureau', 'rechtsboven in de hoek'). Mag leeg." },
        },
        required: ["clipId", "wat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bekijk_clip",
      description:
        "Kijk naar het beeld van een clip. Je krijgt een frame te zien met een hulpraster erover (lijnen om de 10%, dikkere om de 25%). Gebruik dit ALTIJD voordat je iets afdekt of tekst plaatst — zonder te kijken weet je niet waar iets staat.",
      parameters: { type: "object", properties: { clipId: clipIdParam }, required: ["clipId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "dek_af",
      description:
        "Dek een stukje beeld af met een schoon stuk uit datzelfde beeld — het gum-en-stempel-gereedschap van een vormgever. Gebruik dit om een fout weg te werken: een verkeerd gespeld bordje, een lelijk detail, een artefact. Kopieer een stuk effen achtergrond ernaast en plak het eroverheen. Kost niets en verandert verder niets aan het beeld. Kijk eerst met bekijk_clip.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          bronX: { type: "number", description: "Midden van het stuk dat je kopieert, 0..1 van links naar rechts." },
          bronY: { type: "number", description: "Midden van het stuk dat je kopieert, 0..1 van boven naar beneden." },
          breedte: { type: "number", description: "Breedte van het stuk, 0..1 van de beeldbreedte." },
          hoogte: { type: "number", description: "Hoogte van het stuk, 0..1 van de beeldhoogte." },
          doelX: { type: "number", description: "Midden van de plek waar het overheen moet, 0..1." },
          doelY: { type: "number", description: "Midden van de plek waar het overheen moet, 0..1." },
        },
        required: ["clipId", "bronX", "bronY", "breedte", "hoogte", "doelX", "doelY"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "markeer",
      description:
        "Wijs iets aan in beeld: een cirkel eromheen, een kader, een pijl ernaartoe of een streep eronder. Je zegt wát je wilt aanwijzen ('de prijs', 'het bordje', 'de knop') en het wordt opgemeten en op de juiste plek getekend. Kost niets en is altijd scherp — het is een getekende vorm, geen gegenereerd plaatje.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          wat: { type: "string", description: "Wat je wilt aanwijzen, zoals de klant het noemt. Staat het als tekst in beeld, schrijf die tekst dan letterlijk over." },
          objectEngels: {
            type: "string",
            description:
              "Hetzelfde ding in het Engels, kort en concreet ('green sign', 'coffee mug', 'price tag'). De objectherkenning is Engelstalig: op een Nederlandse zin pakt hij het halve beeld, op 'sign' precies het bordje.",
          },
          vorm: {
            type: "string",
            enum: ["cirkel", "kader", "pijl", "onderstreping"],
            description: "Cirkel om iets heen, kader eromheen, pijl ernaartoe, of een streep eronder. Cirkel is de gebruikelijke keus.",
          },
          kleur: { type: "string", description: "Hex-kleur van de vorm. Weglaten = opvallend rood." },
        },
        required: ["clipId", "wat", "vorm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vervaag",
      description:
        "Maak een stukje beeld onherkenbaar: een kenteken, een gezicht, een naam op een scherm. Je zegt wat er weg moet en dat gebied wordt vervaagd. Kost niets en raakt de rest van het beeld niet aan.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          wat: { type: "string", description: "Wat er onherkenbaar moet worden, zoals de klant het noemt." },
          objectEngels: {
            type: "string",
            description: "Hetzelfde in het Engels, kort ('licence plate', 'face', 'name badge'). De objectherkenning is Engelstalig.",
          },
        },
        required: ["clipId", "wat"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "herstel_tekst",
      description:
        "Repareer verkeerde tekst in een AI-beeld: een spelfout op een bordje, een verhaspeld woord op een verpakking. Zeg wat er staat en wat er moet staan, en het wordt gevonden, netjes dichtgelegd in de kleur van het vlak eromheen, en voorzien van goede tekst. Dit is de juiste keus bij tekstfouten — je hoeft geen coördinaten te schatten, die worden gemeten. Kost niets.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          foutieveTekst: { type: "string", description: "Wat er nu (verkeerd) staat, zo letterlijk mogelijk." },
          nieuweTekst: { type: "string", description: "Wat er moet komen te staan." },
          kleur: { type: "string", description: "Hex-kleur van de nieuwe letters. Weglaten = wit." },
        },
        required: ["clipId", "foutieveTekst", "nieuweTekst"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vul_vlak",
      description:
        "Dek een gebied af met één effen kleur die je uit het beeld zelf aanwijst. Voor vlakke illustraties is dit de beste manier om verkeerde tekst of een artefact weg te werken: wijs een schoon punt van hetzelfde vlak aan (bijvoorbeeld het groen van een bordje náást de letters), geef het gebied op dat weg moet, en het wordt netjes dichtgelegd. Kost niets. Kijk eerst met bekijk_clip.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          kleurX: { type: "number", description: "Punt waar de kleur vandaan komt, 0..1 van links naar rechts. Kies een schoon stuk van hetzelfde vlak." },
          kleurY: { type: "number", description: "Punt waar de kleur vandaan komt, 0..1 van boven naar beneden." },
          doelX: { type: "number", description: "Midden van het gebied dat weg moet, 0..1." },
          doelY: { type: "number", description: "Midden van het gebied dat weg moet, 0..1." },
          breedte: { type: "number", description: "Breedte van dat gebied, 0..1. Neem ruim: liever iets te groot dan letters die uitsteken." },
          hoogte: { type: "number", description: "Hoogte van dat gebied, 0..1." },
        },
        required: ["clipId", "kleurX", "kleurY", "doelX", "doelY", "breedte", "hoogte"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plaats_tekst",
      description:
        "Zet tekst in beeld op een plek die je aanwijst. Deterministisch: echte letters, scherp, geen model. Gebruik dit samen met dek_af om verkeerde tekst in een AI-beeld te vervangen door goede tekst.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          tekst: { type: "string", description: "Wat er moet staan." },
          x: { type: "number", description: "Midden van de tekst, 0..1 van links naar rechts. Standaard 0,5." },
          y: { type: "number", description: "Midden van de tekst, 0..1 van boven naar beneden. Standaard 0,5." },
          grootte: { type: "number", description: "Lettergrootte in pixels op een beeld van 1920 breed. Een bordje is ongeveer 40-70, een titel 100-160." },
          kleur: { type: "string", description: "Hex-kleur, bijvoorbeeld #111111. Standaard wit." },
        },
        required: ["clipId", "tekst"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bewerk_beeld",
      description:
        "Verander het beeld van een clip zelf: iets weghalen, vervangen of aanpassen ('remove the coffee mug'). Het bronbeeld wordt opnieuw getekend en de clip opnieuw geanimeerd. Kost 3 credits, duurt een minuut, en heeft twee bijwerkingen: tekst die in de video zit kan verdwijnen, en de nieuwe clip is 5 seconden (een langere scène wordt dus korter). Vraag hier ALTIJD eerst akkoord voor. Gebruik plaats_element als er alleen iets BIJ moet — dat is goedkoper en raakt de video niet aan.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          instructie: {
            type: "string",
            description:
              "Wat er moet veranderen, in één korte zin IN HET ENGELS (het beeldmodel is Engelstalig). Beschrijf alleen de verandering, niet de hele scène. Bijvoorbeeld: 'remove the coffee mug from the desk'.",
          },
        },
        required: ["clipId", "instructie"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_transition",
      description:
        "Zet of verwijder een overgang op een clipgrens. Gebruik 'fade' spaarzaam: de harde cut (geen overgang) is de norm, een fade alleen bij een sprong in tijd of sfeer.",
      parameters: {
        type: "object",
        properties: {
          clipId: clipIdParam,
          edge: { type: "string", enum: ["in", "out"], description: "'in' = begin van de clip, 'out' = eind." },
          kind: { type: "string", enum: ["fade", "geen"], description: "'geen' haalt de overgang weg." },
          duration: { type: "number", description: "Lengte in seconden; standaard 0,5. Wordt begrensd op de halve clip." },
        },
        required: ["clipId", "edge", "kind"],
      },
    },
  },
];

/** Tools die alleen kijken; die hoeven niet door de op-laag en kosten geen versie. */
export const LEES_TOOLS = new Set(["get_timeline_summary", "search_transcript"]);

/** Kijken naar het beeld zelf: levert een frame terug in het gesprek. */
export const KIJK_TOOLS = new Set(["bekijk_clip"]);

/**
 * Tools die eerst iets moeten laten máken (beeld genereren, opnieuw animeren)
 * voordat er een op uit komt. Die kosten credits en tijd, dus de route handelt
 * ze apart af en meldt onderweg wat er gebeurt.
 */
export const MAAK_TOOLS = new Set(["plaats_element", "plaats_icoon", "bewerk_beeld", "dek_af", "vul_vlak", "plaats_tekst", "herstel_tekst", "markeer", "vervaag"]);

export type ToolArgs = Record<string, unknown>;

function tekst(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function getal(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Zet een tool-call om naar een op. Geeft null bij iets wat we niet kennen of
 * bij ontbrekende velden — dan hoort de aanroeper het model te laten
 * corrigeren in plaats van te gokken.
 */
export function toolCallNaarOp(naam: string, args: ToolArgs): Op | null {
  const clipId = tekst(args.clipId);
  switch (naam) {
    case "trim_clip": {
      const delta = getal(args.deltaSeconds);
      const edge = args.edge === "in" || args.edge === "out" ? args.edge : null;
      if (!clipId || !edge || delta === null) return null;
      return { op: "trim_clip", clipId, edge, deltaSeconds: delta };
    }
    case "set_duration": {
      const duur = getal(args.duration);
      if (!clipId || duur === null) return null;
      return { op: "set_duration", clipId, duration: duur };
    }
    case "split_clip": {
      const at = getal(args.at);
      if (!clipId || at === null) return null;
      return { op: "split_clip", clipId, at };
    }
    case "delete_clip":
      return clipId ? { op: "delete_clip", clipId } : null;
    case "reorder_clip":
      return clipId ? { op: "reorder_clip", clipId, beforeClipId: tekst(args.beforeClipId) } : null;
    case "set_transition": {
      const edge = args.edge === "in" || args.edge === "out" ? args.edge : null;
      if (!clipId || !edge) return null;
      const kind = args.kind === "fade" ? ("fade" as const) : args.kind === "geen" ? null : undefined;
      if (kind === undefined) return null;
      return { op: "set_transition", clipId, edge, kind, duration: getal(args.duration) ?? 0.5 };
    }
    default:
      return null;
  }
}
