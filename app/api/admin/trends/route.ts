import { NextRequest, NextResponse, after } from "next/server";
import { isAdminAccount } from "@/lib/studio/access";
import { gebruiker } from "@/lib/delen/route-hulp";
import { createServiceClient } from "@/lib/supabase/service";
import { speurtocht, voegToeVanuit } from "@/lib/trends/speuren";
import { verwerkClip } from "@/lib/trends/clip";
import { vulLinksAan } from "@/lib/trends/voorbeelden";
import { isMethode, leesOpdracht, leesVelden, nogNodig, trendCredits, type Trend } from "@/lib/trends/types";

export const runtime = "nodejs";
// "Zoek nu" laat Claude een paar minuten zoeken (na het antwoord); een trendvideo knippen
// duurt bij een lange video ook even.
export const maxDuration = 800;

// Alleen Sam (beheer): de trends keuren, aanpassen, de trendvideo erbij zetten, live zetten.
async function beheerder() {
  const user = await gebruiker();
  return user && isAdminAccount(user.email) ? user : null;
}

async function lijst() {
  const { data } = await createServiceClient().from("trends").select("*").order("created_at", { ascending: false }).limit(300);
  return ((data ?? []) as Trend[]).map((t) => ({ ...t, credits: trendCredits(t), nogNodig: nogNodig(t) }));
}

export async function GET() {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  return NextResponse.json({ trends: await lijst() });
}

export async function POST(req: NextRequest) {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createServiceClient();
  const id = typeof b.id === "string" ? b.id : "";
  const nu = new Date().toISOString();

  if (b.actie === "zoek") {
    after(() => speurtocht().then((r) => console.log("[trends] speurtocht:", r)).catch((e) => console.error("[trends] speurtocht mislukt:", e)));
    return NextResponse.json({ ok: true });
  }
  if (b.actie === "tip") {
    const tip = String(b.tip ?? "").trim();
    if (tip.length < 8) return NextResponse.json({ error: "Plak een link of beschrijf de trend iets uitgebreider." }, { status: 400 });
    after(() => voegToeVanuit(tip).then((r) => console.log("[trends] tip:", r)).catch((e) => console.error("[trends] tip mislukt:", e)));
    return NextResponse.json({ ok: true });
  }

  const { data: huidig } = await db.from("trends").select("*").eq("id", id).maybeSingle();
  const t = huidig as Trend | null;
  if (!t) return NextResponse.json({ error: "Deze trend bestaat niet (meer)." }, { status: 404 });

  if (b.actie === "bewaar") {
    const w = (b.wijziging ?? {}) as Record<string, unknown>;
    const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const wijziging: Record<string, unknown> = { updated_at: nu };
    for (const [veld, max] of [["titel", 80], ["uitleg", 300], ["icoon", 8], ["waarom_viral", 2000], ["origineel", 600]] as const) {
      const v = tekst(w[veld], max);
      if (v !== undefined) wijziging[veld] = v;
    }
    if (wijziging.titel === "") return NextResponse.json({ error: "Een trend heeft een titel nodig." }, { status: 400 });
    if (w.methode !== undefined) {
      if (!isMethode(w.methode)) return NextResponse.json({ error: "Onbekende methode." }, { status: 400 });
      wijziging.methode = w.methode;
    }
    if (w.velden !== undefined) wijziging.velden = leesVelden(w.velden);
    if (w.opdracht !== undefined) wijziging.opdracht = leesOpdracht(w.opdracht);
    if (typeof w.gezicht === "boolean") wijziging.gezicht = w.gezicht;
    if (w.hotness !== undefined) wijziging.hotness = Math.min(10, Math.max(1, Math.round(Number(w.hotness) || 5)));
    // Een live trend moet live kunnen blijven: anders betaalt een klant voor iets dat niet werkt.
    if (t.status === "live") {
      const reden = nogNodig({ ...t, ...wijziging } as Trend);
      if (reden) return NextResponse.json({ error: `Zo kan hij niet live blijven: ${reden}` }, { status: 400 });
    }
    await db.from("trends").update(wijziging).eq("id", id);
  } else if (b.actie === "clip") {
    // De browser zette de video al in de opslag; hier het goede stuk eruit knippen.
    try {
      const clip = await verwerkClip(String(b.url ?? ""), Number(b.start) || 0, Number(b.lengte) || undefined);
      await db.from("trends").update({ ...clip, updated_at: nu }).eq("id", id);
    } catch (e) {
      return NextResponse.json({ error: `De video verwerken lukte niet: ${e instanceof Error ? e.message : e}` }, { status: 400 });
    }
  } else if (b.actie === "clip-weg") {
    if (t.status === "live" && (t.methode === "beweging" || t.methode === "pratend")) {
      return NextResponse.json({ error: "Zonder trendvideo werkt deze trend niet; zet hem eerst uit." }, { status: 400 });
    }
    await db.from("trends").update({ voorbeeldclip: null, geluid: null, clip_sec: null, updated_at: nu }).eq("id", id);
  } else if (b.actie === "beelden") {
    // Opnieuw beelden en spelers zoeken bij de bronlinks (bv. na een nieuwe link).
    const links = t.bron_links.map(({ beeld: _b, ...l }) => (b.opnieuw === true ? l : { ...l, beeld: _b }));
    await db.from("trends").update({ bron_links: await vulLinksAan(links), updated_at: nu }).eq("id", id);
  } else if (b.actie === "link") {
    // Sam plakt zelf een TikTok-, YouTube- of Instagram-link, of zet een screenshot erbij.
    const url = String(b.url ?? "").trim();
    const beeld = String(b.beeld ?? "").trim();
    if (!/^https:\/\//.test(url || beeld)) return NextResponse.json({ error: "Plak een link die met https:// begint." }, { status: 400 });
    const nieuw = await vulLinksAan([{ url: url || beeld, titel: url ? "Toegevoegd door jou" : "Screenshot", ...(beeld ? { beeld } : {}) }]);
    // Een video of screenshot van Sam zelf is meestal het beste voorbeeld: vooraan.
    await db.from("trends").update({ bron_links: [...nieuw, ...t.bron_links].slice(0, 10), updated_at: nu }).eq("id", id);
  } else if (b.actie === "link-weg") {
    const i = Number(b.index);
    await db.from("trends").update({ bron_links: t.bron_links.filter((_, j) => j !== i), updated_at: nu }).eq("id", id);
  } else if (b.actie === "voorbeeld") {
    // Een geslaagd resultaat (van Sams proefronde) als voorbeeld op de tegel.
    const url = String(b.url ?? "");
    if (url && !/^https:\/\//.test(url)) return NextResponse.json({ error: "Ongeldig voorbeeld." }, { status: 400 });
    await db.from("trends").update({ voorbeeld_url: url || null, voorbeeld_soort: url ? (b.soort === "beeld" ? "beeld" : "video") : null, updated_at: nu }).eq("id", id);
  } else if (b.actie === "live") {
    const reden = nogNodig(t);
    if (reden) return NextResponse.json({ error: reden }, { status: 400 });
    await db.from("trends").update({ status: "live", live_op: t.live_op ?? nu, updated_at: nu }).eq("id", id);
  } else if (b.actie === "afgewezen" || b.actie === "archief" || b.actie === "voorstel") {
    await db.from("trends").update({ status: b.actie, updated_at: nu }).eq("id", id);
  } else if (b.actie === "verwijder") {
    // Gemaakte video's van klanten blijven gewoon in hun bibliotheek; alleen de trend gaat weg.
    await db.from("trends").delete().eq("id", id);
  } else {
    return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
  }
  return NextResponse.json({ trends: await lijst() });
}
