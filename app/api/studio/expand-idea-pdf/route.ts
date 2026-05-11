import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as pdfParse from "pdf-parse";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const brandKitId = form.get("brandKitId") ? String(form.get("brandKitId")) : null;

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Geen PDF ontvangen" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const fn = (pdfParse as unknown as { default?: (b: Buffer) => Promise<{ text: string }> }).default
            ?? (pdfParse as unknown as (b: Buffer) => Promise<{ text: string }>);
    const parsed = await fn(buf);
    text = (parsed.text ?? "").replace(/\s+/g, " ").trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `PDF parsen mislukt: ${msg}` }, { status: 400 });
  }

  if (text.length < 50) {
    return NextResponse.json({ error: "Te weinig tekst gevonden in PDF (gescande PDF? probeer een tekst-PDF)" }, { status: 400 });
  }

  const trimmed = text.slice(0, 12000);

  let brandContext = "";
  if (brandKitId) {
    const { data: kit } = await supabase
      .from("brand_kits")
      .select("name, description, tone_of_voice, brand_values")
      .eq("id", brandKitId)
      .eq("user_id", user.id)
      .single();
    if (kit) {
      brandContext = `\nHuisstijl context (gebruik subtiel):
- Bedrijf: ${kit.name}${kit.description ? ` — ${kit.description}` : ""}
${kit.tone_of_voice ? `- Tone of voice: ${kit.tone_of_voice}` : ""}
${kit.brand_values?.length ? `- Brand values: ${kit.brand_values.join(", ")}` : ""}`;
    }
  }

  const prompt = `Lees de volgende PDF-tekst en schrijf op basis daarvan een idee-briefing voor een explainer-video van 30-60 seconden.

PDF TEKST (mogelijk afgekapt):
"""
${trimmed}
"""
${brandContext}

Schrijf in het Nederlands, 4-7 zinnen, briefing-stijl die een scriptwriter kan gebruiken. Pak het kernverhaal uit het document: voor wie is het, welk probleem wordt opgelost, wat is de boodschap. Beschrijf: hoofdpersoon en setting, het probleem of de aanleiding, het verloop, en een natuurlijk eindpunt of call-to-action. Geen bullet points, geen markdown, alleen de paragraaf zelf.`;

  const completion = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    messages:    [{ role: "user", content: prompt }],
    max_tokens:  600,
    temperature: 0.7,
  });

  const idea = (completion.choices[0]?.message?.content ?? "").trim();
  if (!idea) return NextResponse.json({ error: "Geen idee teruggekomen van AI" }, { status: 500 });

  return NextResponse.json({ idea });
}
