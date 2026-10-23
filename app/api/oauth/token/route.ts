import { NextRequest, NextResponse } from "next/server";
import { OAuthFout, wisselIn } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

// Code (of vernieuwsleutel) → een nieuwe toegangssleutel. OAuth stuurt een formulier.
export async function POST(req: NextRequest) {
  const type = req.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  try {
    return NextResponse.json(await wisselIn(form), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OAuthFout) return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status });
    console.error("[oauth/token]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
