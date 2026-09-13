import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { sceneCast, VERTELLER_ID, type DialogueCastMember, type DialogueSpec } from "@/lib/infographics/dialogue-schema";
import { toonDraaiboek } from "@/lib/infographics/dialogue-chat-tools";
import { deelLabel } from "@/lib/infographics/verhaallijn";
import {
  bundelPerScene, controleerDraaiboek, leesShotOordeel, leesVerhaalOordeel, nummerFouten, versieVan,
  type ControleFout, type VideoControleUitslag,
} from "@/lib/infographics/video-controle";

export const runtime = "nodejs";
export const maxDuration = 300;

// "LAAT JE VIDEO CONTROLEREN OP FOUTEN"
//
// Doet wat een mens deed bij "Tyrell, Lilly en de Wonderwagen": elk shot bekijken en
// naast het draaiboek leggen. Wie hoort er in beeld en wie staat er echt? Ziet oma er
// nog uit als oma? Staat er tekst op een muur? Klopt de plek, klopt de wagen? En laat
// de video zien wat er in het verhaal gebeurt?
//
// Gratis voor de klant, maar één keer per versie van de video: zie versieVan. Het
// model is hetzelfde als dat tijdens het maken al elk bronbeeld controleert
// (gpt-4o, scherp beeld), dus geen duurder model — ongeveer $0,008 per shot.

/** Zoveel shots tegelijk: snel genoeg voor een video van vijf minuten, zonder rate limits. */
const TEGELIJK = 6;

interface Body {
  spec?: DialogueSpec;
  projectId?: string | null;
}

const PLEK = { left: "links", center: "in het midden", right: "rechts" } as const;
const zoekNaam = (naam: string) => naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function beschrijf(c: DialogueCastMember): string {
  const kenmerken = [(c.appearance ?? "").trim(), (c.leeftijd ?? "").trim() ? `leeftijd ${(c.leeftijd ?? "").trim()}` : ""]
    .filter(Boolean)
    .join("; ");
  return `${c.name}${kenmerken ? ` (${kenmerken})` : ""}`;
}

const SHOT_SYSTEEM = `Je bent eindredacteur van een geanimeerde verhaalvideo en controleert één shot. Je legt het beeld naast wat er volgens het draaiboek hoort te zijn.

Wees streng op ECHTE fouten en zeur niet. Tekenstijl, vereenvoudigde vormen, een andere camerahoek, een andere houding, licht andere belichting en een lege achtergrond zijn GEEN fouten. Voorbijgangers ver op de achtergrond van een openbare plek mogen.

Antwoord met JSON: {"fouten": [{"soort": "...", "wat": "...", "instructie": "..."}]}. Klopt alles: {"fouten": []}.

SOORTEN
- "wie-in-beeld": iemand die in beeld hoort, ontbreekt; of er staat iemand die er niet hoort (iemand die niet in de cast staat, of een tweede versie van hetzelfde personage).
- "uiterlijk": een personage ziet er duidelijk anders uit dan beschreven — ander gezicht, ander kapsel, andere kleding, andere huidskleur of leeftijd — of het is zichtbaar een ander persoon.
- "tekst-in-beeld": letters, woorden of verzonnen tekst op muren, borden of voorwerpen.
- "plek": het shot speelt op een TOTAAL andere plek dan de scène én dan wat het shot volgens zijn beschrijving laat zien — bijvoorbeeld een huiskamer terwijl ze bij een fort horen te zijn. Binnen of buiten hetzelfde gebouw is GEEN fout, een ander deel van dezelfde plek ook niet, en een voorwerp uit de omschrijving dat ontbreekt (een tafel, een kanon) evenmin.
- "voorwerp": een vast voorwerp uit de beeldregie ziet er anders uit dan daar beschreven.
- "lichaam": iets wat fysiek niet kan: vergroeide of ontbrekende ledematen, iemand die in een voorwerp staat of zweeft, gebouwen of voorwerpen die dubbel staan.

"wat": in het Nederlands, hooguit vijftien woorden, zoals je het tegen de maker zegt. Noem namen: "Lilly ontbreekt, terwijl oma iets tegen beide kinderen zegt."
"instructie": in het ENGELS, een concrete correctie voor het beeldmodel: "Lilly (curly afro hair, yellow T-shirt) stands on the right, next to Oma."
Hooguit vier fouten, de ernstigste eerst.`;

/** Eén shot bekijken. Een mislukte controle levert geen fouten op in plaats van een foutmelding. */
async function controleerShot(spec: DialogueSpec, si: number, li: number): Promise<ControleFout[]> {
  const scene = spec.scenes[si];
  const l = scene.lines[li];
  if (!l?.shotImageUrl) return [];

  const inScene = sceneCast(scene, spec.cast, spec.verhaallijn);
  const spreker = spec.cast.find((c) => c.id === l.characterId);
  const isActie = l.kind === "actie";
  const kader = l.kader ?? "medium";

  // Wie er in DIT shot hoort, hangt af van het kader. Een close-up van één
  // personage is geen fout omdat de ander ontbreekt.
  let verwacht: string;
  if (kader === "detail") {
    verwacht = "Dit is een detailopname: er hoeft niemand herkenbaar in beeld te zijn.";
  } else if (!isActie && spreker && (kader === "close" || kader === "extreme-close")) {
    // De eerste proef meldde bij vier close-ups dat de anderen er "te veel" in
    // stonden, en bundelde er twee tot een scèneherstel met tegenstrijdige
    // aanwijzingen. Dat is een camerakeuze, geen fout in het verhaal.
    verwacht =
      `Close-up van ${beschrijf(spreker)}: die hoort in beeld. Staan anderen uit de scène er ook (deels) in, ` +
      `dan is dat GEEN fout. Meld alleen als ${spreker.name} ontbreekt, of als er iemand staat die niet in de scène hoort.`;
  } else if (isActie) {
    const genoemd = inScene.filter((c) => new RegExp(`(^|[^\\p{L}])${zoekNaam(c.name)}([^\\p{L}]|$)`, "iu").test(l.actie ?? ""));
    const rest = inScene.filter((c) => !genoemd.includes(c));
    verwacht = genoemd.length
      ? `Deze personen MOETEN in beeld zijn: ${genoemd.map(beschrijf).join("; ")}.${rest.length ? ` Deze MOGEN er ook zijn: ${rest.map(beschrijf).join("; ")}.` : ""} Niemand anders.`
      : `Deze personen mogen in beeld zijn, niemand anders: ${inScene.map(beschrijf).join("; ")}.`;
  } else {
    verwacht = `Deze personen horen ALLEMAAL in beeld, van links naar rechts: ${inScene.map((c) => `${PLEK[c.position]} ${beschrijf(c)}`).join("; ")}. Niemand anders.`;
  }

  const deel = scene.deel ? spec.verhaallijn?.[scene.deel - 1] : undefined;
  const wie = l.characterId === VERTELLER_ID ? "De verteller" : spreker?.name ?? "Iemand";
  const tekst = [
    `DE PLEK VAN DEZE SCÈNE: ${scene.setting}${deel?.plek ? ` (${deel.plek})` : ""}`,
    verwacht,
    isActie
      ? `DIT SHOT TOONT: ${l.actie}\n(Bij dit shot is deze beschrijving leidend voor de plek: laat het de aankomst of een ander deel van de plek zien, dan is dat goed.)`
      : `${wie} praat in dit shot.`,
    (l.text ?? "").trim() ? `Wat er gezegd wordt: ${wie}: "${l.text}"` : "",
    (spec.illustrationBrief ?? "").trim() ? `BEELDREGIE (vaste voorwerpen staan hierin beschreven): ${spec.illustrationBrief}` : "",
    "Controleer het shot.",
  ].filter(Boolean).join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: SHOT_SYSTEEM },
        {
          role: "user",
          content: [
            { type: "text", text: tekst },
            { type: "image_url", image_url: { url: l.shotImageUrl, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });
    return leesShotOordeel(JSON.parse(completion.choices[0]?.message?.content ?? "{}"), si, li);
  } catch (e) {
    console.error(`[dialogue-controle] shot ${si + 1}.${li + 1} niet gecontroleerd:`, e);
    return [];
  }
}

/** Laat de video zien wat er in de verhaallijn gebeurt? */
async function controleerVerhaal(spec: DialogueSpec): Promise<ControleFout[]> {
  const lijn = spec.verhaallijn ?? [];
  if (!lijn.length) return [];
  const overzicht = lijn.map((d, i) => `${i + 1}. ${deelLabel(d, i)} — ${d.wat}`).join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "Je controleert of een geanimeerde video zijn verhaal laat zien. Je krijgt de verhaallijn (wat er per moment " +
            "gebeurt) en het draaiboek (wat er in elke scène gezegd en getoond wordt; bij elke scène staat bij welk deel " +
            "hij hoort).\n\n" +
            "Meld alleen wat een kijker ECHT mist: een handeling of gebeurtenis die bij een moment in de verhaallijn staat " +
            "en in de scènes van dat deel nergens te zien is (in een actiebeeld) of te horen is (in een zin). Voorbeeld: " +
            "\"oma trekt het kleed van de wagen\" staat in de verhaallijn, maar geen shot laat dat zien en niemand noemt het.\n\n" +
            "Niet melden: kleine details, sfeer, gevoelens, dingen die in andere woorden wel gezegd of getoond worden, " +
            "of wat bij een ander moment hoort.\n\n" +
            'Antwoord met JSON: {"fouten": [{"deel": 3, "wat": "...", "actie": "..."}]}. Klopt het: {"fouten": []}. ' +
            '"wat" in het Nederlands, hooguit vijftien woorden. "actie" in het ENGELS: een actiebeeld dat het laat zien, ' +
            "op menselijke schaal, met de namen van wie erin staan. Hooguit vijf.",
        },
        { role: "user", content: `DE VERHAALLIJN:\n${overzicht}\n\nHET DRAAIBOEK:\n${toonDraaiboek(spec.cast, spec.scenes)}` },
      ],
      response_format: { type: "json_object" },
    });
    return leesVerhaalOordeel(JSON.parse(completion.choices[0]?.message?.content ?? "{}"), spec);
  } catch (e) {
    console.error("[dialogue-controle] verhaalcontrole mislukt:", e);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const spec = body.spec;
    if (!spec || !Array.isArray(spec.scenes) || !Array.isArray(spec.cast)) {
      return NextResponse.json({ error: "Geen video meegestuurd" }, { status: 400 });
    }
    const versie = versieVan(spec);

    // Eén keer per versie. De uitslag staat in het bewaarde project; is deze versie
    // al gecontroleerd, dan krijgt de gebruiker die uitslag terug en kost het niets.
    // Zonder project kan dat niet worden nagegaan, dus dan geen controle: anders is
    // "één keer per versie" te omzeilen door het project gewoon niet mee te sturen.
    if (!body.projectId) {
      return NextResponse.json({ error: "Bewaar je project eerst, daarna kun je de video laten controleren." }, { status: 400 });
    }
    const { data: project } = await supabase
      .from("projects")
      .select("story_spec")
      .eq("id", body.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    const eerder = (project.story_spec as DialogueSpec | null)?.controle;
    if (eerder && eerder.versie === versie) return NextResponse.json({ controle: eerder, eerder: true });

    const shots = spec.scenes
      .flatMap((s, si) => s.lines.map((l, li) => ({ si, li, beeld: l.shotImageUrl })))
      .filter((x) => x.beeld);
    if (shots.length === 0) {
      return NextResponse.json({ error: "Er zijn nog geen shots om te controleren. Maak eerst de video." }, { status: 400 });
    }

    const shotFouten: ControleFout[] = [];
    let volgende = 0;
    const [, verhaalFouten] = await Promise.all([
      Promise.all(
        Array.from({ length: Math.min(TEGELIJK, shots.length) }, async () => {
          while (volgende < shots.length) {
            const { si, li } = shots[volgende++];
            shotFouten.push(...(await controleerShot(spec, si, li)));
          }
        }),
      ),
      controleerVerhaal(spec),
    ]);

    const fouten = nummerFouten([...controleerDraaiboek(spec), ...bundelPerScene(shotFouten, spec), ...verhaalFouten]);
    const controle: VideoControleUitslag = {
      versie,
      gecontroleerdOp: new Date().toISOString(),
      shotsBekeken: shots.length,
      fouten,
    };
    console.log(`[dialogue-controle] ${shots.length} shots bekeken, ${fouten.length} fouten (${[...new Set(fouten.map((f) => f.soort))].join(", ")})`);
    return NextResponse.json({ controle });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-controle failed:", msg);
    return NextResponse.json({ error: "Controleren mislukt", detail: msg }, { status: 500 });
  }
}
