import { NextRequest, NextResponse } from "next/server";
import { gebruiker, nietIngelogd } from "@/lib/delen/route-hulp";
import { lesVan } from "@/lib/academy/lessen";
import { markeer } from "@/lib/academy/voortgang";

// Een les bekeken (de video liep af of de klant klikte) of een opdracht zelf afgevinkt.
export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return nietIngelogd();
  const b = (await req.json().catch(() => ({}))) as { les?: string; wat?: string };
  if (!lesVan(String(b.les ?? ""))) return NextResponse.json({ error: "Onbekende les." }, { status: 400 });
  await markeer(user.id, String(b.les), b.wat === "afgevinkt" ? "afgevinkt" : "bekeken");
  return NextResponse.json({ ok: true });
}
