import { NextRequest, NextResponse } from "next/server";
import { OAuthFout, registreer } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

// RFC 7591: Claude (of een ander programma) meldt zich zelf aan en krijgt een client_id.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return NextResponse.json(await registreer(body), { status: 201 });
  } catch (e) {
    if (e instanceof OAuthFout) return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status });
    console.error("[oauth/register]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
