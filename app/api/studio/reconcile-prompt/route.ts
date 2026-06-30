// Stemt een scène-image_prompt af op de gekozen merk-referenties, zodat de
// tekst niet botst met de referentiefoto. Voorbeeld: de prompt zegt "houten
// vaten" maar de referentie toont kunststof KeyKeg-vaten → de tekst wordt
// herschreven naar "de vaten exact zoals op de referentie". Geen credits
// (lichte gpt-4o-mini-call); bij fout blijft de prompt ongewijzigd.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, assets } = (await req.json()) as {
    prompt?: string;
    assets?: { element: string; description?: string }[];
  };
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt ontbreekt" }, { status: 400 });
  if (!assets || assets.length === 0) return NextResponse.json({ prompt });

  try {
    const list = assets
      .map((a, i) => `${i + 1}. ${a.element}${a.description && a.description !== a.element ? ` (${a.description})` : ""}`)
      .join("\n");
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 700,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `Hieronder een scène-beschrijving voor een AI-beeld, plus de ECHTE merk-objecten die in deze scène getoond moeten worden (afkomstig uit referentiefoto's).

Herschrijf de beschrijving zó dat objecten die overeenkomen met een referentie NIET afwijkend beschreven worden, maar verwijzen naar de referentie. Voorbeeld: referentie = "kunststof KeyKeg-vat", tekst = "houten vaten" → maak er "de vaten exact zoals op de referentie (kunststof KeyKeg)" van. Verzin geen nieuwe objecten en verwijder niets anders.

BELANGRIJK: laat alle delen die beginnen met een HOOFDLETTER-blok zoals "BEELDREGELS:", "PERSONAGE-CONSISTENTIE" e.d. exact en ongewijzigd staan. Houd dezelfde taal en ongeveer dezelfde lengte.

MERK-OBJECTEN (uit de referenties):
${list}

SCÈNE-BESCHRIJVING:
"""${prompt}"""

Geef ALLEEN de herschreven tekst terug (geen uitleg, geen aanhalingstekens eromheen).`,
      }],
    });
    const out = (resp.choices[0]?.message?.content ?? "").trim();
    return NextResponse.json({ prompt: out || prompt });
  } catch {
    return NextResponse.json({ prompt });
  }
}
