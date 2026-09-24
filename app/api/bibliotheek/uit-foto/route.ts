// EEN FOTO WORDT EEN VOORWERP OF EEN OMGEVING IN DE BIBLIOTHEEK.
//
// "Ik heb een foto van ons kantoor" is de kortste weg naar een omgeving die in
// elke video klopt. De klant hoeft niet in het Engels te beschrijven hoe zijn
// ding eruitziet — dat staat op de foto.
//
// Drie stappen: de foto bewaren, een visiemodel laat opschrijven wat erop staat
// (dat wordt de vaste beschrijving), en het beeldmodel tekent het na in de
// gekozen tekenstijl. Kost één credit, hetzelfde als een scene-beeld; het item
// is daarna in al zijn video's herbruikbaar.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseDialoog, magRealistischeStijl } from "@/lib/studio/access";
import { generateImageWithStyle, editIllustration } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import {
  buildIllustrationPrompt, isBeperkteStijl, visualStyleVan, stijlOmschrijving, REFERENCE_PHOTO_GUIDANCE,
  DEFAULT_STORY_STYLE, STORY_STYLE_PRESETS,
} from "@/lib/infographics/story-style";
import { leesFoto, tekenOpdrachtUitFoto, type FotoSoort } from "@/lib/infographics/foto-naar-bibliotheek";
import { MAX_NAAM, MAX_UITERLIJK } from "@/lib/infographics/voorwerp-bibliotheek";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Voorwerpen en omgevingen horen bij de dialoogtool en gaan met die tool open.
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const form = await req.formData();
    const file = form.get("foto");
    const soort = (String(form.get("soort") ?? "") === "omgeving" ? "omgeving" : "voorwerp") as FotoSoort;
    const eigenNaam = String(form.get("naam") ?? "").trim().slice(0, MAX_NAAM);
    const gevraagdeStijl = String(form.get("styleId") ?? "").trim();
    const bekend = STORY_STYLE_PRESETS.some((p) => p.id === gevraagdeStijl);
    const styleId =
      !bekend || (isBeperkteStijl(gevraagdeStijl) && !magRealistischeStijl(user.email))
        ? DEFAULT_STORY_STYLE
        : gevraagdeStijl;

    if (!(file instanceof Blob)) return NextResponse.json({ error: "Geen foto ontvangen" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "De foto is te groot (max 15 MB)" }, { status: 400 });

    // De foto in onze eigen opslag, zodat het beeldmodel er een publieke link van
    // krijgt en de klant zijn bron terugziet bij het item.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pad = `${user.id}/bibliotheek/${Date.now()}-bron.jpg`;
    const { error: uploadFout } = await supabase.storage
      .from("scene-assets")
      .upload(pad, bytes, { contentType: file.type || "image/jpeg", upsert: false });
    if (uploadFout) return NextResponse.json({ error: `Foto bewaren mislukt: ${uploadFout.message}` }, { status: 500 });
    const fotoUrl = supabase.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;

    // Lezen wat erop staat. Dit is een kijkvraag en kost niets; lukt het niet,
    // dan stoppen we vóór het afrekenen.
    const dataUrl = `data:${file.type || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
    const lezing = await leesFoto(dataUrl, soort);
    if (!lezing) {
      return NextResponse.json({ error: "De foto kon niet gelezen worden. Probeer een scherpere foto." }, { status: 422 });
    }
    const naam = eigenNaam || lezing.naam;

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, `Foto omzetten naar ${soort}`);
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    let getekendUrl: string;
    try {
      const result = await generateImageWithStyle({
        prompt: `${buildIllustrationPrompt(tekenOpdrachtUitFoto(lezing, soort), styleId, "Nederlands")}${REFERENCE_PHOTO_GUIDANCE}`,
        format: "16:9",
        visualStyle: visualStyleVan(styleId),
        // De foto als INGREDIENT, niet als merk-referentie. In de merk-slots staat
        // "neem dit exact over", en dan komt de foto er vrijwel fotografisch weer
        // uit — gemeten met een kantoorfoto in flat-vector: het resultaat was een
        // foto, geen tekening. Als ingredient plus REFERENCE_PHOTO_GUIDANCE
        // ("teken het na in de stijl hierboven, nooit fotorealistisch") klopt de
        // vorm én de stijl.
        ingredientUrls: [fotoUrl],
      });
      let ruwUrl = result.imageUrl;
      // TWEEDE STAP: echt naar de tekenstijl toe.
      //
      // Met de foto als referentie komt er een beeld uit dat nog steeds een foto
      // is: de vorm klopt, de stijl niet (gemeten met een kantoorfoto in
      // flat-vector — twee keer een foto terug). Een aparte bewerking die alleen
      // de stijl omzet, met de vorm als gegeven, lost dat op. Bij de realistische
      // stijl slaan we hem over: daar ís fotografisch het doel.
      if (styleId !== "realistisch") {
        try {
          const omgezet = await editIllustration(
            ruwUrl,
            `Redraw this photograph as ${stijlOmschrijving(styleId)}. Keep the exact same layout, the same furniture ` +
              "and objects in the same positions, the same proportions and the same colours, but draw everything as an " +
              "illustration in that style: no photographic texture, no camera grain, no depth-of-field blur. It must " +
              "clearly look drawn, not photographed.",
            "16:9",
            null,
            styleId,
            "Nederlands"
          );
          ruwUrl = omgezet.imageUrl;
        } catch (e) {
          // Lukt het omzetten niet, dan liever het beeld uit stap één dan niets.
          console.error("[bibliotheek/uit-foto] stijl omzetten mislukt, eerste beeld behouden:", e);
        }
      }
      getekendUrl = await persistFalAssetSoft(supabase, user.id, ruwUrl, "image");
    } catch (e) {
      await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: foto omzetten mislukt").catch(() => {});
      throw e;
    }

    // Opslaan in de juiste bibliotheek. Het getekende beeld hoort bij de gekozen
    // stijl; bij een andere stijl wordt het later opnieuw getekend, net als bij
    // items die met de hand zijn beschreven.
    if (soort === "voorwerp") {
      const { data: rij, error } = await supabase
        .from("voorwerpen")
        .insert({
          user_id: user.id,
          naam,
          uiterlijk: lezing.beschrijving.slice(0, MAX_UITERLIJK),
          bladen: { [styleId]: getekendUrl },
        })
        .select("id, naam, uiterlijk, bladen, created_at, updated_at")
        .single();
      if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bewaren mislukt" }, { status: 500 });
      return NextResponse.json({ soort, item: rij, fotoUrl, beeldUrl: getekendUrl });
    }

    const { data: rij, error } = await supabase
      .from("omgevingen")
      .insert({
        user_id: user.id,
        naam,
        beschrijving: lezing.beschrijving.slice(0, MAX_UITERLIJK),
        kenmerken: lezing.kenmerken,
        // Alleen het totaalbeeld: de andere camerastanden worden getekend zodra
        // de plek in een video wordt gebruikt, net als bij een omgeving die met
        // de hand is beschreven.
        varianten: { [styleId]: { totaal: getekendUrl } },
      })
      .select("id, naam, beschrijving, kenmerken, varianten, created_at, updated_at")
      .single();
    if (error || !rij) return NextResponse.json({ error: error?.message ?? "Bewaren mislukt" }, { status: 500 });
    return NextResponse.json({ soort, item: rij, fotoUrl, beeldUrl: getekendUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bibliotheek/uit-foto]", msg);
    return NextResponse.json({ error: "Foto omzetten mislukt", detail: msg }, { status: 500 });
  }
}
