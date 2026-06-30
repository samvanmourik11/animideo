import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Scene, VisualStyle, BrandReferenceImage, SceneRefsUsed, CastRole } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";
import { normalizeBrandAssets } from "@/lib/studio/brand-assets";
import { openai } from "@/lib/openai";

// Vision-check: komen de échte merk-objecten correct terug in de gegenereerde
// scène? Bij twijfel/fout accepteren we (geen extra retries/kosten forceren).
async function verifyBrandMatch(
  imageUrl: string,
  picks: { element: string; url: string }[],
): Promise<{ match: boolean; issue: string }> {
  try {
    const content = [
      { type: "text" as const, text: `Afbeelding 1 is een gegenereerde scène; daarna volgen referentie-afbeeldingen van ECHTE merk-objecten. Komen die objecten correct terug in de scène (zelfde vorm, kleuren, branding)? Elementen: ${picks.map((p, i) => `ref ${i + 1} = ${p.element}`).join("; ")}. Antwoord ALLEEN JSON: {"match": true|false, "issue": "<kort wat niet klopt; leeg als ok>"}.` },
      { type: "image_url" as const, image_url: { url: imageUrl, detail: "low" as const } },
      ...picks.map(p => ({ type: "image_url" as const, image_url: { url: p.url, detail: "low" as const } })),
    ];
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content }],
    });
    const raw = (resp.choices[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const p = JSON.parse(raw) as { match?: boolean; issue?: string };
    return { match: p.match !== false, issue: String(p.issue ?? "") };
  } catch {
    return { match: true, issue: "" };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Studio scene image");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  // Bij Pro-kwaliteit boeken we hieronder het verschil bij; refund geeft het
  // VOLLEDIGE afgeschreven bedrag terug.
  let chargedCredits = CREDIT_COSTS.IMAGE_GENERATION;
  async function refund() {
    try { await addCredits(userId, chargedCredits, "Refund: studio scene image"); } catch {}
  }

  try {
    const { projectId, sceneId, clientScenes } = await req.json() as {
      projectId: string;
      sceneId: string;
      clientScenes?: Scene[];
    };
    if (!projectId || !sceneId) {
      await refund();
      return NextResponse.json({ error: "projectId en sceneId zijn verplicht" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("scenes, format, style_reference_url, character_reference_urls, main_character_id, supporting_character_id, visual_style, brand_kit_id, outro_logo_url")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (!project) {
      await refund();
      return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    }

    // Merk-schakelaars + kwaliteit/seed defensief lezen: als migratie 031/032 nog
    // niet gedraaid is, bestaan deze kolommen nog niet — dan netjes terugvallen.
    let logoOnScenes = false;
    let hqBrandVerify = false;
    let quality: "standard" | "pro" = "standard";
    let genSeed: number | null = null;
    {
      const { data: flags } = await supabase
        .from("projects")
        .select("logo_on_scenes, hq_brand_verify, quality, gen_seed")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      logoOnScenes = !!flags?.logo_on_scenes;
      hqBrandVerify = !!flags?.hq_brand_verify;
      quality = (flags as { quality?: string } | null)?.quality === "pro" ? "pro" : "standard";
      const s = (flags as { gen_seed?: number } | null)?.gen_seed;
      genSeed = typeof s === "number" ? s : null;
    }

    // Cast (migratie 033) apart + defensief lezen.
    let castRoles: CastRole[] = [];
    {
      const { data: castRow } = await supabase
        .from("projects").select("cast_roles").eq("id", projectId).eq("user_id", userId).single();
      const c = (castRow as { cast_roles?: unknown } | null)?.cast_roles;
      if (Array.isArray(c)) castRoles = c as CastRole[];
    }

    // Pro-kwaliteit kost evenredig meer: boek het verschil bij.
    if (quality === "pro") {
      const extra = CREDIT_COSTS.IMAGE_GENERATION_PRO - CREDIT_COSTS.IMAGE_GENERATION;
      if (extra > 0) {
        const c = await deductCredits(userId, extra, "Studio scene image (Pro)");
        if (!c.success) {
          await refund();
          return NextResponse.json({ error: "insufficient_credits", credits: c.credits, required: CREDIT_COSTS.IMAGE_GENERATION_PRO }, { status: 402 });
        }
        chargedCredits += extra;
      }
    }

    const charIds = [project.main_character_id, project.supporting_character_id].filter(Boolean) as string[];
    let charImageUrls: string[] = [];
    if (charIds.length > 0) {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, image_url")
        .in("id", charIds)
        .eq("user_id", userId);
      const byId = new Map((chars ?? []).map(c => [c.id, c.image_url as string | null]));
      charImageUrls = [
        project.main_character_id        ? byId.get(project.main_character_id)        : null,
        project.supporting_character_id  ? byId.get(project.supporting_character_id)  : null,
      ].filter((u): u is string => !!u);
    }

    // Trust client scenes (carries any unsaved prompt edits) but fall back to DB
    const scenes: Scene[] = clientScenes && clientScenes.length > 0
      ? clientScenes
      : (project.scenes ?? []) as Scene[];
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) {
      await refund();
      return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });
    }
    if (!scene.image_prompt?.trim()) {
      await refund();
      return NextResponse.json({ error: "Scene heeft geen image prompt" }, { status: 400 });
    }

    // Scene-chaining: gebruik de al gegenereerde vorige scène(s) als
    // consistentie-referentie. Zo "onthoudt" het model de personages (gezichten,
    // kleding) en stijl uit eerdere scènes — cruciaal voor multi-karakter
    // verhalen waar geen vast personage is gekozen. Ontworpen scènes (zonder
    // beeld) slaan we over; we pakken de twee meest recente echte scènebeelden.
    const idx = scenes.findIndex(s => s.id === sceneId);
    // Per-scène afgeleide seed: stabiel bij "Opnieuw", maar verschilt per scène.
    const seedForScene = genSeed !== null ? genSeed + Math.max(0, idx) : null;
    const previousSceneRefs: string[] = scenes
      .slice(0, idx < 0 ? 0 : idx)
      .filter(s => !s.designed && typeof s.image_url === "string" && !!s.image_url)
      .map(s => (s.image_url as string).split("?")[0]) // cache-bust query eraf
      .reverse()
      .slice(0, 2);

    // Personage-resolutie uit twee bronnen, samengevoegd:
    //  (1) {Naam}-tokens die de gebruiker in de prompt typt (via "/"): expliciet.
    //  (2) cast-rollen van deze scène (met per-scène override).
    // De personage-beschrijving wordt OPNIEUW opgebouwd uit het TOEGEWEZEN character
    // (niet uit de mogelijk verouderde gebakken tekst), zodat een wissel echt
    // verandert wie er getekend wordt.
    let imagePrompt = scene.image_prompt;
    // Verwijder de oude generieke "Zelfde personage (en kleding) als de personage-
    // referentieafbeelding(en)."-zin: die botste met de {Naam}-placeholders.
    imagePrompt = imagePrompt.replace(/\s*Zelfde personage[^.]*referentieafbeelding(?:en)?\.?/gi, "").replace(/[ \t]{2,}/g, " ");

    // Alle characters van de gebruiker: nodig om {Naam}-tokens op naam te matchen
    // én om gekoppelde/override-characters op id te resolven.
    const { data: allChars } = await supabase
      .from("characters").select("id, name, image_url, description").eq("user_id", userId);
    const charById = new Map<string, { name: string; image_url: string | null; description: string | null }>();
    const charByName = new Map<string, { id: string; name: string; image_url: string | null; description: string | null }>();
    for (const c of allChars ?? []) {
      const entry = { id: c.id as string, name: c.name as string, image_url: c.image_url as string | null, description: c.description as string | null };
      charById.set(c.id as string, entry);
      const full = ((c.name as string) || "").toLowerCase();
      charByName.set(full, entry);
      // Ook op voornaam matchen: {Naomi} → character "Naomi - Tapjoy".
      const first = full.split(/\s*[-–]\s*|\s+/)[0];
      if (first && !charByName.has(first)) charByName.set(first, entry);
    }

    type Resolved = { roleName: string; name: string; appearance: string; url: string; prio: number };
    const resolved: Resolved[] = [];
    const seenKey = new Set<string>();
    const pushResolved = (r: Resolved, key: string) => { if (seenKey.has(key)) return; seenKey.add(key); resolved.push(r); };

    // (1) {…}-placeholders in de prompt. Gekoppeld aan een character → gebruik dat
    // character als referentie; generieke/onbekende placeholders ("selecteer
    // personage") → geen character, gewoon weghalen uit de tekst.
    const hasTokens = /\{[^}]+\}/.test(imagePrompt);
    for (const m of imagePrompt.matchAll(/\{([^}]+)\}/g)) {
      const nm = m[1].trim();
      const c = charByName.get(nm.toLowerCase());
      if (c && c.image_url) pushResolved({ roleName: nm, name: c.name, appearance: c.description || "", url: c.image_url.split("?")[0], prio: 0 }, `id:${c.id}`);
    }
    // Tekst naar de AI: gekoppelde placeholder → voornaam; ongekoppelde → weg.
    imagePrompt = imagePrompt.replace(/\{([^}]+)\}/g, (_m, inner) => {
      const c = charByName.get(String(inner).trim().toLowerCase());
      return c ? c.name.split(/\s*[-–]\s*|\s+/)[0] : "";
    }).replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();

    // (2) Back-compat: ALLEEN als er geen placeholders zijn, cast-rollen gebruiken.
    const roleIds = Array.isArray(scene.cast_ids) ? scene.cast_ids : [];
    const overrides = scene.cast_overrides ?? {};
    const roleById = new Map(castRoles.map(r => [r.id, r]));
    if (!hasTokens) {
      for (const rid of roleIds) {
        const role = roleById.get(rid);
        if (!role) continue;
        const has = Object.prototype.hasOwnProperty.call(overrides, rid);
        const cid = has ? overrides[rid] : role.characterId;
        let url: string | null = null, name = role.name, appearance = role.appearance;
        if (cid) {
          const ch = charById.get(cid);
          if (ch) { url = ch.image_url; name = ch.name || role.name; appearance = ch.description || role.appearance; }
        } else {
          url = role.anchorUrl ?? null; // AI-rol
        }
        pushResolved({ roleName: role.name, name, appearance, url: url ? url.split("?")[0] : "", prio: has ? 0 : (cid ? 1 : 2) }, cid ? `id:${cid}` : `role:${rid}`);
      }
    }

    let characterRefs: string[];
    let characterDirective = "";
    let usedCharRefs: { name: string; url: string }[] = [];

    if (resolved.length > 0) {
      // Strip elk gebakken PERSONAGE-CONSISTENTIE-blok (verouderd na een wissel).
      imagePrompt = imagePrompt.replace(/\n+PERSONAGE-CONSISTENTIE[\s\S]*$/i, "").trimEnd();
      // Vervang de standaard rolnaam in de actie-tekst door de toegewezen naam.
      for (const r of resolved) {
        const newShort = r.name.split(/\s*[-–]\s*|\s+/)[0];
        const oldShort = r.roleName.split(/\s*[-–]\s*|\s+/)[0];
        if (newShort && oldShort && newShort !== oldShort) {
          imagePrompt = imagePrompt.replace(new RegExp(`\\b${oldShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), newShort);
        }
      }
      // Herbouw het consistentie-blok uit de RESOLVED personages.
      imagePrompt += `\n\nPERSONAGE-CONSISTENTIE — houd elk personage in deze scène IDENTIEK aan zijn referentie (zelfde gezicht, haar, leeftijd, bouw en EXACT dezelfde kleding en kleuren): ${resolved.map(r => `${r.name} — ${r.appearance}`).join(" | ")}.`;
      const anchors = resolved.filter(r => r.url).sort((a, b) => a.prio - b.prio).slice(0, 2);
      usedCharRefs = anchors.map(a => ({ name: a.name, url: a.url }));
      characterRefs = [...anchors.map(a => a.url), ...previousSceneRefs.slice(0, 1)];
      if (anchors.length > 0) {
        characterDirective = `Personage-referenties: ${anchors.map((a, k) => `referentie ${k + 1} = ${a.name}`).join(", ")}. Neem per personage de identiteit (gezicht, haar, leeftijd, kleding) EXACT over van de juiste referentie; meng de gezichten van verschillende personages NIET.`;
      }
    } else if (hasTokens) {
      // Placeholders aanwezig maar (nog) geen character gekozen → geen vast personage
      // forceren; alleen de vorige scène voor visuele samenhang.
      characterRefs = [...previousSceneRefs.slice(0, 1)];
      usedCharRefs = [];
    } else {
      // Legacy (oude projecten zonder placeholders): main/support + anchors + chaining.
      characterRefs = [
        ...charImageUrls,
        ...(project.character_reference_urls ?? []),
        ...previousSceneRefs,
      ];
      usedCharRefs = [
        ...charImageUrls.map(url => ({ name: "personage", url })),
        ...(((project.character_reference_urls as string[] | null) ?? []).map(url => ({ name: "personage", url }))),
      ];
    }
    // Merk-specificiteit + cross-scène consistentie. Het script tagt elke scène
    // met brand_asset_ids; die assets gebruiken we DETERMINISTISCH als img2img-
    // referentie — dezelfde afbeelding telkens, zodat b.v. "de boot" in élke scène
    // identiek is. Heeft de scène geen tags (ouder script), dan valt 'ie terug op
    // een per-scène GPT-match. Het logo wordt uitgesloten (los gecomposit). Plus
    // de huisstijlkleuren altijd in de prompt.
    let brandRefUrls: string[] = [];
    let brandPicks: { id: string; element: string; url: string }[] = [];
    let brandDirective = "";
    // Effectief logo voor de optionele hoek-overlay: handmatig geüpload heeft
    // voorrang, anders het logo uit de brand kit (website-onderzoek).
    let brandLogoUrl: string | null = project.outro_logo_url ?? null;
    if (project.brand_kit_id) {
      const { data: kit } = await supabase
        .from("brand_kits")
        .select("name, colors, environment, reference_images, logo_url")
        .eq("id", project.brand_kit_id)
        .eq("user_id", userId)
        .single();
      brandLogoUrl = project.outro_logo_url ?? (kit?.logo_url as string | null) ?? null;
      const assets = normalizeBrandAssets((kit?.reference_images ?? null) as BrandReferenceImage[] | null)
        .filter(a => a.role !== "logo");
      const colors = (kit?.colors ?? {}) as { primary?: string; secondary?: string; accent?: string };
      const colorList = [colors.primary, colors.secondary, colors.accent].filter(Boolean).join(", ");

      const tagged = Array.isArray(scene.brand_asset_ids) ? scene.brand_asset_ids : [];
      if (tagged.length > 0) {
        // Primair pad: dezelfde referentie per id → identiek over alle scènes.
        const byId = new Map(assets.map(a => [a.id, a]));
        brandPicks = tagged
          .map(id => byId.get(id))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .slice(0, 3)
          .map(a => ({ id: a.id, element: a.element, url: a.url }));
      } else if (assets.length > 0 && scene.image_prompt?.trim()) {
        // Fallback: per-scène GPT-match voor scripts zonder tags.
        try {
          const list = assets.map((a, i) => `${i + 1}. ${a.element}`).join("\n");
          const sceneLine = scene.image_prompt.split("\n")[0].slice(0, 400);
          const match = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 300,
            temperature: 0.2,
            messages: [{
              role: "user",
              content: `Scène: "${sceneLine}"\n\nMerk-assets:\n${list}\n\nWelke zijn ECHT relevant voor DEZE scène, en welk SPECIFIEK element moet exact overgenomen worden? Alleen wat echt past. Geef ALLEEN JSON: {"picks":[{"i":<nummer>,"element":"<element>"}]}. Leeg als niets past.`,
            }],
          });
          const raw = (match.choices[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
          const parsed = JSON.parse(raw) as { picks?: { i?: number; element?: string }[] };
          brandPicks = (parsed.picks ?? [])
            .map(p => {
              const a = assets[(p.i ?? 0) - 1];
              return a ? { id: a.id, element: String(p.element ?? "").trim() || a.element, url: a.url } : null;
            })
            .filter((p): p is { id: string; element: string; url: string } => !!p)
            .slice(0, 3);
        } catch { /* match faalt -> door zonder merk-referentie */ }
      }
      brandRefUrls = brandPicks.map(p => p.url);

      brandDirective = [
        `Dit beeld is voor het merk ${kit?.name ?? ""}.`.trim(),
        colorList ? `Verwerk de huisstijlkleuren nadrukkelijk waar dat logisch is (objecten, kleding, accenten): ${colorList}.` : "",
        brandPicks.length > 0
          ? `De bijgevoegde merk-referentie(s): ${brandPicks.map((p, k) => `referentie ${k + 1} = ${p.element} — neem dit EXACT over (zelfde vorm, kleuren en branding), identiek aan de referentie én aan elke andere scène waarin het voorkomt`).join("; ")}. Negeer al het andere in die foto's. Houd de gekozen illustratiestijl aan.`
          : (kit?.environment ? `Herkenbare merk-elementen waar passend: ${kit.environment}.` : ""),
      ].filter(Boolean).join(" ");
    }

    // Eigen, per-scène geüploade referenties → sterke richtlijn voor DEZE scène
    // (werkt ook zonder brand kit). Krijgen voorrang vooraan in de merk-refs.
    const sceneRefUrls = (Array.isArray(scene.ref_image_urls) ? scene.ref_image_urls : [])
      .filter((u): u is string => typeof u === "string" && !!u)
      .map(u => u.split("?")[0])
      .slice(0, 3);
    if (sceneRefUrls.length > 0) {
      brandRefUrls = [...sceneRefUrls, ...brandRefUrls];
      brandDirective = [
        brandDirective,
        `De eerste ${sceneRefUrls.length} bijgevoegde referentie(s) zijn door de gebruiker speciaal voor DEZE scène aangeleverd — gebruik hun inhoud, objecten en stijl als sterke richtlijn voor dit beeld.`,
      ].filter(Boolean).join(" ");
    }

    const ingredientRefs: string[] = project.style_reference_url ? [project.style_reference_url] : [];

    const aspectRatio: "16:9" | "9:16" = project.format === "9:16" ? "9:16" : "16:9";

    // "Hoge kwaliteit"-schakelaar: na een merk-scène controleert GPT-4o vision of
    // het merk-object correct is overgenomen; zo niet, dan 1× hergeneren met een
    // aangescherpte instructie. Max 2 generaties, geen extra credit-aftrek.
    const verifyEnabled = hqBrandVerify && brandPicks.length > 0;
    const maxAttempts = verifyEnabled ? 2 : 1;
    const fileName = `${userId}/${projectId}/${sceneId}-image.jpg`;
    let directive = [brandDirective, characterDirective].filter(Boolean).join(" ");
    let cacheBustedUrl = "";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let tempUrl: string;
      try {
        const out = await generateImageWithStyle({
          prompt: imagePrompt,
          format: aspectRatio,
          visualStyle: (project.visual_style as VisualStyle | null) ?? null,
          characterUrls: characterRefs,
          brandUrls: brandRefUrls,
          ingredientUrls: ingredientRefs,
          extraContext: directive || undefined,
          quality,
          seed: seedForScene,
        });
        tempUrl = out.imageUrl;
      } catch (e) {
        await refund();
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      const imgResponse = await fetch(tempUrl);
      if (!imgResponse.ok) {
        await refund();
        return NextResponse.json({ error: `Download mislukt (HTTP ${imgResponse.status})` }, { status: 500 });
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("scene-assets")
        .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        await refund();
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
      cacheBustedUrl = `${supabase.storage.from("scene-assets").getPublicUrl(fileName).data.publicUrl}?t=${Date.now()}`;

      // Laatste poging? Niet meer checken. Anders: vision-check + evt. retry.
      if (attempt >= maxAttempts - 1) break;
      const verdict = await verifyBrandMatch(cacheBustedUrl, brandPicks);
      if (verdict.match) break;
      directive = `${brandDirective} LET OP — in de vorige poging klopte het merk-object niet: ${verdict.issue}. Corrigeer dit nauwkeurig en neem het object exact over zoals op de referentie.`;
    }

    // Welke referenties zijn gebruikt — voor transparantie per scène in de UI.
    const refsUsed: SceneRefsUsed = {
      brand: [...sceneRefUrls.map(url => ({ id: "eigen", element: "eigen referentie", url })), ...brandPicks],
      characters: usedCharRefs,
      style: !!project.visual_style,
      chaining: previousSceneRefs,
    };

    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, image_url: cacheBustedUrl, refs_used: refsUsed } : s
    );

    const { error: dbErr } = await supabase
      .from("projects")
      .update({ scenes: updatedScenes })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (dbErr) {
      console.error("[studio/generate-scene-image] DB update failed:", dbErr.message);
      return NextResponse.json(
        { error: `Beeld gegenereerd maar opslaan mislukt: ${dbErr.message}`, imageUrl: cacheBustedUrl },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageUrl:    cacheBustedUrl,
      scenes:      updatedScenes,
      refsUsed,
      // Voor de optionele hoek-logo-overlay client-side (Fase 4).
      logoOnScenes,
      logoUrl:      brandLogoUrl,
    });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[studio/generate-scene-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
