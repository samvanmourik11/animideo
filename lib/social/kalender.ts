// DE CONTENTKALENDER — eerst ideeën in tekst (Claude bedenkt ze, de klant past aan en keurt
// goed), daarna maakt de server per week vooruit de beelden/video's en plant ze in bij
// Zernio, of zet ze klaar om te keuren (Sam, 23-10-2026).
//
// Een post loopt: idee → gepland → maken → te_keuren / ingepland → geplaatst (of mislukt).
// verwerk() duwt alles een stap verder; de cron roept hem elke 5 minuten aan, en het
// scherm bij het opvragen (dan hoeft de klant niet op de cron te wachten).

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { startCreatie, verversLopende, WachtrijFout } from "@/lib/creaties/wachtrij";
import { STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { MUSIC_CATEGORIES } from "@/lib/music/library";
import type { Creatie } from "@/lib/creaties/types";
import { leesGeheugen } from "@/lib/regisseur/tools";
import { nlMoment } from "@/lib/regisseur/taken";
import { ALLEEN_VIDEO, MAX_FOTOS, PLATFORMS, type Kalender, type Kanaal, type Post } from "./types";
import { accountsVan, plaatsPost, standVan, ZernioFout } from "./zernio";

const MODEL = "claude-opus-5-5";
/** Een week vooruit maken: dan is er tijd om te keuren, en geen credits voor verre plannen. */
export const VOORUIT_MS = 7 * 24 * 60 * 60 * 1000;
/** Per ronde niet meer starten dan de wachtrij toestaat (4 tegelijk per gebruiker). */
const PER_RONDE = 4;
/** Hugo V: de vaste stem van Animideo (Sam). */
const STEM = "rbqBOMK4BPTMGvIB7N8w";
const MUZIEK = MUSIC_CATEGORIES.map((c) => c.id) as string[];

// ── Aanmaken ─────────────────────────────────────────────────────────────

export class KalenderFout extends Error {}

/**
 * Een nieuwe kalender (vanuit het scherm of de Regisseur). Accounts en foto's worden
 * opnieuw opgezocht: alleen wat echt van deze gebruiker is. De ideeën bedenkt de
 * aanroeper daarna met bedenkIdeeen().
 */
export async function maakKalender(userId: string, b: Record<string, unknown>): Promise<string> {
  const briefing = String(b.briefing ?? "").trim().slice(0, 3000);
  if (briefing.length < 10) throw new KalenderFout("Vertel kort waar de posts over moeten gaan.");
  const weken = Math.min(6, Math.max(1, Math.round(Number(b.weken) || 4)));
  const perWeek = Math.min(7, Math.max(1, Math.round(Number(b.per_week) || 3)));
  const morgen = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + 86400000));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start)) && String(b.start) >= morgen ? String(b.start) : morgen;
  const accounts = await accountsVan(userId);
  // Zonder keuze (de Regisseur zegt "alles"): alle actieve accounts.
  const gekozen = new Set((Array.isArray(b.accounts) ? b.accounts : []).map(String));
  const kanalen: Kanaal[] = accounts.filter((a) => a.actief && (!gekozen.size || gekozen.has(a.id))).map((a) => ({ platform: a.platform, accountId: a.id, naam: a.naam }));
  if (!kanalen.length) throw new KalenderFout(accounts.length ? "Kies minstens één gekoppeld account." : "Er is nog geen kanaal gekoppeld. Koppel er eerst een in de Social-studio.");
  const fotoIds = (Array.isArray(b.fotos) ? b.fotos : []).map(String).slice(0, MAX_FOTOS);
  const db = createServiceClient();
  const { data: fs } = fotoIds.length ? await db.from("creaties").select("id, url, prompt").eq("user_id", userId).eq("soort", "beeld").in("id", fotoIds) : { data: [] };
  const fotos = fotoIds.map((id) => (fs ?? []).find((f) => f.id === id)).filter((f) => f?.url).map((f) => ({ url: f!.url as string, naam: String(f!.prompt ?? "foto").slice(0, 80) }));
  const { data, error } = await db
    .from("content_kalenders")
    .insert({
      user_id: userId, titel: briefing.slice(0, 60), briefing, kanalen, fotos,
      eindkaart: String(b.eindkaart ?? "").trim().slice(0, 40) || null,
      modus: b.modus === "plaatsen" ? "plaatsen" : "controleren", start_datum: start, weken, per_week: perWeek, status: "ideeen_maken",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Opslaan mislukt.");
  return data.id;
}

// ── Ideeën ───────────────────────────────────────────────────────────────

// Een vaste antwoordvorm (JSON-schema) in plaats van een gedwongen gereedschap: Opus 5.5
// weigert tool_choice 'tool' (400 "not supported for this model").
const IDEE_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
      titel: { type: "string", description: "Korte naam voor deze kalender." },
      eindkaart: { type: "string", description: "Korte tekst voor de eindkaart van video's: de website of bedrijfsnaam, max 30 tekens." },
      posts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            datum: { type: "string", description: "YYYY-MM-DD" },
            tijd: { type: "string", description: "HH:MM, Nederlandse tijd; kies goede momenten voor het platform." },
            platforms: { type: "array", items: { type: "string", enum: PLATFORMS.map((p) => p.id) } },
            soort: { type: "string", enum: ["beeld", "video"] },
            idee: { type: "string", description: "Wat deze post is, in één of twee Nederlandse zinnen (voor de klant)." },
            tekst: { type: "string", description: "Het bijschrift, Nederlands, in de toon van het bedrijf, met een paar hashtags." },
            tekst_kort: { type: "string", description: "Alleen als X erbij zit: versie van max 260 tekens." },
            titel: { type: "string", description: "Alleen als YouTube erbij zit: titel, max 90 tekens." },
            beeld_prompt: { type: "string", description: "Engelse prompt voor het beeld (bij video: het eerste beeld, staand 9:16). Concreet: onderwerp, omgeving, licht, stijl, huisstijlkleuren. Geen tekst in beeld, geen logo's van anderen, geen echte bestaande personen." },
            beweging: { type: "string", description: "Alleen bij video: Engelse omschrijving van de beweging (5 s), rustig en natuurlijk; niets toevoegen dat niet in het beeld staat." },
            voiceover: { type: "string", description: "Alleen bij video: wat de stem zegt, Nederlands, max 12 woorden (past in 5 seconden). Leeg laten als alleen muziek beter is." },
            muziek: { type: "string", enum: MUZIEK, description: "Alleen bij video: de sfeer van de muziek eronder." },
            fotos: { type: "array", items: { type: "integer" }, description: "Nummers van de eigen foto's van de klant die in dit beeld moeten (bv. het product). Leeg als er geen past." },
          },
          required: ["datum", "tijd", "platforms", "soort", "idee", "tekst", "beeld_prompt"],
        },
      },
    },
    required: ["titel", "posts"],
};

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("De Claude-sleutel (ANTHROPIC_API_KEY) ontbreekt nog.");
  return (client ??= new Anthropic());
}

function dagNa(start: string, dagen: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

/** Laat Claude de ideeën bedenken en zet ze als posts met status 'idee' in de kalender. */
export async function bedenkIdeeen(kalenderId: string, extra = ""): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("content_kalenders").select("*").eq("id", kalenderId).single();
  const k = data as (Kalender & { user_id: string }) | null;
  // Alleen als iemand er net om vroeg (status ideeen_maken): een kalender die al loopt, mag
  // nooit terug naar ideeën; dan zouden ingeplande posts stil komen te staan.
  if (!k || k.status !== "ideeen_maken") return;
  try {
    const geheugen = await leesGeheugen(k.user_id);
    const kanalen = [...new Set(k.kanalen.map((x) => x.platform))];
    const eind = dagNa(k.start_datum, k.weken * 7 - 1);
    const antwoord = await claude()
      .messages.stream({
        model: MODEL,
        max_tokens: 32000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: IDEE_SCHEMA } },
        system: `Je bent de social-media-strateeg van Animideo. Je maakt een contentkalender voor een Nederlands bedrijf: gevarieerd (product, achter de schermen, tips, seizoen, actie, klantvoordeel), passend bij het publiek, nooit twee keer hetzelfde. Bijschriften in natuurlijk Nederlands, niet schreeuwerig. Alleen beelden en video's die je met AI kunt maken zonder echte bestaande personen of andermans merken.

Regels:
- Precies ${k.per_week} posts per week, ${k.weken} weken: van ${k.start_datum} tot en met ${eind}. Verdeel ze over de week.
- Alleen deze kanalen: ${kanalen.join(", ")}. Een post mag op meerdere kanalen tegelijk.
- TikTok en YouTube nemen alleen video aan: een post met die kanalen is een video. Een video is 5 seconden beweging vanuit één beeld, staand (9:16), met een korte voice-over (max 12 woorden, de stem van het bedrijf), muziek en daarna 3 seconden een eindkaart. Kies onderwerpen waar rustige beweging mooi werkt (stoom, gieten, draaien, licht).
- Beelden zijn vierkant (1:1).
${k.fotos?.length ? `- De klant gaf ${k.fotos.length} eigen foto's (hieronder genummerd vanaf 1). Gebruik ze waar het past via 'fotos': het beeld laat dan precies dat product, logo of die plek zien. Beschrijf in beeld_prompt hoe het in beeld komt (bv. "the product from the reference photo on a marble table"). Wissel af: niet elke post hoeft een eigen foto.` : ""}`,
        messages: [
          {
            role: "user",
            content: [
              // De eigen foto's zelf meesturen: dan weet Claude wat erop staat.
              ...(k.fotos ?? []).flatMap((f, i): Anthropic.ContentBlockParam[] => [
                { type: "text", text: `Foto ${i + 1}: ${f.naam}` },
                { type: "image", source: { type: "url", url: f.url } },
              ]),
              {
                type: "text",
                text: `${geheugen ? `Wat je over dit bedrijf weet:\n${geheugen}\n\n` : ""}De opdracht van de klant:\n${k.briefing}${extra ? `\n\nAanvulling van de klant op een vorige versie:\n${extra}` : ""}`,
              },
            ],
          },
        ],
      })
      .finalMessage();
    const json = antwoord.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let invoer: { titel?: string; eindkaart?: string; posts?: Record<string, unknown>[] } | undefined;
    try {
      invoer = JSON.parse(json);
    } catch {
      throw new Error(antwoord.stop_reason === "max_tokens" ? "De kalender werd te lang. Kies minder weken of minder posts per week." : "De Regisseur gaf een onleesbaar antwoord. Probeer het opnieuw.");
    }
    const posts = (invoer?.posts ?? []).map((p) => schoonIdee(p, k)).filter((p): p is NonNullable<ReturnType<typeof schoonIdee>> => !!p);
    if (!posts.length) throw new Error("De Regisseur kwam niet met bruikbare ideeën. Probeer het opnieuw met een iets uitgebreidere opdracht.");
    await db.from("content_posts").delete().eq("kalender_id", k.id).eq("status", "idee");
    const { error } = await db.from("content_posts").insert(posts.map((p) => ({ ...p, kalender_id: k.id, user_id: k.user_id, status: "idee" })));
    if (error) throw new Error(error.message);
    await db
      .from("content_kalenders")
      .update({ status: "ideeen", foutmelding: null, ...(invoer?.titel ? { titel: invoer.titel.slice(0, 80) } : {}), ...(invoer?.eindkaart && !k.eindkaart ? { eindkaart: invoer.eindkaart.slice(0, 40) } : {}) })
      .eq("id", k.id);
  } catch (e) {
    console.error("[social] ideeën bedenken mislukt:", e);
    await db
      .from("content_kalenders")
      .update({ status: "fout", foutmelding: e instanceof Anthropic.APIError ? `Claude gaf een fout (${e.status}). Probeer het opnieuw.` : e instanceof Error ? e.message : String(e) })
      .eq("id", k.id);
  }
}

/** Een idee van Claude (of een aanpassing van de klant) → een geldige post, of niets. */
export function schoonIdee(p: Record<string, unknown>, k: Pick<Kalender, "kanalen" | "start_datum" | "weken"> & { fotos?: Kalender["fotos"] }) {
  const tekst = (x: unknown, max: number) => String(x ?? "").trim().slice(0, max);
  const datum = tekst(p.datum, 10);
  const tijd = /^\d{1,2}:\d{2}$/.test(tekst(p.tijd, 5)) ? tekst(p.tijd, 5) : "09:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  const [j, m, d] = datum.split("-").map(Number);
  const [u, min] = tijd.split(":").map(Number);
  const gepland = nlMoment(j, m, d, Math.min(u, 23)) + Math.min(min, 59) * 60_000;
  const beschikbaar = new Set(k.kanalen.map((x) => x.platform));
  const platforms = [...new Set((Array.isArray(p.platforms) ? p.platforms : []).map(String))].filter((x) => beschikbaar.has(x as never));
  if (!platforms.length) return null;
  const soort = p.soort === "video" || platforms.some((x) => ALLEEN_VIDEO.has(x)) ? "video" : "beeld";
  const idee = tekst(p.idee, 500);
  const beeld = tekst(p.beeld_prompt, 1500);
  if (!idee || !beeld) return null;
  return {
    gepland_op: new Date(gepland).toISOString(),
    platforms,
    soort,
    idee,
    tekst: tekst(p.tekst, 2200),
    tekst_kort: platforms.includes("twitter") ? tekst(p.tekst_kort || p.tekst, 280) : null,
    titel: platforms.includes("youtube") ? tekst(p.titel || p.idee, 100) : null,
    beeld_prompt: beeld,
    beweging: soort === "video" ? tekst(p.beweging, 600) || "gentle natural motion, slow camera push-in" : null,
    voiceover: soort === "video" ? tekst(p.voiceover, 160) || null : null,
    muziek: soort === "video" ? (MUZIEK.includes(String(p.muziek)) ? String(p.muziek) : "vrolijk") : null,
    // Nummers (van Claude, vanaf 1) of al adressen (bij aanpassen); alleen foto's van deze kalender.
    referenties: fotoAdressen(p.fotos ?? p.referenties, k.fotos ?? []),
  };
}

function fotoAdressen(ruw: unknown, fotos: Kalender["fotos"]): string[] {
  const eigen = new Set(fotos.map((f) => f.url));
  const uit = (Array.isArray(ruw) ? ruw : []).map((x) => (typeof x === "number" ? fotos[x - 1]?.url : eigen.has(String(x)) ? String(x) : undefined));
  return [...new Set(uit.filter((x): x is string => !!x))].slice(0, 3);
}

// ── Maken en plaatsen ────────────────────────────────────────────────────

type Rij = Post & { user_id: string; gemeld?: boolean };

async function zet(id: string, w: Partial<Rij>, alsStatus?: string) {
  let q = createServiceClient().from("content_posts").update(w).eq("id", id);
  if (alsStatus) q = q.eq("status", alsStatus);
  const { data } = await q.select("id");
  return !!data?.length;
}

/** Start het beeld van een post. Bij een volle wachtrij gewoon later opnieuw. */
export async function startMaken(p: Rij): Promise<void> {
  if (!(await zet(p.id, { status: "maken", foutmelding: null }, p.status))) return;
  try {
    const c = await startCreatie(p.user_id, "beeld", { prompt: p.beeld_prompt, formaat: p.soort === "video" ? "9:16" : "1:1", kwaliteit: "standaard", referentieUrls: p.referenties ?? [] });
    await zet(p.id, { beeld_id: c.id, video_id: null, montage_id: null, gemeld: false });
  } catch (e) {
    const vol = e instanceof WachtrijFout && e.status === 429;
    await zet(p.id, vol ? { status: p.status } : { status: "mislukt", foutmelding: e instanceof Error ? e.message : String(e) });
  }
}

/** Een post die gemaakt wordt: kijken of het beeld/de video klaar is en de volgende stap zetten. */
async function verderMaken(p: Rij, k: Kalender, creaties: Map<string, Creatie>): Promise<void> {
  const beeld = p.beeld_id ? creaties.get(p.beeld_id) : undefined;
  const video = p.video_id ? creaties.get(p.video_id) : undefined;
  const montage = p.montage_id ? creaties.get(p.montage_id) : undefined;
  if (!beeld || [beeld, video, montage].some((c) => c?.status === "bezig")) return;
  const mis = [montage, video, beeld].find((c) => c?.status === "mislukt");
  if (mis) {
    await zet(p.id, { status: "mislukt", foutmelding: mis.foutmelding ?? "Maken mislukt." }, "maken");
    return;
  }
  // Video met geluid: de clip, daarna de voice-over, muziek en eindkaart eronder (montage).
  if (p.soort === "video" && video?.status === "klaar" && !montage && (p.voiceover || p.muziek || k.eindkaart)) {
    try {
      const c = await startCreatie(p.user_id, "montage", { clipIds: [video.id], voiceover: p.voiceover ?? "", stem: STEM, muziek: p.muziek, eindtekst: k.eindkaart ?? "" });
      await zet(p.id, { montage_id: c.id });
    } catch (e) {
      if (!(e instanceof WachtrijFout && e.status === 429)) await zet(p.id, { status: "mislukt", foutmelding: e instanceof Error ? e.message : String(e) }, "maken");
    }
    return;
  }
  const laatste = p.soort === "video" ? montage ?? video : beeld;
  if (p.soort === "video" && !video) {
    try {
      const c = await startCreatie(p.user_id, "beeld-naar-video", { bronUrl: beeld.url, prompt: p.beweging ?? "", model: STANDAARD_VIDEO_MODEL, formaat: "9:16" });
      await zet(p.id, { video_id: c.id });
    } catch (e) {
      if (!(e instanceof WachtrijFout && e.status === 429)) await zet(p.id, { status: "mislukt", foutmelding: e instanceof Error ? e.message : String(e) }, "maken");
    }
    return;
  }
  if (laatste?.status !== "klaar") return;
  if (k.modus === "plaatsen") await plan(p, k);
  else await zet(p.id, { status: "te_keuren" }, "maken");
}

/** Naar Zernio: ingepland op het geplande moment (ligt dat al achter ons, dan meteen). */
export async function plan(p: Rij, k: Pick<Kalender, "kanalen">, mediaUrl?: string): Promise<void> {
  const db = createServiceClient();
  let url = mediaUrl;
  if (!url) {
    const { data } = await db.from("creaties").select("url").eq("id", (p.soort === "video" ? p.montage_id ?? p.video_id : p.beeld_id) ?? "").eq("user_id", p.user_id).maybeSingle();
    url = data?.url ?? undefined;
  }
  if (!url) return void (await zet(p.id, { status: "mislukt", foutmelding: "Het beeld of de video is er niet meer." }));
  const kanalen = k.kanalen.filter((x) => p.platforms.includes(x.platform)) as Kanaal[];
  if (!kanalen.length) return void (await zet(p.id, { status: "mislukt", foutmelding: "Geen gekoppeld account meer voor deze kanalen." }));
  try {
    const id = await plaatsPost({ kanalen, tekst: p.tekst, tekstKort: p.tekst_kort, titel: p.titel, mediaUrl: url, op: p.gepland_op, sleutel: p.id });
    await zet(p.id, { status: "ingepland", zernio_post: id, foutmelding: null });
  } catch (e) {
    await zet(p.id, { status: "mislukt", foutmelding: e instanceof Error ? e.message : String(e) });
  }
}

/** Ingeplande posts waarvan het moment voorbij is: geplaatst of mislukt? */
async function controleerGeplaatst(p: Rij): Promise<void> {
  if (!p.zernio_post) return;
  try {
    const s = await standVan(p.zernio_post);
    if (s.status === "published") await zet(p.id, { status: "geplaatst", links: s.links, foutmelding: null }, "ingepland");
    else if (s.status === "partial") await zet(p.id, { status: "geplaatst", links: s.links, foutmelding: s.fout }, "ingepland");
    else if (s.status === "failed" || s.status === "cancelled") await zet(p.id, { status: "mislukt", links: s.links, foutmelding: s.fout ?? "Plaatsen mislukt." }, "ingepland");
  } catch (e) {
    if (!(e instanceof ZernioFout && e.status >= 500)) console.error("[social] stand opvragen mislukt:", e);
  }
}

/**
 * Duwt alle posts een stap verder: maken wat binnen een week gepland staat, klare
 * creaties doorzetten, ingeplande posts controleren. Zonder kalender-id: alles (de cron).
 */
export async function verwerk(opties: { kalenderId?: string; userId?: string } = {}): Promise<{ gestart: number; bijgewerkt: number }> {
  const db = createServiceClient();
  const nu = Date.now();
  let q = db
    .from("content_posts")
    .select("*")
    // De week-grens geldt alleen voor beginnen: wat al gemaakt wordt (bv. via "Nu maken")
    // of ingepland is, loopt altijd door.
    .or(`status.in.(maken,ingepland),and(status.eq.gepland,gepland_op.lte.${new Date(nu + VOORUIT_MS).toISOString()})`)
    .order("gepland_op")
    .limit(200);
  if (opties.kalenderId) q = q.eq("kalender_id", opties.kalenderId);
  if (opties.userId) q = q.eq("user_id", opties.userId);
  const { data } = await q;
  const posts = (data ?? []) as Rij[];
  if (!posts.length) return { gestart: 0, bijgewerkt: 0 };

  const { data: ks } = await db.from("content_kalenders").select("*").in("id", [...new Set(posts.map((p) => p.kalender_id))]);
  const kalenders = new Map(((ks ?? []) as Kalender[]).map((k) => [k.id, k]));

  const ids = posts.flatMap((p) => (p.status === "maken" ? [p.beeld_id, p.video_id, p.montage_id] : [])).filter((x): x is string => !!x);
  const { data: cs } = ids.length ? await db.from("creaties").select("*").in("id", ids) : { data: [] };
  const creaties = new Map((await verversLopende((cs ?? []) as Creatie[])).map((c) => [c.id, c]));

  let gestart = 0;
  let bijgewerkt = 0;
  const bezigPerGebruiker = new Map<string, number>();
  for (const p of posts) if (p.status === "maken") bezigPerGebruiker.set(p.user_id, (bezigPerGebruiker.get(p.user_id) ?? 0) + 1);
  for (const p of posts) {
    const k = kalenders.get(p.kalender_id);
    if (!k || k.status !== "actief") continue;
    if (p.status === "gepland") {
      const bezig = bezigPerGebruiker.get(p.user_id) ?? 0;
      if (bezig >= PER_RONDE) continue;
      bezigPerGebruiker.set(p.user_id, bezig + 1);
      await startMaken(p);
      gestart++;
    } else if (p.status === "maken") {
      await verderMaken(p, k, creaties);
      bijgewerkt++;
    } else if (p.status === "ingepland" && new Date(p.gepland_op).getTime() < nu - 60_000) {
      await controleerGeplaatst(p);
      bijgewerkt++;
    }
  }
  return { gestart, bijgewerkt };
}
