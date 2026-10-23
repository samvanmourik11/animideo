"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABEL, platform, type Kalender, type Post, type PostStatus } from "@/lib/social/types";

// Eén contentkalender: eerst de ideeën (aanpassen, opnieuw laten bedenken, goedkeuren),
// daarna per week de posts volgen: wordt gemaakt → keuren of ingepland → geplaatst.

interface CreatieKort { id: string; url: string | null; status: string; soort: string }

const ZONE = "Europe/Amsterdam";
const STATUS_KLEUR: Record<PostStatus, string> = {
  idee: "bg-paneel-2 text-tekst-2",
  gepland: "bg-paneel-2 text-tekst-2",
  maken: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  te_keuren: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ingepland: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  geplaatst: "bg-green-500/15 text-green-700 dark:text-green-300",
  mislukt: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function delen(iso: string) {
  const d = new Date(iso);
  return {
    datum: new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE }).format(d),
    tijd: new Intl.DateTimeFormat("nl-NL", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" }).format(d),
    mooi: new Intl.DateTimeFormat("nl-NL", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

/** De maandag van de week waarin de post valt, als kopje. */
function weekVan(iso: string): string {
  const d = new Date(`${delen(iso).datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default function ContentKalender({ id }: { id: string }) {
  const [k, setK] = useState<Kalender | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [creaties, setCreaties] = useState<Record<string, CreatieKort>>({});
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<string | null>(null);
  const [aanvulling, setAanvulling] = useState("");

  const laad = useCallback(async () => {
    const res = await fetch(`/api/social/kalenders/${id}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setFout(d.error ?? "Laden mislukt.");
    setK(d.kalender);
    setPosts(d.posts ?? []);
    setCreaties(Object.fromEntries((d.creaties ?? []).map((c: CreatieKort) => [c.id, c])));
  }, [id]);
  useEffect(() => {
    laad();
  }, [laad]);
  // Verversen zolang er iets loopt: ideeën bedenken, maken, of wachten op plaatsen.
  const loopt = k?.status === "ideeen_maken" || posts.some((p) => p.status === "maken" || p.status === "ingepland");
  useEffect(() => {
    if (!loopt) return;
    const t = setInterval(laad, k?.status === "ideeen_maken" ? 4000 : 8000);
    return () => clearInterval(t);
  }, [loopt, laad, k?.status]);

  async function doe(body: Record<string, unknown>, sleutel: string) {
    setBezig(sleutel);
    setFout(null);
    const res = await fetch(`/api/social/kalenders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBezig(null);
    if (!res.ok) setFout(d.error ?? "Dat lukte niet.");
    if (body.actie === "weg_kalender" && res.ok) return (window.location.href = "/studios/social");
    await laad();
    return res.ok;
  }

  if (!k) return <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-tekst-3">{fout ?? "Laden…"}</div>;

  const weken = new Map<string, Post[]>();
  for (const p of posts) weken.set(weekVan(p.gepland_op), [...(weken.get(weekVan(p.gepland_op)) ?? []), p]);
  const teKeuren = posts.filter((p) => p.status === "te_keuren").length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      <div>
        <Link href="/studios/social" className="text-sm text-tekst-3 hover:text-tekst">← Social</Link>
        <h1 className="text-2xl font-bold text-tekst mt-2">{k.titel}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-tekst-2">
          {k.kanalen.map((x) => (
            <span key={x.accountId} className="rounded-full bg-paneel-2 px-2 py-0.5 text-xs">{platform(x.platform)?.icoon} {x.naam}</span>
          ))}
          <span className="text-xs text-tekst-3">· {k.weken} wk × {k.per_week} posts</span>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <span>Als een post af is:</span>
            <select value={k.modus} onChange={(e) => doe({ actie: "modus", modus: e.target.value }, "modus")} className="rounded-lg border border-rand bg-paneel px-2 py-1 text-tekst">
              <option value="controleren">👀 eerst zelf keuren</option>
              <option value="plaatsen">🚀 gewoon plaatsen</option>
            </select>
          </label>
        </div>
      </div>
      {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}

      {k.status === "ideeen_maken" && (
        <div className="n-kaart flex items-center gap-3 text-sm text-tekst-2">
          <span className="w-4 h-4 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
          De Regisseur bedenkt je kalender. Dat duurt een minuut of twee…
        </div>
      )}
      {k.status === "fout" && (
        <div className="n-kaart space-y-2 text-sm">
          <p className="text-red-600 dark:text-red-300">{k.foutmelding ?? "Er ging iets mis bij het bedenken."}</p>
          <button onClick={() => doe({ actie: "opnieuw_bedenken" }, "opnieuw")} className="n-knop2 text-sm">Opnieuw proberen</button>
        </div>
      )}
      {k.status === "ideeen" && (
        <div className="n-kaart space-y-3 border-blue-500/50">
          <p className="text-sm text-tekst-2">
            Hier zijn de ideeën. Pas aan wat je wilt, haal weg wat je niet wilt. Tevreden? Keur ze goed: dan maken we de posts telkens een week vooruit
            {k.modus === "controleren" ? " en krijg je ze eerst te zien" : " en worden ze automatisch geplaatst"}.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={aanvulling}
              onChange={(e) => setAanvulling(e.target.value)}
              placeholder="Niet helemaal goed? Bijv.: meer video's, minder hashtags, ook onze lunch laten zien…"
              className="flex-1 rounded-xl border border-rand bg-paneel px-3 py-2 text-sm text-tekst"
            />
            <button onClick={() => doe({ actie: "opnieuw_bedenken", aanvulling }, "opnieuw")} disabled={!!bezig} className="n-knop2 text-sm">↻ Opnieuw bedenken</button>
            <button onClick={() => doe({ actie: "goedkeuren" }, "goed")} disabled={!!bezig || !posts.length} className="btn-primary text-sm">✓ Ideeën goedkeuren</button>
          </div>
        </div>
      )}
      {teKeuren > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">👀 {teKeuren} {teKeuren === 1 ? "post wacht" : "posts wachten"} op jouw keuring.</p>}

      {[...weken.entries()].map(([week, lijst]) => (
        <section key={week} className="space-y-2">
          <h2 className="text-sm font-semibold text-tekst-2">
            Week van {new Date(`${week}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}
          </h2>
          {lijst.map((p) => (
            <PostKaart
              key={p.id}
              p={p}
              media={creaties[(p.soort === "video" ? p.video_id : p.beeld_id) ?? ""] ?? (p.beeld_id ? creaties[p.beeld_id] : undefined)}
              actief={k.status === "actief"}
              bezig={bezig === p.id}
              bewerken={bewerk === p.id}
              onBewerk={(aan) => setBewerk(aan ? p.id : null)}
              onActie={async (body) => {
                const ok = await doe({ ...body, post: p.id }, p.id);
                if (ok && body.actie === "wijzig") setBewerk(null);
              }}
            />
          ))}
        </section>
      ))}

      <div className="pt-4 border-t border-rand">
        <button
          onClick={() => window.confirm("Deze kalender weghalen? Ingeplande posts worden geannuleerd; wat al online staat, blijft staan.") && doe({ actie: "weg_kalender" }, "weg")}
          className="text-sm text-red-600 dark:text-red-300 hover:underline"
        >
          Kalender weghalen
        </button>
      </div>
    </div>
  );
}

function PostKaart({
  p, media, actief, bezig, bewerken, onBewerk, onActie,
}: {
  p: Post;
  media?: CreatieKort;
  actief: boolean;
  bezig: boolean;
  bewerken: boolean;
  onBewerk: (aan: boolean) => void;
  onActie: (body: Record<string, unknown>) => void;
}) {
  const d = delen(p.gepland_op);
  const [velden, setVelden] = useState({ datum: d.datum, tijd: d.tijd, tekst: p.tekst, idee: p.idee, beeld_prompt: p.beeld_prompt });
  const magWijzigen = ["idee", "gepland", "te_keuren", "mislukt"].includes(p.status);
  const klaarMedia = media?.status === "klaar" && media.url ? media : null;

  return (
    <div className="n-kaart !p-3 flex flex-col sm:flex-row gap-3">
      <div className="sm:w-36 shrink-0">
        {klaarMedia ? (
          media!.soort === "video" ? (
            <video src={klaarMedia.url!} controls muted playsInline className="w-full aspect-[9/16] max-h-64 rounded-xl object-cover bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={klaarMedia.url!} alt={p.idee} className="w-full aspect-square rounded-xl object-cover" />
          )
        ) : (
          <div className={`w-full ${p.soort === "video" ? "aspect-[9/16] max-h-64" : "aspect-square"} rounded-xl bg-paneel-2 flex items-center justify-center text-2xl text-tekst-3`}>
            {p.status === "maken" ? <span className="w-5 h-5 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" /> : p.soort === "video" ? "🎬" : "🖼️"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-tekst">{d.mooi}</span>
          <span>{p.platforms.map((x) => platform(x)?.icoon).join(" ")}</span>
          <span className="text-tekst-3">{p.soort === "video" ? "video" : "beeld"}</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 ${STATUS_KLEUR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
        </div>
        {bewerken ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input type="date" value={velden.datum} onChange={(e) => setVelden({ ...velden, datum: e.target.value })} className="rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst" />
              <input type="time" value={velden.tijd} onChange={(e) => setVelden({ ...velden, tijd: e.target.value })} className="rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst" />
            </div>
            <label className="block text-xs text-tekst-3">Idee
              <input value={velden.idee} onChange={(e) => setVelden({ ...velden, idee: e.target.value })} className="mt-0.5 w-full rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst" />
            </label>
            <label className="block text-xs text-tekst-3">Tekst bij de post
              <textarea value={velden.tekst} onChange={(e) => setVelden({ ...velden, tekst: e.target.value })} rows={4} className="mt-0.5 w-full rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst" />
            </label>
            <label className="block text-xs text-tekst-3">Wat er in beeld komt (Engels; aanpassen = nieuw beeld)
              <textarea value={velden.beeld_prompt} onChange={(e) => setVelden({ ...velden, beeld_prompt: e.target.value })} rows={2} className="mt-0.5 w-full rounded-lg border border-rand bg-paneel px-2 py-1 text-xs text-tekst" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => onActie({ actie: "wijzig", velden })} disabled={bezig} className="btn-primary text-sm">Bewaren</button>
              <button onClick={() => onBewerk(false)} className="n-knop2 text-sm">Annuleren</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-tekst">{p.idee}</p>
            <p className="text-sm text-tekst-2 whitespace-pre-wrap line-clamp-6">{p.tekst}</p>
          </>
        )}
        {p.foutmelding && <p className="text-xs text-red-600 dark:text-red-300">{p.foutmelding}</p>}
        {Object.keys(p.links ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(p.links).map(([pl, url]) => (
              <a key={pl} href={url} target="_blank" rel="noreferrer" className="text-blue-500 underline">Bekijk op {platform(pl)?.naam ?? pl}</a>
            ))}
          </div>
        )}
        {!bewerken && (
          <div className="flex flex-wrap gap-2 pt-1">
            {p.status === "te_keuren" && <button onClick={() => onActie({ actie: "plaats" })} disabled={bezig} className="btn-primary text-sm">✓ Goed, plaatsen</button>}
            {p.status === "mislukt" && klaarMedia && <button onClick={() => onActie({ actie: "plaats" })} disabled={bezig} className="n-knop2 text-sm">↻ Opnieuw plaatsen</button>}
            {actief && p.status === "gepland" && <button onClick={() => onActie({ actie: "maak_nu" })} disabled={bezig} className="n-knop2 text-sm">▶ Nu maken</button>}
            {actief && (p.status === "te_keuren" || p.status === "mislukt") && <button onClick={() => onActie({ actie: "maak_nu" })} disabled={bezig} className="n-knop2 text-sm">↻ Nieuw beeld</button>}
            {magWijzigen && <button onClick={() => onBewerk(true)} className="n-knop2 text-sm">✏️ Aanpassen</button>}
            {p.status !== "geplaatst" && p.status !== "maken" && (
              <button onClick={() => onActie({ actie: "weg" })} disabled={bezig} className="text-sm text-tekst-3 hover:text-red-500 ml-auto">Weghalen</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
