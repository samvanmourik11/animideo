// DE OPZET UITWERKEN — één goedkope tekstcall die van een los idee een compleet
// ingevuld voorstel maakt: titel, kernboodschap, wending, toon, invalshoek,
// tekenstijl, beeldregie en een rolverdeling uit de eigen personagebibliotheek.
//
// Waarom een aparte route en niet gewoon het draaiboek: een draaiboek is duur en
// staat vast zodra het er is. Dit voorstel is goedkoop, leesbaar in tien seconden
// en volledig aanpasbaar. Je regisseert dus vóór het schrijven in plaats van
// achteraf te corrigeren op een script dat er al omheen geschreven is.
//
// Wat de gebruiker zelf al invulde is heilig; zie mergeCast in lib/dialogue-setup.
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { MAX_CAST, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { mergeCast, type DialogueSetup, type VastCastLid } from "@/lib/infographics/dialogue-setup";
import { STORY_STYLE_PRESETS, DEFAULT_STORY_STYLE } from "@/lib/infographics/story-style";
import { STORY_VOICES } from "@/lib/infographics/story-voices";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  topic?: string;
  text?: string;
  targetSeconds?: number;
  format?: "16:9" | "9:16";
  language?: string;
  /** Personages die de gebruiker zelf al vastlegde. Die liggen vast. */
  vasteCast?: VastCastLid[];
}

const SETUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "topic", "kern", "wending", "tone", "angle", "styleId", "illustrationBrief", "keepTerms", "avoidTerms", "cast"],
  properties: {
    title: { type: "string" },
    topic: { type: "string" },
    kern: { type: "string" },
    wending: { type: "string" },
    tone: { type: "string", enum: ["zakelijk", "speels", "energiek"] },
    angle: { type: "string" },
    styleId: { type: "string" },
    illustrationBrief: { type: "string" },
    keepTerms: { type: "array", items: { type: "string" } },
    avoidTerms: { type: "array", items: { type: "string" } },
    cast: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["characterId", "role", "wil", "spraak", "leeftijd", "voice"],
        properties: {
          characterId: { type: "string" },
          role: { type: "string" },
          wil: { type: "string" },
          spraak: { type: "string" },
          leeftijd: { type: "string" },
          voice: { type: "string" },
        },
      },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Beschrijf eerst waar de video over gaat" }, { status: 400 });

    const vasteCast = (Array.isArray(body.vasteCast) ? body.vasteCast : []).slice(0, MAX_CAST);
    const language = body.language ?? "Nederlands";
    const format = body.format === "9:16" ? "9:16" : "16:9";
    const targetSeconds = Math.max(20, Math.min(300, Math.round(body.targetSeconds ?? 60)));

    // De bibliotheek meegeven zodat de assistent uit ÉCHTE personages kan kiezen.
    // Zonder deze lijst verzint hij namen die nergens een portret bij hebben, en
    // dan valt de rolverdeling in het voorstel meteen om.
    const { data: rijen } = await supabase
      .from("characters")
      .select("id, name, description, gender, age_range, image_url")
      .eq("user_id", user.id)
      .not("image_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(40);
    const bibliotheek = (rijen ?? []) as Pick<Character, "id" | "name" | "description" | "gender" | "age_range" | "image_url">[];

    const bibliotheekLijst = bibliotheek.length
      ? bibliotheek
          .map((c) => `- id "${c.id}": ${c.name}${c.gender ? `, ${c.gender}` : ""}${c.age_range ? `, ${c.age_range}` : ""}${c.description ? ` — ${c.description}` : ""}`)
          .join("\n")
      : "(de gebruiker heeft nog geen personages met een afbeelding)";

    const vastLijst = vasteCast.length
      ? vasteCast
          .map((c) => `- id "${c.characterId}": ${c.name}${c.role?.trim() ? ` — de gebruiker gaf deze rol: "${c.role.trim()}"` : " (nog geen rol gekozen)"}`)
          .join("\n")
      : "(de gebruiker heeft nog niemand gekozen; kies zelf een passend duo)";

    const stemLijst = STORY_VOICES.map((v) => `"${v.id}"`).join(", ");
    const stijlLijst = STORY_STYLE_PRESETS.map((s) => `"${s.id}" (${s.name})`).join(", ");

    const system = `Je bent regisseur van korte geanimeerde DIALOOG-video's. Je schrijft nu NOG GEEN dialoog. Je levert de OPZET: de keuzes waar de scenarist straks mee aan de slag gaat.

Je antwoordt uitsluitend met JSON volgens het schema.

DE PERSONAGEBIBLIOTHEEK van deze gebruiker (gebruik ALLEEN deze id's):
${bibliotheekLijst}

AL VASTGELEGD DOOR DE GEBRUIKER — deze personages liggen vast, met de rol die er staat. Neem ze over en verzin er geen vervanger voor:
${vastLijst}

WAT JE LEVERT:
- "title": korte werktitel in ${language}.
- "topic": één zin die zegt waar de video over gaat.
- "kern": de kernboodschap waar het gesprek naartoe werkt. Eén zin, concreet, in ${language}. Dit is wat de kijker moet onthouden.
- "wending": het omslagpunt in het gesprek — het moment waarop de twijfelaar omgaat of het kwartje valt. Eén zin. Zonder wending zijn twee personages het meteen eens en valt er niets te kijken.
- "tone": "zakelijk", "speels" of "energiek", passend bij onderwerp en publiek.
- "angle": de invalshoek waaruit je het onderwerp benadert ("vanuit de twijfel van de klant"). Leeg als er geen bijzondere hoek nodig is.
- "styleId": kies uit ${stijlLijst}.
- "illustrationBrief": regie die voor ELK beeld geldt — kleurgebruik, kleding, soort omgeving. Twee zinnen, in ${language}. Beschrijf hoe het eruitziet, niet wat er gezegd wordt.
- "keepTerms": merk- en productnamen uit de brontekst die exact zo moeten blijven staan. Leeg als er geen zijn.
- "avoidTerms": namen die beter niet vallen (concurrenten, herleidbare klantnamen). Meestal leeg.
- "cast": ${MAX_CAST === 3 ? "twee of drie" : "twee"} personages, ALTIJD met een "characterId" uit de bibliotheek hierboven. Per personage:
  - "role": wie diegene in dit gesprek is ("de expert", "de sceptische ondernemer").
  - "wil": wat diegene in dit gesprek wil bereiken. Laat de verlangens BOTSEN — zonder tegengesteld belang schrijft de scenarist twee mensen die het overal over eens zijn.
  - "spraak": hoe diegene praat ("korte, directe zinnen", "denkt hardop, twijfelt"). Maak ze onderling duidelijk verschillend, anders zijn hun regels verwisselbaar.
  - "leeftijd": leeftijd in dit verhaal ("ongeveer 40"). Bepaalt hoe groot iemand getekend wordt.
  - "voice": kies uit ${stemLijst}. Geef nooit twee personages dezelfde stem.

Een goed gesprek heeft één gids die het weet en één die het nog niet weet. Bouw dat verschil in.`;

    const userPrompt = `WAT DE GEBRUIKER WIL MAKEN:
"""
${text.slice(0, 8000)}
"""

${body.topic?.trim() ? `OPGEGEVEN ONDERWERP: ${body.topic.trim()}\n` : ""}GEWENSTE LENGTE: ongeveer ${targetSeconds} seconden.
FORMAAT: ${format}.
TAAL VAN DE VIDEO: ${language}.

Geef nu de opzet als JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      max_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "dialogue_setup", strict: true, schema: SETUP_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let ruw: Record<string, unknown>;
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldig antwoord van het model" }, { status: 500 });
    }

    // Het voorstel omzetten naar echte castleden: alleen id's die in de
    // bibliotheek bestaan overleven, want een personage zonder portret kan
    // straks niet getekend worden.
    const opId = new Map(bibliotheek.map((c) => [c.id, c]));

    const geldigeStemmen = new Set(STORY_VOICES.map((v) => v.id));
    const voorstelCast: DialogueCastMember[] = (Array.isArray(ruw.cast) ? ruw.cast : [])
      .map((c, i): DialogueCastMember | null => {
        const rij = opId.get(String((c as { characterId?: string }).characterId ?? ""));
        if (!rij) return null;
        const p = c as Record<string, string>;
        const stem = geldigeStemmen.has(p.voice) ? p.voice : "";
        return {
          id: `char-${i + 1}`,
          characterId: rij.id,
          name: rij.name,
          role: (p.role ?? "").trim(),
          leeftijd: (p.leeftijd ?? "").trim() || rij.age_range || null,
          wil: (p.wil ?? "").trim() || null,
          spraak: (p.spraak ?? "").trim() || null,
          voice: stem,
          portraitUrl: rij.image_url ?? "",
          position: "left" as const,
          appearance: rij.description ?? null,
        };
      })
      .filter((c): c is DialogueCastMember => c !== null && !!c.portraitUrl);

    const styleId = STORY_STYLE_PRESETS.some((s) => s.id === ruw.styleId)
      ? String(ruw.styleId)
      : DEFAULT_STORY_STYLE;

    const setup: DialogueSetup = {
      title: String(ruw.title ?? "").trim() || "Naamloze dialoog",
      topic: String(ruw.topic ?? body.topic ?? "").trim(),
      text,
      kern: String(ruw.kern ?? "").trim(),
      wending: String(ruw.wending ?? "").trim(),
      tone: ["zakelijk", "speels", "energiek"].includes(String(ruw.tone)) ? String(ruw.tone) : "zakelijk",
      angle: String(ruw.angle ?? "").trim(),
      language,
      keepTerms: (Array.isArray(ruw.keepTerms) ? ruw.keepTerms : []).map(String).map((t) => t.trim()).filter(Boolean),
      avoidTerms: (Array.isArray(ruw.avoidTerms) ? ruw.avoidTerms : []).map(String).map((t) => t.trim()).filter(Boolean),
      format,
      styleId,
      illustrationBrief: String(ruw.illustrationBrief ?? "").trim(),
      cast: mergeCast(vasteCast, voorstelCast),
      targetSeconds,
    };

    return NextResponse.json({ setup });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-setup failed:", msg);
    return NextResponse.json({ error: "Opzet uitwerken mislukt", detail: msg }, { status: 500 });
  }
}
