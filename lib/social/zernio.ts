// Zernio (voorheen Late): de koppeldienst voor Instagram, TikTok, Facebook, YouTube en X.
// Zij hebben de keuringen van die platformen; wij praten alleen met hun API. Elke gebruiker
// krijgt een eigen profiel (externalId = onze user-id) met daaronder zijn accounts.
// Alleen op de server: de sleutel geeft toegang tot de accounts van álle klanten.

import { createServiceClient } from "@/lib/supabase/service";
import type { Kanaal, PlatformId } from "./types";
import { PLATFORMS } from "./types";

const BASIS = "https://zernio.com/api/v1";

export class ZernioFout extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

async function zernio<T>(pad: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new ZernioFout("De Zernio-sleutel (ZERNIO_API_KEY) ontbreekt nog.", 500);
  const { json, ...rest } = init;
  const res = await fetch(`${BASIS}${pad}`, {
    ...rest,
    headers: { Authorization: `Bearer ${key}`, ...(json ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    ...(json ? { body: JSON.stringify(json) } : {}),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const melding = (body as { error?: string; message?: string }).error ?? (body as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new ZernioFout(`Zernio: ${melding}`, res.status, body);
  }
  return body as T;
}

/** Het Zernio-profiel van deze gebruiker; bij de eerste keer aangemaakt. */
export async function profielVan(userId: string): Promise<string> {
  const db = createServiceClient();
  const { data } = await db.from("social_profielen").select("zernio_profiel").eq("user_id", userId).maybeSingle();
  if (data?.zernio_profiel) return data.zernio_profiel;
  let id: string;
  try {
    const r = await zernio<{ profile: { _id: string } }>("/profiles", { method: "POST", json: { name: `Animideo ${userId.slice(0, 8)}`, externalId: userId } });
    id = r.profile._id;
  } catch (e) {
    // Bestaat al (bv. een eerdere poging die hier niet meer kon opslaan): dat profiel nemen.
    const bestaand = (e as ZernioFout).body as { details?: { existingProfileId?: string } } | undefined;
    if (!(e instanceof ZernioFout) || e.status !== 409 || !bestaand?.details?.existingProfileId) throw e;
    id = bestaand.details.existingProfileId;
  }
  await db.from("social_profielen").upsert({ user_id: userId, zernio_profiel: id });
  return id;
}

export interface Account {
  id: string;
  platform: PlatformId;
  naam: string;
  actief: boolean;
}

const BEKEND = new Set<string>(PLATFORMS.map((p) => p.id));

export async function accountsVan(userId: string): Promise<Account[]> {
  const profiel = await profielVan(userId);
  const r = await zernio<{ accounts?: { _id: string; platform: string; username?: string; displayName?: string; isActive?: boolean; profileId?: string | { _id: string } }[] }>(
    `/accounts?profileId=${encodeURIComponent(profiel)}`,
  );
  return (r.accounts ?? [])
    // Dubbel controleren: alleen accounts van dít profiel, nooit die van een andere klant.
    .filter((a) => (typeof a.profileId === "object" ? a.profileId?._id : a.profileId ?? profiel) === profiel)
    .filter((a) => BEKEND.has(a.platform))
    .map((a) => ({ id: a._id, platform: a.platform as PlatformId, naam: a.username ?? a.displayName ?? a.platform, actief: a.isActive !== false }));
}

/** Het adres waar de klant inlogt bij het platform; daarna komt hij terug op `terug`. */
export async function koppelUrl(userId: string, platform: PlatformId, terug: string): Promise<string> {
  const profiel = await profielVan(userId);
  const r = await zernio<{ authUrl?: string }>(`/connect/${platform}?profileId=${encodeURIComponent(profiel)}&redirect_url=${encodeURIComponent(terug)}`);
  if (!r.authUrl) throw new ZernioFout("Zernio gaf geen koppeladres terug.", 502, r);
  return r.authUrl;
}

export async function ontkoppel(userId: string, accountId: string): Promise<void> {
  if (!(await accountsVan(userId)).some((a) => a.id === accountId)) throw new ZernioFout("Dat account hoort niet bij jou.", 403);
  await zernio(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

export interface NieuwePost {
  kanalen: Kanaal[];
  tekst: string;
  tekstKort?: string | null;
  titel?: string | null;
  mediaUrl: string;
  /** ISO met tijdzone. Ligt hij in het verleden, dan plaatst Zernio meteen. */
  op: string;
  /** Onze post-id: zo maakt een herhaalde poging geen tweede post. */
  sleutel: string;
}

export async function plaatsPost(p: NieuwePost): Promise<string> {
  const r = await zernio<{ post?: { _id: string }; postId?: string; existingPostId?: string }>("/posts", {
    method: "POST",
    headers: { "Idempotency-Key": p.sleutel },
    json: {
      content: p.tekst,
      mediaItems: [{ url: p.mediaUrl }],
      scheduledFor: p.op,
      timezone: "Europe/Amsterdam",
      platforms: p.kanalen.map((k) => ({
        platform: k.platform,
        accountId: k.accountId,
        ...(k.platform === "twitter" && p.tekstKort ? { customContent: p.tekstKort } : {}),
        ...(k.platform === "youtube" ? { platformSpecificData: { title: (p.titel || p.tekst).slice(0, 100), visibility: "public" } } : {}),
      })),
      metadata: { bron: "animideo", post: p.sleutel },
    },
  });
  const id = r.post?._id ?? r.postId ?? r.existingPostId;
  if (!id) throw new ZernioFout("Zernio gaf geen post-id terug.", 502, r);
  return id;
}

export interface PostStand {
  status: string;
  links: Record<string, string>;
  fout: string | null;
}

export async function standVan(postId: string): Promise<PostStand> {
  const r = await zernio<{ post?: Record<string, unknown> } & Record<string, unknown>>(`/posts/${encodeURIComponent(postId)}`);
  const post = (r.post ?? r) as { status?: string; platforms?: { platform?: string; status?: string; platformPostUrl?: string; errorMessage?: string; error?: string }[]; platformPostUrl?: string };
  const links: Record<string, string> = {};
  const fouten: string[] = [];
  for (const x of post.platforms ?? []) {
    if (x.platform && x.platformPostUrl) links[x.platform] = x.platformPostUrl;
    if (x.status === "failed") fouten.push(`${x.platform}: ${x.errorMessage ?? x.error ?? "mislukt"}`);
  }
  return { status: post.status ?? "onbekend", links, fout: fouten.length ? fouten.join("; ") : null };
}

export async function annuleer(postId: string): Promise<void> {
  await zernio(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
}
