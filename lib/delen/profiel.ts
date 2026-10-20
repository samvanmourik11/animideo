// Profielen, de voorpagina en hartjes — de serverkant. Alles via de service-client;
// hier staat wie wat mag (zie 103_profielen_voorpagina.sql).

import { createServiceClient } from "@/lib/supabase/service";
import type { Creatie } from "@/lib/creaties/types";
import { DeelFout, deel } from "./delen";
import { controleerHandle, websiteNetjes } from "./profiel-regels";

export interface MakerProfiel {
  user_id: string;
  handle: string;
  naam: string;
  bio: string | null;
  website: string | null;
  logo_url: string | null;
}

/** Eén werk zoals het op een openbare pagina staat: alleen wat een bezoeker mag zien. */
export interface OpenbaarWerk {
  id: string;
  deel_code: string;
  soort: Creatie["soort"];
  maker: string;
  invoer: { receptId?: unknown; formaat?: unknown };
  url: string;
  deel_poster: string | null;
  hartjes: number;
  handle?: string | null;
}

const OPENBAAR = "id, deel_code, soort, maker, invoer, url, deel_poster, hartjes, user_id";

function openbaar(r: Record<string, unknown>, handle?: string | null): OpenbaarWerk {
  const invoer = (r.invoer ?? {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    deel_code: r.deel_code as string,
    soort: r.soort as Creatie["soort"],
    maker: r.maker as string,
    invoer: { receptId: invoer.receptId, formaat: invoer.formaat },
    url: r.url as string,
    deel_poster: (r.deel_poster as string | null) ?? null,
    hartjes: (r.hartjes as number) ?? 0,
    handle: handle ?? null,
  };
}

export async function mijnProfiel(userId: string): Promise<MakerProfiel | null> {
  const { data } = await createServiceClient().from("maker_profielen").select("*").eq("user_id", userId).maybeSingle();
  return (data as MakerProfiel | null) ?? null;
}

export async function bewaarProfiel(
  userId: string,
  ruw: { handle?: unknown; naam?: unknown; bio?: unknown; website?: unknown; logo_url?: unknown },
): Promise<MakerProfiel> {
  const { handle, fout } = controleerHandle(String(ruw.handle ?? ""));
  if (fout) throw new DeelFout(`Profielnaam: ${fout}`);
  const naam = String(ruw.naam ?? "").trim().slice(0, 60);
  if (!naam) throw new DeelFout("Vul een naam in.");
  const logo = String(ruw.logo_url ?? "").trim();
  const rij = {
    user_id: userId,
    handle,
    naam,
    bio: String(ruw.bio ?? "").trim().slice(0, 300) || null,
    website: websiteNetjes(String(ruw.website ?? "")).slice(0, 200) || null,
    logo_url: /^https:\/\//.test(logo) ? logo : null,
  };
  const { data, error } = await createServiceClient().from("maker_profielen").upsert(rij).select("*").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new DeelFout(`@${handle} is al bezet. Kies een andere naam.`);
    console.error("[profiel] opslaan mislukt:", error.message);
    throw new DeelFout("Opslaan mislukt. Probeer het opnieuw.", 500);
  }
  return data as MakerProfiel;
}

export async function profielOpHandle(handle: string): Promise<{ profiel: MakerProfiel; werk: OpenbaarWerk[] } | null> {
  const h = handle.toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9-]{3,30}$/.test(h)) return null;
  const db = createServiceClient();
  const { data: profiel } = await db.from("maker_profielen").select("*").ilike("handle", h).maybeSingle();
  if (!profiel) return null;
  const { data } = await db
    .from("creaties")
    .select(OPENBAAR)
    .eq("user_id", profiel.user_id)
    .eq("op_profiel", true)
    .eq("status", "klaar")
    .not("deel_code", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  return { profiel: profiel as MakerProfiel, werk: (data ?? []).map((r) => openbaar(r, profiel.handle)) };
}

/** Op het profiel zetten (of eraf). Op het profiel = ook gedeeld, met dezelfde toestemmingsvraag. */
export async function zetOpProfiel(userId: string, id: string, aan: boolean, toestemming: boolean): Promise<Creatie> {
  if (aan) {
    if (!(await mijnProfiel(userId))) throw new DeelFout("Maak eerst je profiel aan.", 409);
    await deel(userId, id, toestemming);
  }
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ op_profiel: aan })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (!data) throw new DeelFout("Niet gevonden.", 404);
  return data as Creatie;
}

/** Insturen voor de voorpagina, of weer intrekken. Sam beslist; zie beoordeel(). */
export async function stuurIn(userId: string, id: string, aan: boolean, toestemming: boolean): Promise<Creatie> {
  if (aan) await deel(userId, id, toestemming);
  const { data } = await createServiceClient()
    .from("creaties")
    .update(aan ? { voorpagina: "ingestuurd", voorpagina_op: new Date().toISOString() } : { voorpagina: null, voorpagina_op: null })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (!data) throw new DeelFout("Niet gevonden.", 404);
  return data as Creatie;
}

// ── De voorpagina ───────────────────────────────────────────────────────

async function handlesVoor(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await createServiceClient().from("maker_profielen").select("user_id, handle").in("user_id", userIds);
  return new Map(((data ?? []) as { user_id: string; handle: string }[]).map((p) => [p.user_id, p.handle]));
}

/** Het goedgekeurde werk voor Ontdek: populairste eerst, bij gelijkspel het nieuwste. */
export async function uitgelicht(aantal = 24): Promise<OpenbaarWerk[]> {
  const { data } = await createServiceClient()
    .from("creaties")
    .select(OPENBAAR)
    .eq("voorpagina", "goedgekeurd")
    .eq("status", "klaar")
    .not("deel_code", "is", null)
    .order("hartjes", { ascending: false })
    .order("voorpagina_op", { ascending: false })
    .limit(aantal);
  const rijen = (data ?? []) as Record<string, unknown>[];
  const handles = await handlesVoor([...new Set(rijen.map((r) => r.user_id as string))]);
  return rijen.map((r) => openbaar(r, handles.get(r.user_id as string)));
}

/** Voor Sam: wat er wacht op een besluit, oudste eerst. */
export async function ingestuurd(): Promise<(OpenbaarWerk & { email: string | null })[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("creaties")
    .select(OPENBAAR)
    .eq("voorpagina", "ingestuurd")
    .not("deel_code", "is", null)
    .order("voorpagina_op", { ascending: true })
    .limit(100);
  const rijen = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rijen.map((r) => r.user_id as string))];
  const [handles, { data: profielen }] = await Promise.all([
    handlesVoor(ids),
    ids.length ? db.from("profiles").select("id, email").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const mail = new Map(((profielen ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  return rijen.map((r) => ({ ...openbaar(r, handles.get(r.user_id as string)), email: mail.get(r.user_id as string) ?? null }));
}

export async function beoordeel(id: string, goed: boolean): Promise<void> {
  await createServiceClient()
    .from("creaties")
    .update({ voorpagina: goed ? "goedgekeurd" : "afgewezen", voorpagina_op: new Date().toISOString() })
    .eq("id", id)
    .in("voorpagina", ["ingestuurd", "goedgekeurd"]);
}

// ── Hartjes ─────────────────────────────────────────────────────────────

/** Zet of haalt een hartje weg. Alleen op werk dat op de voorpagina of een profiel staat. */
export async function wisselHartje(userId: string, creatieId: string): Promise<{ aan: boolean; hartjes: number }> {
  const db = createServiceClient();
  const { data: c } = await db.from("creaties").select("id, voorpagina, op_profiel, deel_code").eq("id", creatieId).maybeSingle();
  if (!c || !c.deel_code || (c.voorpagina !== "goedgekeurd" && !c.op_profiel)) throw new DeelFout("Niet gevonden.", 404);

  const { data: had } = await db.from("creatie_hartjes").select("user_id").eq("creatie_id", creatieId).eq("user_id", userId).maybeSingle();
  if (had) await db.from("creatie_hartjes").delete().eq("creatie_id", creatieId).eq("user_id", userId);
  else await db.from("creatie_hartjes").insert({ creatie_id: creatieId, user_id: userId });

  // Opnieuw tellen in plaats van +1/-1: twee tegelijke klikken kunnen de teller dan
  // niet uit de pas laten lopen.
  const { count } = await db.from("creatie_hartjes").select("user_id", { count: "exact", head: true }).eq("creatie_id", creatieId);
  await db.from("creaties").update({ hartjes: count ?? 0 }).eq("id", creatieId);
  return { aan: !had, hartjes: count ?? 0 };
}

export async function mijnHartjes(userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await createServiceClient().from("creatie_hartjes").select("creatie_id").eq("user_id", userId).in("creatie_id", ids);
  return new Set(((data ?? []) as { creatie_id: string }[]).map((r) => r.creatie_id));
}
