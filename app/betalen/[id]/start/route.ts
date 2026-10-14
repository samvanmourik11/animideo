import { NextRequest, NextResponse } from "next/server";
import { haalPost, startBetaling } from "@/lib/achterstand";

// Start de Mollie-betaling voor het actuele openstaande totaal en stuurt door
// naar de betaalpagina van Mollie. Alleen POST, vanaf de knop op /betalen/[id].

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const terug = new URL(`/betalen/${id}`, req.url);

  const post = await haalPost(id);
  if (!post) return NextResponse.redirect(terug, 303);

  try {
    const url = await startBetaling(post);
    // Niets meer open: de pagina laat dan zelf zien dat alles betaald is.
    return NextResponse.redirect(url ?? terug, 303);
  } catch (e) {
    console.error("[betalen] betaling starten mislukt:", e instanceof Error ? e.message : String(e));
    terug.searchParams.set("fout", "1");
    return NextResponse.redirect(terug, 303);
  }
}
