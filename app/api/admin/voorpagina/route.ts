import { NextRequest, NextResponse } from "next/server";
import { isAdminAccount } from "@/lib/studio/access";
import { beoordeel, ingestuurd } from "@/lib/delen/profiel";
import { gebruiker } from "@/lib/delen/route-hulp";

export const runtime = "nodejs";

// Alleen Sam (beheer): wat er is ingestuurd voor de voorpagina, en het besluit erover.
async function beheerder() {
  const user = await gebruiker();
  return user && isAdminAccount(user.email) ? user : null;
}

export async function GET() {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  return NextResponse.json({ werk: await ingestuurd() });
}

export async function POST(req: NextRequest) {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const { id, goed } = (await req.json().catch(() => ({}))) as { id?: unknown; goed?: unknown };
  if (typeof id !== "string") return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  await beoordeel(id, goed === true);
  return NextResponse.json({ werk: await ingestuurd() });
}
