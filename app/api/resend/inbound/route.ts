import { NextRequest, NextResponse } from "next/server";
import { verwerkAntwoord } from "@/lib/achterstand";
import { svixGeldig } from "@/lib/svix-handtekening";

// Resend meldt hier elke mail die binnenkomt op het antwoorddomein van de
// terugboekingsmails (event email.received). Zie verwerkAntwoord.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const geheim = process.env.RESEND_INBOUND_SECRET;
  const body = await req.text();
  if (
    !geheim ||
    !svixGeldig(
      geheim,
      { id: req.headers.get("svix-id"), tijd: req.headers.get("svix-timestamp"), handtekening: req.headers.get("svix-signature") },
      body
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = JSON.parse(body) as {
    type: string;
    data?: { email_id?: string; from?: string; to?: string[]; subject?: string };
  };
  if (event.type !== "email.received" || !event.data?.email_id) return NextResponse.json({ ok: true });

  try {
    const r = await verwerkAntwoord({
      emailId: event.data.email_id,
      van: event.data.from ?? "",
      aan: event.data.to ?? [],
      onderwerp: event.data.subject ?? "",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    // 500 zodat Resend het later opnieuw probeert.
    console.error("[resend/inbound]", e);
    return NextResponse.json({ error: "Verwerken mislukt" }, { status: 500 });
  }
}
