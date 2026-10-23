import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { bedenkIdeeen, plan, schoonIdee, startMaken, verwerk } from "@/lib/social/kalender";
import { annuleer } from "@/lib/social/zernio";
import type { Kalender, Post } from "@/lib/social/types";

export const runtime = "nodejs";
export const maxDuration = 300;

async function eigen(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, k: null };
  const { data } = await createServiceClient().from("content_kalenders").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return { user, k: data as Kalender | null };
}

// De kalender met zijn posts en de beelden/video's erbij. Opvragen duwt het werk ook door,
// zodat de klant niet op de cron hoeft te wachten.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, k } = await eigen(id);
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!k) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (k.status === "actief") await verwerk({ kalenderId: k.id }).catch((e) => console.error("[social] verwerken:", e));
  const db = createServiceClient();
  const { data: posts } = await db.from("content_posts").select("*").eq("kalender_id", k.id).order("gepland_op");
  const ids = (posts ?? []).flatMap((p) => [p.beeld_id, p.video_id]).filter(Boolean);
  const { data: cs } = ids.length ? await db.from("creaties").select("id, url, status, soort").in("id", ids) : { data: [] };
  return NextResponse.json({ kalender: k, posts: posts ?? [], creaties: cs ?? [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, k } = await eigen(id);
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!k) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = createServiceClient();
  const postVan = async () => {
    const { data } = await db.from("content_posts").select("*").eq("id", String(b.post ?? "")).eq("kalender_id", k.id).maybeSingle();
    return data as (Post & { user_id: string }) | null;
  };

  switch (b.actie) {
    case "opnieuw_bedenken": {
      if (k.status !== "ideeen" && k.status !== "fout") return NextResponse.json({ error: "De ideeën zijn al goedgekeurd." }, { status: 409 });
      await db.from("content_kalenders").update({ status: "ideeen_maken" }).eq("id", k.id);
      after(() => bedenkIdeeen(k.id, String(b.aanvulling ?? "").slice(0, 1500)));
      return NextResponse.json({ ok: true });
    }
    case "goedkeuren": {
      // De ideeën staan: vanaf nu maakt de server ze per week vooruit.
      if (k.status !== "ideeen") return NextResponse.json({ error: "Er staan geen ideeën klaar." }, { status: 409 });
      await db.from("content_posts").update({ status: "gepland" }).eq("kalender_id", k.id).eq("status", "idee");
      await db.from("content_kalenders").update({ status: "actief" }).eq("id", k.id);
      after(() => verwerk({ kalenderId: k.id }).then(() => undefined));
      return NextResponse.json({ ok: true });
    }
    case "modus": {
      await db.from("content_kalenders").update({ modus: b.modus === "plaatsen" ? "plaatsen" : "controleren" }).eq("id", k.id);
      return NextResponse.json({ ok: true });
    }
    case "wijzig": {
      // Tekst, moment of beeldidee aanpassen; alleen zolang hij nog niet is ingepland.
      const p = await postVan();
      if (!p) return NextResponse.json({ error: "Post niet gevonden." }, { status: 404 });
      if (!["idee", "gepland", "te_keuren", "mislukt"].includes(p.status)) return NextResponse.json({ error: "Deze post wordt nu gemaakt of is al ingepland." }, { status: 409 });
      const datum = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(p.gepland_op));
      const tijd = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date(p.gepland_op));
      const schoon = schoonIdee({ ...p, datum, tijd, ...(b.velden as Record<string, unknown>) }, k);
      if (!schoon) return NextResponse.json({ error: "Controleer datum, kanalen en het beeldidee." }, { status: 400 });
      // Ander beeldidee of andere soort: het gemaakte beeld klopt niet meer.
      const opnieuw = schoon.beeld_prompt !== p.beeld_prompt || schoon.soort !== p.soort || schoon.beweging !== p.beweging;
      await db.from("content_posts").update({ ...schoon, ...(opnieuw && p.status !== "idee" ? { beeld_id: null, video_id: null, status: "gepland" } : {}) }).eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    case "weg": {
      const p = await postVan();
      if (!p) return NextResponse.json({ error: "Post niet gevonden." }, { status: 404 });
      if (p.status === "geplaatst") return NextResponse.json({ error: "Deze post staat al online; haal hem weg op het platform zelf." }, { status: 409 });
      if (p.zernio_post && p.status === "ingepland") await annuleer(p.zernio_post).catch((e) => console.error("[social] annuleren:", e));
      await db.from("content_posts").delete().eq("id", p.id);
      return NextResponse.json({ ok: true });
    }
    case "plaats": {
      // Goedgekeurd bij 'eerst controleren', of een mislukte post opnieuw proberen.
      const p = await postVan();
      if (!p || !["te_keuren", "mislukt"].includes(p.status) || !(p.soort === "video" ? p.video_id : p.beeld_id)) return NextResponse.json({ error: "Deze post is nog niet klaar om te plaatsen." }, { status: 409 });
      await plan(p, k);
      return NextResponse.json({ ok: true });
    }
    case "maak_nu": {
      // Niet wachten tot hij binnen een week valt (of opnieuw na mislukken).
      const p = await postVan();
      if (!p || !["gepland", "te_keuren", "mislukt"].includes(p.status) || k.status !== "actief") return NextResponse.json({ error: "Deze post kan nu niet gemaakt worden." }, { status: 409 });
      await startMaken(p);
      return NextResponse.json({ ok: true });
    }
    case "weg_kalender": {
      const { data: ingepland } = await db.from("content_posts").select("zernio_post").eq("kalender_id", k.id).eq("status", "ingepland");
      for (const p of ingepland ?? []) if (p.zernio_post) await annuleer(p.zernio_post).catch((e) => console.error("[social] annuleren:", e));
      await db.from("content_kalenders").delete().eq("id", k.id);
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
}
