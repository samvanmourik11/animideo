import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Character, VisualStyle } from "@/lib/types";
import { removeBackground } from "@/lib/bg-remove";
import { describeCharacter } from "@/lib/character-describe";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";

// De character-flow doet meerdere trage externe calls achter elkaar (stijl-
// transform, achtergrond verwijderen, AI-beschrijving). Zonder deze regel valt
// Vercel terug op ~15s en wordt de functie afgekapt met een opaque 504 -> de UI
// toonde dan "Aanmaken mislukt". Gelijkgetrokken met de andere zware AI-routes.
export const maxDuration = 300;

async function authGuard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const guard = await authGuard();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ characters: (data ?? []) as Character[] });
}

export async function POST(req: NextRequest) {
  const guard = await authGuard();
  if ("error" in guard) return guard.error;
  const { supabase, user } = guard;

  const form = await req.formData();
  const mode             = String(form.get("mode") ?? "");
  const name             = String(form.get("name") ?? "").trim() || "Karakter";
  const description      = String(form.get("description") ?? "").trim();
  const style            = String(form.get("style") ?? "").trim();
  const gender           = String(form.get("gender") ?? "").trim();
  const ageRange         = String(form.get("age_range") ?? "").trim();
  const aspectRatio      = String(form.get("aspect_ratio") ?? "1:1");
  const removeBg         = form.get("remove_bg") !== "false";
  const autoDescribe     = form.get("auto_describe") !== "false";
  const transformStyle   = form.get("transform_style") !== "false";

  if (mode !== "upload" && mode !== "generate") {
    return NextResponse.json({ error: "Ongeldige mode" }, { status: 400 });
  }

  // Reserve credits — bij generate ALTIJD, bij upload alleen als we styliseren
  const willCharge = mode === "generate" || (mode === "upload" && transformStyle && !!style);
  let chargedCredits = 0;
  async function refund() {
    if (chargedCredits > 0) {
      try { await addCredits(user.id, chargedCredits, "Refund: karakter genereren"); } catch {}
    }
  }

  try {
    // Binnen de try zodat een fout in de credit-aftrek ook een nette JSON-
    // foutmelding teruggeeft i.p.v. een opaque 500 (admin omzeilt dit pad via
    // UNLIMITED_ACCOUNTS, een gewone gebruiker niet).
    if (willCharge) {
      const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Karakter genereren");
      if (!credit.success) {
        return NextResponse.json(
          { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
          { status: 402 },
        );
      }
      chargedCredits = CREDIT_COSTS.IMAGE_GENERATION;
    }

    let initialImageUrl: string;

    if (mode === "upload") {
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        await refund();
        return NextResponse.json({ error: "Geen afbeelding geüpload" }, { status: 400 });
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      const path = `${user.id}/characters/${Date.now()}-source.jpg`;
      const { error: upErr } = await supabase.storage
        .from("scene-assets")
        .upload(path, buf, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        await refund();
        return NextResponse.json({ error: `Upload mislukt: ${upErr.message}` }, { status: 500 });
      }
      initialImageUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
    } else {
      // mode === "generate"
      if (!description) {
        await refund();
        return NextResponse.json({ error: "Beschrijving is verplicht voor genereren" }, { status: 400 });
      }
      const genderPart = gender ? ` ${gender}.` : "";
      const agePart = ageRange ? ` Approximate age ${ageRange}.` : "";
      const prompt = `Portrait of a single character on a plain neutral background. ${description}.${genderPart}${agePart} Centered framing, head and upper body visible, looking at camera. Clean, no other people, no text, no logos.`;

      // Via de helper zodat de style-refs van het gekozen pack als
      // image_urls meegaan — anders blijft een gegenereerd karakter
      // hangen in een generieke cartoon-look ongeacht de gekozen stijl.
      const { imageUrl: tempUrl } = await generateImageWithStyle({
        prompt,
        format: aspectRatio === "9:16" || aspectRatio === "16:9" ? aspectRatio : "16:9",
        visualStyle: (style || null) as VisualStyle | null,
      });
      // Mirror to our storage so it stays available
      const imgRes = await fetch(tempUrl);
      if (!imgRes.ok) {
        await refund();
        return NextResponse.json({ error: `Download mislukt (HTTP ${imgRes.status})` }, { status: 500 });
      }
      const imgBuf = new Uint8Array(await imgRes.arrayBuffer());
      const path = `${user.id}/characters/${Date.now()}-source.jpg`;
      const { error: upErr } = await supabase.storage
        .from("scene-assets")
        .upload(path, imgBuf, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        await refund();
        return NextResponse.json({ error: `Upload mislukt: ${upErr.message}` }, { status: 500 });
      }
      initialImageUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
    }

    // Optional style transform (alleen voor uploads — bij generate is het beeld al in stijl)
    let stylizedUrl = initialImageUrl;
    if (mode === "upload" && transformStyle && style) {
      try {
        const genderHint = gender ? ` ${gender}` : "";
        const ageHint    = ageRange ? ` (around ${ageRange} years old)` : "";
        // De source-foto gaat als ingredient mee (identiteit), de style-refs
        // van het pack komen er als image_urls bij — de helper voegt ook de
        // benadrukte prompt toe ("character ref = identiteit, render in de
        // stijl van de style refs"). Resultaat: een character daadwerkelijk
        // in de gekozen pack-stijl, niet meer in generieke cartoon-look.
        const stylePrompt = `Transform the${genderHint} person${ageHint} in the source photo into a portrait illustration. Preserve the EXACT same facial features, hairstyle, expression, body shape, and outfit colors. Centered headshot, head and upper body, looking at camera, plain neutral background. No text, no logos, no other people.`;

        const { imageUrl: tempUrl } = await generateImageWithStyle({
          prompt: stylePrompt,
          format: aspectRatio === "9:16" || aspectRatio === "16:9" ? aspectRatio : "16:9",
          visualStyle: style as VisualStyle,
          // Source foto als character-ref zodat de identiteit behouden blijft
          // en de helper's character-instructie automatisch wordt meegestuurd.
          characterUrls: [initialImageUrl],
        });
        const stylizedRes = await fetch(tempUrl);
        if (stylizedRes.ok) {
          const buf = new Uint8Array(await stylizedRes.arrayBuffer());
          const path = `${user.id}/characters/${Date.now()}-styled.jpg`;
          const { error: upErr } = await supabase.storage
            .from("scene-assets")
            .upload(path, buf, { contentType: "image/jpeg", upsert: false });
          if (!upErr) {
            stylizedUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
          }
        }
      } catch (err) {
        console.warn("[characters] style transform failed, keeping original:", err);
      }
    }

    // Optional BG removal — werkt op (eventueel gestyleerde) versie
    let finalImageUrl = stylizedUrl;
    if (removeBg) {
      try {
        const bgRemovedUrl = await removeBackground(stylizedUrl);
        const bgRes = await fetch(bgRemovedUrl);
        if (bgRes.ok) {
          const bgBuf = new Uint8Array(await bgRes.arrayBuffer());
          const path = `${user.id}/characters/${Date.now()}-cutout.png`;
          const { error: upErr } = await supabase.storage
            .from("scene-assets")
            .upload(path, bgBuf, { contentType: "image/png", upsert: false });
          if (!upErr) {
            finalImageUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
          }
        }
      } catch (err) {
        console.warn("[characters] BG remove failed, keeping original:", err);
      }
    }

    // Optional auto-describe
    let finalDescription = description;
    let finalGender = gender || null;
    let finalAge = ageRange || null;
    if (autoDescribe && (!finalDescription || mode === "upload")) {
      try {
        const desc = await describeCharacter(finalImageUrl);
        if (desc.description) {
          finalDescription = finalDescription || desc.description;
          finalGender = finalGender || desc.gender;
          finalAge    = finalAge    || desc.age_range;
        }
      } catch (err) {
        console.warn("[characters] auto-describe failed:", err);
      }
    }

    const { data: row, error: dbErr } = await supabase
      .from("characters")
      .insert({
        user_id:     user.id,
        name,
        description: finalDescription || null,
        image_url:   finalImageUrl,
        source_type: mode === "upload" ? "uploaded" : "generated",
        gender:      finalGender,
        age_range:   finalAge,
        style:       style || null,
      })
      .select()
      .single();
    if (dbErr || !row) {
      await refund();
      return NextResponse.json({ error: dbErr?.message ?? "Opslaan mislukt" }, { status: 500 });
    }

    return NextResponse.json({ character: row as Character });
  } catch (err: unknown) {
    await refund();
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
