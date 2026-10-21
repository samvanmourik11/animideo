import { NextResponse } from "next/server";
import bibliotheek from "@/lib/stem/bibliotheek.json";

// De hele stemmenbibliotheek in één keer (±600 kB, ingepakt ±100 kB): filteren en zoeken
// gebeurt in de browser, dat is direct. Verandert alleen als we opnieuw synchroniseren.
export async function GET() {
  return NextResponse.json(bibliotheek, { headers: { "Cache-Control": "public, max-age=3600" } });
}
