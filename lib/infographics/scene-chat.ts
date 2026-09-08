import { openai } from "@/lib/openai";

// De beeld-chat naast elke scene vervangt de losse knoppen (briefing, regenereer,
// referentiefoto, "pas iets aan"). De gebruiker typt gewoon wat er anders moet;
// deze planner bepaalt wélke handeling daarbij hoort:
//
// - "edit":       gerichte wijziging ín het bestaande beeld. Compositie, stijl en
//                 de rest van de scène blijven staan ("maak het dak blauw").
// - "regenerate": een wezenlijk ander beeld. Dan schrijven we de illustratie-
//                 briefing opnieuw en tekenen we de scène van voren af aan
//                 ("laat het op het strand spelen in plaats van op kantoor").
// - "none":       geen beeldhandeling. Vragen over de voice-over of het script
//                 horen niet in dit vak; die kosten dus ook geen credits.
//
// Fail-open: gaat de planner stuk, dan behandelen we het bericht als een edit op
// het bestaande beeld (of als regeneratie wanneer er nog geen beeld is), zodat de
// gebruiker nooit vastloopt op een kapotte classificatie.

export type SceneChatAction = "edit" | "regenerate" | "none";

export interface SceneChatPlan {
  action: SceneChatAction;
  /** Engelse bewerkingsinstructie voor het edit-model (alleen bij "edit"). */
  instruction: string;
  /** Nieuwe Engelse illustratie-briefing (alleen bij "regenerate"). */
  illustration: string;
  /** De exacte woorden die in beeld mogen staan na deze beurt. */
  labels: string[];
  /** Kort antwoord aan de gebruiker, in het Nederlands. */
  reply: string;
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["action", "instruction", "illustration", "labels", "reply"],
  properties: {
    action: { type: "string", enum: ["edit", "regenerate", "none"] },
    instruction: { type: "string" },
    illustration: { type: "string" },
    labels: { type: "array", items: { type: "string" } },
    reply: { type: "string" },
  },
} as const;

const SYSTEM = `Je bent de beeldassistent van één scene in een geanimeerde explainer-video. De gebruiker ziet de illustratie van die scene en typt in gewone taal wat er anders moet. Jij bepaalt welke handeling daarbij hoort en schrijft de instructie voor het beeldmodel.

KIES ÉÉN ACTIE:
- "edit": de wens is een gerichte wijziging in het BESTAANDE beeld — een kleur, een object erbij of weg, een detail dat niet klopt, een logo dat vervangen moet worden, iets verplaatsen. De compositie blijft herkenbaar hetzelfde. Dit is verreweg het meest voorkomende geval; kies het bij twijfel.
- "regenerate": de wens vraagt om een wezenlijk ANDER beeld — een andere plek, een ander moment, een andere handeling, of "helemaal opnieuw / iets heel anders". Ook als er nog geen beeld is.
- "none": de wens gaat niet over de illustratie (bijvoorbeeld over de voice-over, de tekst, de volgorde van scenes of de video als geheel), of het is een vraag in plaats van een opdracht.

WAT JE INVULT:
- "instruction" (alleen bij "edit"): ÉÉN heldere, concrete, visuele instructie in het ENGELS voor een model dat het beeld bewerkt. Wees expliciet over wat verandert én wat hetzelfde blijft, in zichtbare elementen (kleuren, objecten, posities, personen). Bij "alleen X"-wensen: zeg expliciet dat de rest verdwijnt of neutraal wordt. Laat bij andere acties leeg ("").
- "illustration" (alleen bij "regenerate"): de VOLLEDIGE nieuwe illustratie-briefing in het ENGELS — één concrete, letterlijke scène (wie, wat, waar, welke handeling), met de plek erbij die het hele beeld vult. Neem uit de huidige briefing over wat de gebruiker niet wil veranderen. Geen tekst, letters of cijfers in het beeld. Laat bij andere acties leeg ("").
- "labels": de exacte woorden die NA deze beurt in het beeld mogen staan, in de taal van de video. Neem de huidige labels over als de gebruiker daar niets over zegt. Vraagt hij om een woord erbij, weg of anders, pas de lijst dan aan. Maximaal drie labels van één of twee woorden, correct gespeld. Geen tekst in beeld? Lege lijst.
- "reply": één korte zin in het NEDERLANDS, in de je-vorm, die zegt wat je gaat doen ("Ik zet het logo van de foto op de auto."). Bij "none" leg je vriendelijk uit dat dit vak alleen over het beeld gaat en waar de gebruiker het wél aanpast (de voice-over staat als tekstveld boven de chat).

VASTE CAST: krijg je een cast mee, dan komen die personen in meerdere scenes van dezelfde video voor en moeten ze overal hetzelfde blijven. Noem ze in je instructie of briefing bij naam met hun uiterlijk erbij ("JOHAN (the appraiser, mid-40s, short blond hair, grey blazer over a green shirt)"), en verzin nooit een ander uiterlijk voor ze. Vraagt de gebruiker juist om iemand te veranderen, voer dat dan uit voor deze scene en zeg er in je antwoord bij dat het personage in de andere scenes nog het oude uiterlijk heeft.

TEKST IN BEELD: korte labels mogen en maken de uitleg vaak duidelijker, maar alleen als exact opgegeven woorden — een beeldmodel verzint anders onleesbare letterbrij. Na afloop wordt gecontroleerd of ze goed gespeld in beeld staan.

REFERENTIEFOTO: is er een foto meegestuurd, dan toont die een ECHT product, logo of object dat in het beeld moet kloppen. Verwerk dat expliciet in je instructie ("replace the logo on the car door with the logo from the provided reference photo, keeping the same size and position") en kies vrijwel altijd "edit".`;

// ---------------------------------------------------------------------------
// DE CHAT IN DE OVERHEIDSMODUS.
//
// Daar bestaat de scene niet uit een plaatje maar uit een opbouw die de app zelf
// tekent. Een wens als "zet er een huis bij" is dus geen beeldbewerking maar een
// wijziging in die opbouw — en daarmee gratis: er komt geen beeldmodel aan te pas,
// en er kan ook niets vervormen of verkeerd gespeld worden.
// ---------------------------------------------------------------------------

const LAYOUT_CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["gewijzigd", "template", "titel", "elementen", "reply"],
  properties: {
    gewijzigd: { type: "boolean" },
    template: { type: "string", enum: ["centraal", "rij", "stroom", "vergelijking", "groei", "tafereel"] },
    titel: { type: ["string", "null"] },
    elementen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["icoon", "label", "waarde"],
        properties: {
          icoon: { type: "string" },
          label: { type: "string" },
          waarde: { type: ["number", "null"] },
        },
      },
    },
    reply: { type: "string" },
  },
} as const;

export interface LayoutChatResultaat {
  /** De nieuwe opbouw, of null als er niets te wijzigen viel. */
  layout: { template: string; titel: string | null; elementen: { icoon: string; label: string; waarde: number | null }[] } | null;
  reply: string;
}

export async function planLayoutChat(input: {
  message: string;
  layout: { template: string; titel?: string | null; elementen: { icoon: string; label: string; waarde?: number | null }[] };
  voiceover: string;
  iconen: string[];
  /** Dezelfde sleutels, met uitleg waarvoor ze staan. */
  icoonUitleg?: string[];
  history?: { role: "user" | "assistant"; text: string }[];
}): Promise<LayoutChatResultaat> {
  const message = input.message.trim();
  if (!message) return { layout: null, reply: "Typ wat er aan het beeld moet veranderen." };
  try {
    const verloop = (input.history ?? [])
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Gebruiker" : "Jij"}: ${m.text}`)
      .join("\n");

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `Je past de opbouw van één scene uit een uitleganimatie aan. De scene wordt niet getekend door een AI maar door de app opgebouwd uit vaste bouwstenen, dus je geeft altijd de VOLLEDIGE nieuwe opbouw terug.

SJABLONEN: "tafereel" (het onderwerp groot op een grondbalk met een witte boog erachter en maximaal twee kleinere dingen ernaast — het rijkste beeld), "centraal" (één onderwerp groot in beeld), "rij" (twee tot vier dingen naast elkaar), "stroom" (bron links, pijl, doel rechts), "vergelijking" (twee dingen naast elkaar), "groei" (staven met getallen).

ICONEN — kies per element EXACT één sleutel uit deze lijst (de haakjes zeggen waar het icoon voor staat; gebruik alleen de sleutel ervóór): ${(input.icoonUitleg ?? input.iconen).join(", ")}. Past er niets goed, neem "vlak".

REGELS:
- Twee tot vier elementen, bij "centraal" precies één en bij "vergelijking" precies twee.
- Een label is één of twee woorden, met een hoofdletter, correct gespeld, in de taal van de voice-over. Gebruik bij voorkeur een woord dat letterlijk in de voice-over voorkomt: het element verschijnt namelijk op het moment dat de stem dat woord uitspreekt.
- "waarde" alleen bij "groei" (0-100), anders null.
- Verander alleen wat de gebruiker vraagt; de rest van de opbouw laat je staan.
- Gaat de vraag niet over dit beeld (bijvoorbeeld over de voice-over), zet dan "gewijzigd" op false, geef de huidige opbouw ongewijzigd terug en leg in "reply" uit waar hij het wél aanpast.
- "reply": één korte zin in het Nederlands over wat je gewijzigd hebt.`,
        },
        {
          role: "user",
          content: `VOICE-OVER VAN DEZE SCENE: "${input.voiceover}"

HUIDIGE OPBOUW:
${JSON.stringify(input.layout)}
${verloop ? `\nEERDER IN DIT GESPREK:\n${verloop}\n` : ""}
WENS VAN DE GEBRUIKER:
"""
${message.slice(0, 1000)}
"""`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "layout_chat", strict: true, schema: LAYOUT_CHAT_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      gewijzigd?: boolean;
      template?: string;
      titel?: string | null;
      elementen?: { icoon?: string; label?: string; waarde?: number | null }[];
      reply?: string;
    };
    const reply = (parsed.reply ?? "").trim() || "Aangepast.";
    if (parsed.gewijzigd === false) return { layout: null, reply };

    const geldig = new Set(input.iconen);
    const elementen = (Array.isArray(parsed.elementen) ? parsed.elementen : [])
      .map((el) => ({
        icoon: geldig.has(el?.icoon ?? "") ? (el.icoon as string) : "vlak",
        label: (el?.label ?? "").trim().slice(0, 28),
        waarde: typeof el?.waarde === "number" ? el.waarde : null,
      }))
      .slice(0, 4);
    if (elementen.length === 0) return { layout: null, reply };
    return { layout: { template: parsed.template ?? "rij", titel: (parsed.titel ?? "")?.trim() || null, elementen }, reply };
  } catch (e) {
    console.error("[scene-chat] layout aanpassen mislukt:", e);
    return { layout: null, reply: "Dat lukte niet, probeer het nog eens." };
  }
}

export async function planSceneChat(input: {
  /** Wat de gebruiker typte (meestal Nederlands). */
  message: string;
  /** Huidige illustratie-briefing van de scene (Engels). */
  brief: string;
  /** Heeft de scene al een beeld? Zo nee, dan kan er niets bewerkt worden. */
  hasImage: boolean;
  /** Stuurde de gebruiker een referentiefoto mee bij dit bericht? */
  hasPhoto: boolean;
  /** De vaste cast van het verhaal, zodat een nieuwe briefing dezelfde mensen houdt. */
  cast?: { name: string; role: string; appearance: string }[];
  /** Beeldmodus: in "overheid" is een beeld een diagram, geen scène op een plek. */
  mode?: "story" | "report" | "overheid";
  /** Woorden die nu in beeld staan; de planner mag ze aanpassen. */
  labels?: string[];
  /** Eerdere beurten (oudste eerst), voor context als "en nu iets groter". */
  history?: { role: "user" | "assistant"; text: string }[];
}): Promise<SceneChatPlan> {
  const message = input.message.trim();
  // Zonder beeld valt er niets te bewerken: dan is elk verzoek een nieuw beeld.
  const fallback: SceneChatPlan = input.hasImage
    ? { action: "edit", instruction: message, illustration: "", labels: input.labels ?? [], reply: "Ik pas het beeld aan." }
    : { action: "regenerate", instruction: "", illustration: input.brief || message, labels: input.labels ?? [], reply: "Ik maak het beeld." };
  if (!message) return { ...fallback, action: "none", reply: "Typ wat er aan het beeld moet veranderen." };

  try {
    // In de overheidsmodus is elk beeld een diagram op een leeg lichtgrijs vlak.
    // Zonder deze regel schrijft de planner bij een regeneratie alsnog een scène
    // op een plek, en valt dat ene beeld uit de toon van de hele video.
    const modusRegel =
      input.mode === "overheid"
        ? `BEELDMODUS: OVERHEIDSSTIJL. Elk beeld is een vlak DIAGRAM op een leeg lichtgrijs vlak: objecten, iconen, witte panelen en uitgeknipte figuren, zonder enige omgeving (geen kamer, straat, landschap of horizon) en zonder tekst. Schrijf een nieuwe briefing dus als compositie ("a large beige briefcase in the centre, flanked by two white rounded panels, with a ribbon of gold coins flowing between them"), nooit als scène op een plek.\n\n`
        : "";
    const castRegel = (input.cast ?? []).length
      ? `VASTE CAST VAN DEZE VIDEO:\n${(input.cast ?? []).map((c) => `- ${c.name} (${c.role}): ${c.appearance}`).join("\n")}\n\n`
      : "";
    const verloop = (input.history ?? [])
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Gebruiker" : "Jij"}: ${m.text}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${modusRegel}${castRegel}HUIDIGE ILLUSTRATIE-BRIEFING (Engels):
"""
${input.brief || "(nog geen briefing — deze scene heeft nog geen beeld)"}
"""

STATUS: ${input.hasImage ? "de scene heeft al een beeld" : "de scene heeft NOG GEEN beeld — kies dus \"regenerate\""}.
REFERENTIEFOTO MEEGESTUURD: ${input.hasPhoto ? "ja" : "nee"}.
HUIDIGE TEKST IN BEELD: ${(input.labels ?? []).length ? (input.labels ?? []).map((l) => `"${l}"`).join(", ") : "(geen)"}.
${verloop ? `\nEERDER IN DIT GESPREK:\n${verloop}\n` : ""}
NIEUW BERICHT VAN DE GEBRUIKER:
"""
${message.slice(0, 2000)}
"""`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "scene_chat_plan", strict: true, schema: PLAN_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Partial<SceneChatPlan>;
    const action: SceneChatAction =
      parsed.action === "edit" || parsed.action === "regenerate" || parsed.action === "none" ? parsed.action : fallback.action;
    const plan: SceneChatPlan = {
      action,
      instruction: (parsed.instruction ?? "").trim(),
      illustration: (parsed.illustration ?? "").trim(),
      labels: (Array.isArray(parsed.labels) ? parsed.labels : input.labels ?? [])
        .map((l) => (l ?? "").trim())
        .filter((l) => l.length > 0 && l.length <= 24)
        .slice(0, 3),
      reply: (parsed.reply ?? "").trim() || fallback.reply,
    };

    // Vangnetten. Een bewerking zonder bronbeeld kan niet, en een lege instructie
    // levert een lege edit op: in beide gevallen terugvallen op een nieuw beeld.
    if (plan.action === "edit" && !input.hasImage) {
      return { ...plan, action: "regenerate", instruction: "", illustration: plan.illustration || input.brief || message };
    }
    if (plan.action === "edit" && !plan.instruction) return { ...plan, instruction: message };
    if (plan.action === "regenerate" && !plan.illustration) return { ...plan, illustration: input.brief || message };
    return plan;
  } catch (e) {
    console.error("[scene-chat] plannen mislukt, val terug op standaardactie:", e);
    return fallback;
  }
}
