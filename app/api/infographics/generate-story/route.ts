import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { buildStoryPrompt } from "@/lib/infographics/build-story-prompt";
import { knipScriptInScenes, isLetterlijk } from "@/lib/infographics/story-script";
import { storySpecSchema, castRefsVanSpec, mergeVasteCast, castRefsVoorScene, MAX_CAST_REFS, type StorySpec, type StoryScene, type StoryCastMember, type StoryCastRef } from "@/lib/infographics/story-schema";
import { generateImageWithStyle, cleanupSceneIllustration, cleanupFlatGraphic } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { isBeperkteStijl, visualStyleVan, buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint, castRefGuidance, castGuidance, CAST_SHEET_GUIDANCE, GEEN_CAST_IN_SCENE, buildCastSheetBrief, castSheetRefLine } from "@/lib/infographics/story-style";
import { artDirectScenes, regisseerOverheidScenes } from "@/lib/infographics/art-direct";
import { ICOON_SLEUTELS, icoonKeuzelijst } from "@/lib/infographics/overheid-scene";
import { borgBeeldtekst } from "@/lib/infographics/tekst-controle";
import { nlBeeldkennis } from "@/lib/infographics/nl-beeldkennis";
import { keurStoryBeeld, herkansingRegels, minstFout, type StoryFout } from "@/lib/infographics/story-keuring";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { isTeamAccount, magRealistischeStijl } from "@/lib/studio/access";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  topic?: string;
  text?: string;
  // Een kant-en-klaar voice-over script van de gebruiker. Staat dit erin, dan
  // schrijft de AI niets: de tekst wordt letterlijk in scenes geknipt en alleen
  // het beeld wordt nog bedacht. Zie lib/infographics/story-script.ts.
  script?: string;
  // Al gelezen shots uit een draaiboek (zie /api/infographics/lees-draaiboek):
  // voice-over letterlijk, plus het beeld en de beweging die de maker zelf
  // beschreef. Staat dit erin, dan gaat `script` niet meer door de knipper.
  shots?: { voiceover?: string; beeld?: string; beweging?: string; tekstInBeeld?: string }[];
  mode?: "story" | "report" | "overheid";
  // Tekst in beeld (koppen, accentwoorden, grote getallen).
  tekstInBeeld?: boolean;
  format?: InfographicFormat;
  // Gewenste videolengte in seconden. Stuurt het aantal scenes (hoe langer, hoe
  // meer scenes) en de voice-over-lengte per scene.
  targetSeconds?: number;
  // Huisstijlkleuren (hex) voor het "zachte" illustratie-palet. Leeg = vrij palet.
  brandColors?: { primary?: string; accent?: string };
  // Gekozen tekenstijl (zie STORY_STYLE_PRESETS). Leeg = flat-vector.
  styleId?: string;
  // Taal van script + voice-over (mensleesbaar NL, bijv. "Engels"). Leeg = Nederlands.
  language?: string;
  // Merk-/eigennamen die niet vertaald mogen worden (do-not-translate).
  keepTerms?: string[];
  // Merk-/eigennamen die nergens genoemd mogen worden (bron-anoniem).
  avoidTerms?: string[];
  // Verteltoon + optionele invalshoek.
  tone?: string;
  angle?: string;
  // Verouderd — één vast personage. Blijft geaccepteerd voor oudere clients.
  characterUrl?: string;
  characterRole?: string | null;
  // De cast die de gebruiker zelf heeft samengesteld: portret + naam + rol.
  castRefs?: StoryCastRef[];
}

// Gemiddeld spreektempo (woorden/sec) en richtlengte per scene (sec), waaruit we
// het aantal scenes en de woorden per scene afleiden. Eén bron van waarheid voor
// "hoe langer de video, hoe meer scenes".
const WORDS_PER_SEC = 2.6;
// Een scene duurt in de praktijk ~5-7 seconden; ~6s als richtwaarde. Daarmee
// klopt de getoonde schatting (bijv. 12 scenes ≈ 72s) met wat de video speelt.
const SECONDS_PER_SCENE = 6;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Werktitel uit de eerste zin van een aangeleverd script, voor als er geen onderwerp is ingevuld. */
function eersteZin(script: string): string {
  const eerste = script.trim().split(/(?<=[.!?])\s|\n/)[0] ?? "";
  const kaal = eerste.trim().replace(/[.!?]+$/, "");
  return kaal.length > 70 ? `${kaal.slice(0, 67)}…` : kaal || "Mijn verhaal";
}

function planLength(targetSeconds: number) {
  const secs = clamp(Math.round(targetSeconds), 20, 240);
  const sceneCount = clamp(Math.round(secs / SECONDS_PER_SCENE), 3, 20);
  const wordsPerScene = clamp(Math.round((secs * WORDS_PER_SEC) / sceneCount), 12, 55);
  return { secs, sceneCount, wordsPerScene };
}


export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const eigenScript = (body.script ?? "").trim();
    // Met een eigen script is dát de bron: de beeldregie leest hem net zo goed
    // als een losse brontekst, dus een apart bronveld is dan niet verplicht.
    const rawText = (body.text ?? "").trim() || eigenScript;
    if (!rawText) return NextResponse.json({ error: "Geen brontekst opgegeven" }, { status: 400 });

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    // De Overheidsstijl is nog in aanbouw en staat daarom alleen voor interne
    // accounts in het menu. Een verborgen optie is geen grendel — wie de aanroep
    // naspeelt zou hem alsnog krijgen — dus controleren we het hier ook.
    const gevraagdeModus = body.mode === "report" ? "report" : body.mode === "overheid" ? "overheid" : "story";
    const mode =
      gevraagdeModus === "overheid" && !isTeamAccount(user.email) ? "story" : gevraagdeModus;
    // De overheidsmodus tekent diagrammen op een leeg vlak in plaats van scènes op
    // een plek, en negeert daarmee de gekozen tekenstijl (zie OVERHEID_FRAMING).
    const kader = mode === "overheid" ? ("overheid" as const) : ("verhaal" as const);
    // Een beperkte stijl (nu: de realistische) is niet zomaar voor iedereen.
    // Het menu verbergt hem al, maar wie de aanroep naspeelt zou hem alsnog
    // krijgen — daarom hier ook, net als bij de overheidsmodus hierboven.
    const gevraagdeStijl = body.styleId ?? "flat-vector";
    const styleId =
      isBeperkteStijl(gevraagdeStijl) && !magRealistischeStijl(user.email) ? "flat-vector" : gevraagdeStijl;
    // De realistische stijl leunt op referentiebeelden uit het stijlpack; de
    // andere stijlen doen het met alleen de prompt.
    const visualStyle = visualStyleVan(styleId);
    const language = body.language ?? "Nederlands";
    const keepTerms = Array.isArray(body.keepTerms) ? body.keepTerms : [];
    const characterUrl = body.characterUrl?.trim() || null;
    // De zelf samengestelde cast, met de oude enkel-personage-velden als terugval
    // zodat een oudere client (of een herhaalde aanroep van een bestaand verhaal)
    // niet stilletjes zijn personage kwijtraakt.
    const castRefs = castRefsVanSpec({
      castRefs: body.castRefs ?? null,
      characterUrl,
      characterRole: body.characterRole ?? null,
    }).slice(0, MAX_CAST_REFS);
    const castRefUrls = castRefs.map((r) => r.url);
    const { secs, sceneCount: geplandeScenes, wordsPerScene } = planLength(body.targetSeconds ?? 60);

    // Een eigen script bepaalt zelf zijn lengte: de gekozen videolengte telt dan
    // niet mee, want we gaan geen zinnen weglaten of bijschrijven.
    const shots = Array.isArray(body.shots) ? body.shots.filter((sh) => (sh?.voiceover ?? "").trim() || (sh?.beeld ?? "").trim()) : [];
    const scriptScenes = shots.length
      ? shots.map((sh) => (sh.voiceover ?? "").trim())
      : eigenScript ? knipScriptInScenes(eigenScript) : [];
    const eigenTekst = !!eigenScript || shots.length > 0;
    if (eigenTekst && scriptScenes.length === 0) {
      return NextResponse.json({ error: "Het script is leeg" }, { status: 400 });
    }
    // De belofte aan de gebruiker is dat zijn tekst letterlijk blijft. Klopt dat
    // niet, dan stoppen we vóór het afrekenen in plaats van stilletjes iets
    // anders te maken.
    if (eigenScript && !shots.length && !isLetterlijk(eigenScript, scriptScenes)) {
      return NextResponse.json({ error: "Het script kon niet letterlijk in scenes verdeeld worden" }, { status: 500 });
    }
    const sceneCount = eigenTekst ? scriptScenes.length : geplandeScenes;

    // Credits: 1 voor het script + 1 beeld-tarief per geplande scene. Vooraf
    // afgerekend zodat we niets genereren als het saldo te laag is.
    //
    // De overheidsmodus tekent zijn scenes zelf (SVG, geen beeldmodel) en kost
    // dus alleen het script. Dat scheelt de gebruiker een credit per scene.
    const isOverheid = body.mode === "overheid";
    const cost = CREDIT_COSTS.SCRIPT_GENERATION + (isOverheid ? 0 : sceneCount * CREDIT_COSTS.IMAGE_GENERATION);
    const credit = await deductCredits(user.id, cost, `Story genereren (${sceneCount} scenes)`);
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: cost },
        { status: 402 }
      );
    }

    // De overheidsmodus tekent zijn eigen scenes en heeft geen losse tekstlaag.
    const tekstInBeeld = body.tekstInBeeld === true && mode !== "overheid";

    // 1a. EIGEN SCRIPT — de scriptschrijver wordt overgeslagen. De scenes komen
    // rechtstreeks uit de tekst van de gebruiker; de beeldregie hieronder vult
    // de illustratie-briefings aan, precies zoals bij een geschreven script.
    let spec: StorySpec;
    if (eigenTekst) {
      spec = {
        version: 1,
        title: (body.topic ?? "").trim() || eersteZin(scriptScenes.find(Boolean) ?? eigenScript),
        format,
        mode,
        scenes: scriptScenes.map((voiceover, i) => ({
          id: `scene-${i}`,
          voiceover,
          // Komt het uit een draaiboek, dan staat hier het beeld dat de maker
          // zelf beschreef; anders leeg en bedenkt de art-direction het.
          illustration: (shots[i]?.beeld ?? "").trim(),
          // De "Tekst in beeld"-kolom alleen gebruiken als de gebruiker tekst in
          // beeld wil; anders blijft het beeld schoon.
          labels: tekstInBeeld && (shots[i]?.tekstInBeeld ?? "").trim() ? [shots[i]!.tekstInBeeld!.trim()] : [],
        })),
      } as StorySpec;
    } else {
      const { system, user: userPrompt } = buildStoryPrompt({
        tekstInBeeld,
        topic: body.topic ?? "",
        rawText,
        format,
        mode,
        language,
        keepTerms,
        avoidTerms: Array.isArray(body.avoidTerms) ? body.avoidTerms : [],
        tone: body.tone,
        angle: body.angle,
        targetSeconds: secs,
        sceneCount,
        wordsPerScene,
      });

      // 1. Script + scene-briefings via de LLM (gestructureerd).
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        // Lager dan voorheen (0.6): feitelijke content, minder creatieve elaboratie
        // en minder kans op verzonnen cijfers.
        temperature: 0.35,
        // Schaal de tokenruimte mee met het aantal scenes zodat lange video's niet
        // halverwege worden afgekapt (~350 tokens per scene + marge).
        max_tokens: clamp(sceneCount * 350 + 800, 4000, 16000),
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "story_spec", strict: true, schema: storySpecSchema(tekstInBeeld) as unknown as Record<string, unknown> },
        },
      });

      try {
        spec = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as StorySpec;
      } catch {
        return NextResponse.json({ error: "Ongeldige JSON van model" }, { status: 500 });
    }
    }

    if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen scenes gegenereerd" }, { status: 500 });
    }
    spec.format = format;
    spec.mode = mode;
    spec.tekstInBeeld = tekstInBeeld;

    // 2a. OVERHEIDSMODUS — geen beeldmodel, maar een opbouw die de app zelf
    // tekent en animeert (zie lib/infographics/overheid-scene.ts). Hier eindigt
    // de route dus al: er valt niets te genereren, te schonen of te controleren.
    if (isOverheid) {
      const layouts = await regisseerOverheidScenes({
        topic: body.topic ?? spec.title ?? "",
        rawText,
        scenes: spec.scenes.map((s) => ({ voiceover: s.voiceover })),
        iconen: ICOON_SLEUTELS,
        icoonUitleg: icoonKeuzelijst(),
      });
      const scenes: StoryScene[] = spec.scenes.map((s, i) => ({
        ...s,
        id: s.id || `scene-${i}`,
        imageUrl: null,
        // Zonder regie een leeg maar geldig sjabloon: de scene blijft dan zichtbaar
        // (titel + achtergrond) in plaats van dat het verhaal stukloopt.
        layout: layouts?.[i] ?? { template: "centraal", titel: null, elementen: [{ icoon: "vlak", label: "" }] },
      }));
      return NextResponse.json({ spec: { ...spec, scenes, styleId, language, cast: [], castSheetUrl: null, castRefs } });
    }

    // 2. Art-direction: de illustratie-briefings upgraden met begrip van het HELE
    // verhaal + de bron, zodat de beelden bewust matchen met de voice-over (en
    // niet generiek/random voelen). Mislukt dit, dan houden we de scriptbriefings.
    const art = await artDirectScenes({
      mode,
      language,
      topic: body.topic ?? spec.title ?? "",
      rawText,
      scenes: spec.scenes.map((s, i) => ({ voiceover: s.voiceover, beeldWens: shots[i]?.beeld ?? "" })),
      characterRole: characterUrl ? body.characterRole : null,
      vasteCast: castRefs.length ? castRefs : null,
    });
    // De cast hoort bij het verhaal, niet bij één scene: hij gaat mee naar elke
    // beeld-prompt én wordt in de spec bewaard, zodat een latere regeneratie via
    // de chat dezelfde mensen tekent. Vóór deze stap werd de castbeschrijving
    // stilletjes weggegooid en verzon elke scene zijn eigen hoofdpersoon.
    const gegenereerdeCast: StoryCastMember[] = art?.cast ?? [];
    // De zelf gekozen personages MOETEN in de cast staan, ook als de regie ze
    // vergat of anders noemde. De refs komen er mét definitieve naam uit: die
    // naam koppelt het portret aan de scenes waarin diegene voorkomt.
    const { cast, refs: castRefsMetNaam } = mergeVasteCast(gegenereerdeCast, castRefs);
    if (art) {
      spec.scenes = spec.scenes.map((s, i) => ({
        ...s,
        illustration: art.illustrations[i] || s.illustration,
        castNames: art.sceneCast[i] ?? [],
        labels: art.sceneLabels[i] ?? s.labels ?? [],
      }));
    }
    // Bij een eigen script is er geen scriptbriefing om op terug te vallen: de
    // scenes kwamen kaal uit de tekst. Valt de beeldregie weg, dan is het beeld
    // uit het draaiboek (of anders de voice-over) de briefing — beter een beeld
    // bij de juiste zin dan een leeg vlak.
    if (eigenTekst) {
      spec.scenes = spec.scenes.map((s, i) => ({
        ...s,
        illustration: s.illustration?.trim() || (shots[i]?.beeld ?? "").trim() || s.voiceover,
      }));
    }

    // 3. Consistente look tussen scenes: vaste seed + een "anker"-beeld. We
    // genereren scene 0 eerst en gebruiken die als stijl-/character-referentie
    // voor alle overige scenes, zodat het hele verhaal als één set oogt. Lukt het
    // anker niet, dan vallen we terug op alleen de gedeelde seed.
    const seed = Math.floor(Math.random() * 2_000_000);
    // Zacht huisstijl-palet: geldt voor het anker én alle scenes, zodat de hele
    // set kleurtechnisch bij de huisstijl aansluit.
    const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);

    // HET CASTBLAD — één beeld waarop de hele cast naast elkaar staat, dat daarna
    // als zwaarst wegende referentie bij élke scene meegaat. Een tekstbeschrijving
    // houdt kleding en kleur wel vast, maar een gezicht en de onderlinge lengte
    // niet; dat is precies waarom dezelfde persoon per scene een ander mens leek.
    // Alleen zinvol vanaf twee terugkerende personen — bij één (of geen) doet de
    // tekstuele castbeschrijving het werk.
    //
    // Het castblad kost de gebruiker NIETS. Het is geen beeld dat hij bestelt maar
    // gereedschap van de tool om de scenes die hij wél betaalt consistent te
    // krijgen; daar een credit voor rekenen straft juist de video's met meerdere
    // personages. De providerkosten van deze ene generatie zijn voor ons.
    let castSheetUrl: string | null = null;
    if (cast.length >= 2 || castRefs.length >= 2) {
      try {
        const sheet = await generateImageWithStyle({
          // Kader "vlak" (de standaard): dit is een referentieblad, geen scène.
          prompt: buildIllustrationPrompt(buildCastSheetBrief(cast), styleId, language),
          format,
          visualStyle,
          seed,
          // Alle gekozen portretten als character-refs: het castblad is het
          // ene beeld waarop iedereen naast elkaar staat, dus hier moeten ze
          // allemaal in — daarna erft elke scene de identiteit van dit blad.
          characterUrls: castRefUrls.length ? castRefUrls : undefined,
          extraContext: [
            paletteHint,
            castRefGuidance(castRefsMetNaam),
            castSheetRefLine(castRefsMetNaam),
          ].filter(Boolean).join(" ").trim() || undefined,
        });
        castSheetUrl = await persistFalAssetSoft(supabase, user.id, sheet.imageUrl, "image");
      } catch (e) {
        // Zonder castblad valt het verhaal terug op de tekstuele cast: minder
        // strak, maar beter dan helemaal geen beelden.
        console.error("[generate-story] castblad mislukt, verder zonder:", e);
      }
    }

    const renderScene = async (scene: StoryScene, i: number, anchorUrl: string | null): Promise<StoryScene> => {
      try {
        // Alleen de gezichten van wie in DEZE scene staat. Weet de regie niet wie
        // erin staat (geen castNames), dan liever iedereen dan niemand: een
        // ontbrekend portret betekent een nieuw verzonnen gezicht.
        const refsInScene = castRefsVoorScene(castRefsMetNaam, scene.castNames);
        // HOORT DE CAST IN DEZE SCENE? Het castblad ging naar élk beeld, ook naar
        // scenes waarin de regie niemand had ingedeeld. In een verhaal over Pompeii
        // stonden de Romeinse personages daardoor óók in de scenes over het heden:
        // het blad zit in de zwaarst wegende referentieslots, dus het beeldmodel
        // tekent die mensen er gewoon bij. Heeft de regie deze scene leeg gelaten,
        // dan gaat het blad niet mee en zegt de prompt het er expliciet bij.
        //
        // Alleen als de regie helemaal niets heeft ingedeeld (art-direction
        // mislukt) valt alles terug op het oude gedrag: dan is "iedereen" beter
        // dan een verhaal waarin de hoofdpersoon nergens meer op lijkt.
        const regieDeeldeCastIn = spec.scenes.some((sc) => (sc.castNames ?? []).length > 0);
        const castInDezeScene = !regieDeeldeCastIn || (scene.castNames ?? []).length > 0;
        const bladVoorScene = castInDezeScene ? castSheetUrl : null;
        const extraContext = [
          // Het uiterlijk van Nederlandse dingen ligt vast; laat het beeldmodel er
          // geen Amerikaanse versie van maken.
          nlBeeldkennis(language, scene.illustration, scene.voiceover, (scene.labels ?? []).join(" ")),
          paletteHint,
          castInDezeScene ? castGuidance(cast, scene.castNames) : GEEN_CAST_IN_SCENE,
          bladVoorScene ? CAST_SHEET_GUIDANCE : "",
          castInDezeScene ? castRefGuidance(refsInScene) : "",
          anchorUrl ? STYLE_MATCH_ANCHOR : "",
        ].filter(Boolean).join(" ").trim() || undefined;
        // Het anker levert de tekenstijl, de portretten de identiteit. Ze horen
        // dus in verschillende slots: als ingredient trok het portret de stijl
        // van de foto mee het beeld in.
        const ingredientUrls = [anchorUrl].filter((u): u is string => !!u);
        // Twee pogingen: valt het beeld door de keuring, dan krijgt de tekenaar te
        // horen wát er mis was en probeert hij het nog één keer. Het minst foute
        // beeld wint — precies zoals de dialoogtool het doet. De herkansing kost de
        // klant niets extra.
        const pogingen: { url: string; fouten: StoryFout[] }[] = [];
        let extraRegels = "";
        for (let poging = 1; poging <= 2; poging++) {
          const result = await generateImageWithStyle({
            prompt: [buildIllustrationPrompt(scene.illustration, styleId, language, kader, scene.labels), extraRegels].filter(Boolean).join(" "),
            format,
            visualStyle,
            seed,
            // Het castblad krijgt de merk-slots: die staan vooraan in de rij
            // referenties en wegen het zwaarst — en identiteit is hier het doel.
            brandUrls: bladVoorScene ? [bladVoorScene] : undefined,
            characterUrls: castInDezeScene && refsInScene.length ? refsInScene.map((r) => r.url) : undefined,
            ingredientUrls: ingredientUrls.length ? ingredientUrls : undefined,
            extraContext,
          });
          // Tweede pass: zwevende rommel en verzonnen tekst wegvegen, met behoud van
          // de omgeving. Lukt dat niet, dan val terug op het ruwe beeld.
          let cleanUrl = result.imageUrl;
          try {
            cleanUrl = mode === "overheid"
              ? (await cleanupFlatGraphic(result.imageUrl, format, scene.labels)).imageUrl
              : (await cleanupSceneIllustration(result.imageUrl, format, scene.labels, styleId)).imageUrl;
          } catch (e) {
            // De reden erbij: fal geeft bij een afgekeurde aanroep een detail-lijst
            // terug, en zonder die uit te pakken staat er alleen "ValidationError"
            // in het log en weet je nog niets.
            const reden = (e as { body?: { detail?: unknown } })?.body?.detail;
            console.error(
              `[generate-story] cleanup scene ${i} mislukt, ruw beeld behouden:`,
              reden ? JSON.stringify(reden) : e
            );
        }
        // Controleren wat er écht in beeld staat. Dit liep eerst alleen als de
        // regie labels had opgegeven — en juist in Verhaal en Rapport zijn die er
        // niet, dus daar keek niemand mee. Zo haalde letterbrij als
        // "ENERGISVERSUIK" en een verzonnen logo het tot in de video. Geen
        // bedoelde tekst betekent niet "niet controleren", maar "alles eruit".
        try {
          cleanUrl = (await borgBeeldtekst(cleanUrl, scene.labels ?? [], format, language, false, styleId)).imageUrl;
        } catch (e) {
          console.error(`[generate-story] tekstcontrole scene ${i} mislukt:`, e);
        }
        // Nakijken: staat er iemand dubbel in, is er tekst of een logo bijgetekend,
        // is het beeld gesplitst? De keuring is een kijkvraag en kost geen credits.
        const keuring = await keurStoryBeeld(cleanUrl);
        pogingen.push({ url: cleanUrl, fouten: keuring.fouten });
        if (!keuring.fouten.length || poging === 2) break;
        extraRegels = herkansingRegels(keuring, scene.castNames ?? []);
        console.warn(`[generate-story] scene ${i} afgekeurd (${keuring.fouten.join(", ")}), tweede poging`);
        }

        // Tijdelijke fal-URL meteen naar onze eigen bucket kopieren, zodat het
        // verhaal zijn beelden houdt nadat de fal-link verloopt.
        const imageUrl = await persistFalAssetSoft(supabase, user.id, minstFout(pogingen.map((p) => ({ beeld: p.url, fouten: p.fouten }))), "image");
        return { ...scene, id: scene.id || `scene-${i}`, imageUrl };
      } catch (e) {
        console.error(`[generate-story] illustratie scene ${i} mislukt:`, e);
        return { ...scene, id: scene.id || `scene-${i}`, imageUrl: null };
      }
    }

    // Anker eerst (scene 0), daarna de rest parallel met het anker als referentie.
    const first = await renderScene(spec.scenes[0], 0, null);
    const anchorImageUrl = first.imageUrl ?? null;
    const rest = await Promise.all(
      spec.scenes.slice(1).map((scene, idx) => renderScene(scene, idx + 1, anchorImageUrl))
    );
    const scenes: StoryScene[] = [first, ...rest];

    return NextResponse.json({ spec: { ...spec, scenes, seed, anchorImageUrl, styleId, language, cast, castSheetUrl, castRefs: castRefsMetNaam, characterUrl, characterRole: body.characterRole?.trim() || null } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-story failed:", msg);
    return NextResponse.json({ error: "Verhaal genereren mislukt", detail: msg }, { status: 500 });
  }
}
