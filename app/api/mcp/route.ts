import { NextRequest, NextResponse } from "next/server";
import { gebruikerVan } from "@/lib/mcp/sleutels";
import { verwerk } from "@/lib/mcp/server";
import { origin } from "@/lib/mcp/origin";

export const runtime = "nodejs";
// Sommige gereedschappen (een productpagina lezen, een contentkalender bedenken) duren even.
export const maxDuration = 300;

// MCP over HTTP ("streamable HTTP", zonder sessies): elk verzoek is een JSON-RPC-bericht
// (of een lijst) met de persoonlijke sleutel als Bearer. Zie lib/mcp/server.ts.
export async function POST(req: NextRequest) {
  const userId = await gebruikerVan(req.headers.get("authorization"));
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Niet (meer) ingelogd bij Animideo. Verbind opnieuw, of maak een sleutel onder 'Animideo in Claude'." } },
      // Zo vindt de Claude-app de inlogpagina (RFC 9728, verplicht in de MCP-specificatie).
      { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource"` } },
    );
  }
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Ongeldige JSON." } }, { status: 400 });
  const lijst = Array.isArray(body) ? body : [body];
  // Tijdelijk (24-10-2026): zien wat de Claude-app vraagt, om het MCP Apps-scherm werkend te krijgen.
  if (process.env.NODE_ENV !== "production") {
    for (const v of lijst) {
      const meta = v?.params?._meta ?? {};
      console.log("[mcp]", v?.method, v?.params?.name ?? v?.params?.uri ?? "", "| versie:", meta["io.modelcontextprotocol/protocolVersion"] ?? v?.params?.protocolVersion ?? "-", "| kan:", JSON.stringify(meta["io.modelcontextprotocol/clientCapabilities"] ?? v?.params?.capabilities ?? null), "| klant:", JSON.stringify(meta["io.modelcontextprotocol/clientInfo"] ?? v?.params?.clientInfo ?? null));
    }
  }
  const antwoorden = (await Promise.all(lijst.map((v) => verwerk(userId, v, origin(req))))).filter(Boolean);
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
