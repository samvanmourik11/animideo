import { NextRequest, NextResponse } from "next/server";
import { gebruikerVan } from "@/lib/mcp/sleutels";
import { verwerk } from "@/lib/mcp/server";

export const runtime = "nodejs";
// Sommige gereedschappen (een productpagina lezen, een contentkalender bedenken) duren even.
export const maxDuration = 300;

// MCP over HTTP ("streamable HTTP", zonder sessies): elk verzoek is een JSON-RPC-bericht
// (of een lijst) met de persoonlijke sleutel als Bearer. Zie lib/mcp/server.ts.
export async function POST(req: NextRequest) {
  const userId = await gebruikerVan(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Geen geldige Animideo-sleutel. Maak er een aan in Animideo onder 'Animideo in Claude'." } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="animideo"' } },
    );
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Ongeldige JSON." } }, { status: 400 });
  const lijst = Array.isArray(body) ? body : [body];
  const antwoorden = (await Promise.all(lijst.map((v) => verwerk(userId, v)))).filter(Boolean);
  // Alleen meldingen ontvangen: niets terug te sturen.
  if (!antwoorden.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? antwoorden : antwoorden[0]);
}

// Geen server-gestuurde berichten (SSE) en geen sessies.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
