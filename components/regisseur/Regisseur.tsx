"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { CREATIES_GEWIJZIGD } from "@/components/app-shell/Zijbalk";

// De Regisseur: één chat waarin Claude het werk plant en de gereedschappen van de app
// aanstuurt. Het gesprek komt uit de database (precies wat Claude ziet); hier maken we
// er leesbare blokjes van. Een vraag, een bevestiging of het wachten op creaties staat
// onderaan als kaart.

type Blok = { type: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown; tool_use_id?: string };
type Bericht = { role: "user" | "assistant"; content: string | Blok[] };
interface Stap { toolUseId: string; naam: string; credits: number; omschrijving: string }
type Wachtend =
  | { soort: "antwoord"; vraag: string; opties: string[] }
  | { soort: "bevestiging"; stappen: Stap[]; totaal: number }
  | { soort: "maken"; ids: string[] };
interface Project {
  id: string;
  titel: string;
  status: string;
  berichten: Bericht[];
  wachtend: Wachtend | null;
  foutmelding: string | null;
  automatisch: boolean;
  gebruik?: { usd?: number };
}

const VOORBEELDEN = [
  "Maak een reclame van 30 seconden voor dit product: https://…",
  "Een korte, grappige western-film van 30 seconden met drie personages",
  "5 Instagram-posts voor mijn bakkerij, in een warme huisstijl",
  "Een uitlegvideo van 20 seconden over onze nieuwe zonnepanelen-actie",
];

const ICOON: Record<string, string> = {
  maak_beeld: "🖼️ Beeld maken",
  maak_video: "🎬 Video maken",
  gebruik_app: "🧩 App gebruiken",
  monteer: "✂️ Monteren",
  lees_webpagina: "🌐 Pagina lezen",
  mijn_werk: "📚 Je werk bekijken",
  wacht_op: "⏳ Wachten op resultaten",
};

/** Het gesprek in leesbare regels: tekst van beide kanten, en wat de Regisseur deed. */
function regels(berichten: Bericht[]) {
  const uit: { wie: "jij" | "regisseur" | "actie"; tekst: string }[] = [];
  for (const b of berichten) {
    if (typeof b.content === "string") {
      uit.push({ wie: b.role === "user" ? "jij" : "regisseur", tekst: b.content });
      continue;
    }
    for (const blok of b.content) {
      if (blok.type === "text" && blok.text?.trim()) uit.push({ wie: b.role === "user" ? "jij" : "regisseur", tekst: blok.text });
      if (blok.type === "tool_use" && blok.name === "vraag_keuze") uit.push({ wie: "regisseur", tekst: String(blok.input?.vraag ?? "") });
      else if (blok.type === "tool_use" && blok.name && ICOON[blok.name]) {
        const i = blok.input ?? {};
        const extra = String(i.prompt ?? i.beweging ?? i.url ?? i.titel ?? i.app_id ?? "").slice(0, 80);
        uit.push({ wie: "actie", tekst: `${ICOON[blok.name]}${extra ? `: ${extra}` : ""}` });
      }
      if (blok.type === "tool_result" && typeof blok.content === "string" && blok.content.startsWith("Antwoord van de gebruiker: ")) {
        uit.push({ wie: "jij", tekst: blok.content.slice("Antwoord van de gebruiker: ".length) });
      }
    }
  }
  return uit;
}

/** Claude schrijft **vet**; dat tonen we als vet in plaats van met sterretjes. */
function MetVet({ tekst }: { tekst: string }) {
  return (
    <>
      {tekst.split(/(\*\*[^*]+\*\*)/g).map((stuk, i) =>
        stuk.startsWith("**") && stuk.endsWith("**") ? <strong key={i}>{stuk.slice(2, -2)}</strong> : <span key={i}>{stuk}</span>,
      )}
    </>
  );
}

async function stuur(pad: string, body: unknown) {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Er ging iets mis.");
  return d;
}

export default function Regisseur() {
  const [projecten, setProjecten] = useState<{ id: string; titel: string; status: string }[]>([]);
  const [actief, setActief] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [galerij, setGalerij] = useState<Creatie[]>([]);
  const [invoer, setInvoer] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState<Creatie | null>(null);
  const onder = useRef<HTMLDivElement>(null);

  const laadLijst = useCallback(async () => {
    const d = await fetch("/api/regisseur", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setProjecten(d.projecten ?? []);
  }, []);

  const laadProject = useCallback(async (id: string) => {
    const d = await fetch(`/api/regisseur/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    if (d.project) {
      setProject(d.project);
      setGalerij(d.galerij ?? []);
    }
  }, []);

  useEffect(() => {
    laadLijst();
    const id = new URLSearchParams(window.location.search).get("project");
    if (id) setActief(id);
  }, [laadLijst]);

  useEffect(() => {
    if (!actief) {
      setProject(null);
      setGalerij([]);
      return;
    }
    laadProject(actief);
    window.history.replaceState(null, "", `?project=${actief}`);
  }, [actief, laadProject]);

  // Zolang de Regisseur werkt of op creaties wacht: elke 2,5 s kijken. Dat opvragen laat
  // ook de wachtrij doorlopen en de Regisseur verdergaan.
  const bezig = project?.status === "denkt" || project?.status === "wacht_op_maken" || galerij.some((c) => c.status === "bezig");
  useEffect(() => {
    if (!actief || !bezig) return;
    const t = setInterval(() => {
      laadProject(actief);
      window.dispatchEvent(new Event(CREATIES_GEWIJZIGD));
    }, 2500);
    return () => clearInterval(t);
  }, [actief, bezig, laadProject]);

  const aantalRegels = project ? regels(project.berichten).length : 0;
  useEffect(() => {
    onder.current?.scrollIntoView({ behavior: "smooth" });
  }, [aantalRegels, project?.status]);

  async function doe(actie: () => Promise<void>) {
    setFout(null);
    try {
      await actie();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }

  function verstuur(tekst = invoer) {
    const t = tekst.trim();
    if (!t) return;
    return doe(async () => {
      if (!actief) {
        const d = await stuur("/api/regisseur", { tekst: t });
        setInvoer("");
        setActief(d.id);
        laadLijst();
      } else {
        await stuur(`/api/regisseur/${actief}`, { actie: "bericht", tekst: t });
        setInvoer("");
        setProject((p) => (p ? { ...p, status: "denkt", berichten: [...p.berichten, { role: "user", content: t }], wachtend: null } : p));
      }
    });
  }

  const w = project?.wachtend;

  return (
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-5 items-start -mt-2">
      {/* Projecten */}
      <aside className="space-y-2 lg:sticky lg:top-6">
        <button onClick={() => { setActief(null); setFout(null); }} className="btn-primary w-full">＋ Nieuw project</button>
        <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
          {projecten.map((p) => (
            <button
              key={p.id}
              onClick={() => setActief(p.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm truncate ${actief === p.id ? "bg-paneel-2 text-tekst font-medium" : "text-tekst-3 hover:bg-paneel-2 hover:text-tekst"}`}
            >
              {p.status === "denkt" || p.status === "wacht_op_maken" ? "⏳ " : p.status.startsWith("wacht") ? "❓ " : ""}
              {p.titel}
            </button>
          ))}
        </div>
      </aside>

      {/* Gesprek */}
      <section className="min-h-[70vh] flex flex-col">
        {!project ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 py-10">
            <div>
              <div className="text-4xl">🎬</div>
              <h1 className="text-3xl font-extrabold text-tekst tracking-tight mt-2">De Regisseur</h1>
              <p className="text-tekst-3 mt-2 max-w-lg">
                Zeg wat je wilt maken. De Regisseur bedenkt een plan, stelt je een paar vragen en maakt het met alle gereedschappen van Animideo: beelden, video&apos;s, apps en montage.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-w-2xl w-full">
              {VOORBEELDEN.map((v) => (
                <button key={v} onClick={() => setInvoer(v)} className="text-left text-sm rounded-2xl border border-rand bg-paneel px-4 py-3 text-tekst-2 hover:border-blue-500/50">
                  {v}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-3 pb-4">
            <h1 className="text-lg font-bold text-tekst">{project.titel}</h1>
            {regels(project.berichten).map((r, i) =>
              r.wie === "actie" ? (
                <div key={i} className="text-xs text-tekst-3 pl-1">{r.tekst}</div>
              ) : (
                <div key={i} className={`flex ${r.wie === "jij" ? "justify-end" : ""}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      r.wie === "jij" ? "bg-blue-600 text-white" : "bg-paneel border border-rand text-tekst"
                    }`}
                  >
                    <MetVet tekst={r.tekst} />
                  </div>
                </div>
              ),
            )}

            {project.status === "denkt" && (
              <div className="flex items-center gap-2 text-sm text-tekst-3">
                <span className="w-4 h-4 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" /> De Regisseur denkt na…
              </div>
            )}

            {w?.soort === "antwoord" && project.status === "wacht_op_antwoord" && (
              <div className="n-kaart !p-4 space-y-2">
                <div className="text-sm font-semibold text-tekst">{w.vraag}</div>
                <div className="flex flex-wrap gap-2">
                  {w.opties.map((o) => (
                    <button
                      key={o}
                      onClick={() =>
                        doe(async () => {
                          await stuur(`/api/regisseur/${project.id}`, { actie: "antwoord", tekst: o });
                          setProject({ ...project, status: "denkt", wachtend: null });
                          laadProject(project.id);
                        })
                      }
                      className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-sm text-blue-700 dark:text-blue-200 hover:bg-blue-500/20"
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-tekst-3">Of typ hieronder je eigen antwoord.</p>
              </div>
            )}

            {w?.soort === "bevestiging" && project.status === "wacht_op_bevestiging" && (
              <div className="n-kaart !p-4 space-y-3">
                <div className="text-sm font-semibold text-tekst">De Regisseur wil dit maken:</div>
                <ul className="space-y-1">
                  {w.stappen.map((s) => (
                    <li key={s.toolUseId} className="flex justify-between gap-3 text-sm text-tekst-2">
                      <span className="truncate">{s.omschrijving}</span>
                      <span className="shrink-0 text-tekst-3">{s.credits ? `${s.credits} cr.` : "gratis"}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      doe(async () => {
                        await stuur(`/api/regisseur/${project.id}`, { actie: "bevestig", ja: true });
                        setProject({ ...project, status: "denkt", wachtend: null });
                      })
                    }
                    className="btn-primary"
                  >
                    ▶ Start · {w.totaal} credits
                  </button>
                  <button
                    onClick={() =>
                      doe(async () => {
                        await stuur(`/api/regisseur/${project.id}`, { actie: "bevestig", ja: false });
                        setProject({ ...project, status: "denkt", wachtend: null });
                      })
                    }
                    className="n-knop2"
                  >
                    Niet doen
                  </button>
                  <label className="ml-auto flex items-center gap-2 text-xs text-tekst-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={project.automatisch}
                      onChange={(e) =>
                        doe(async () => {
                          await stuur(`/api/regisseur/${project.id}`, { actie: "automatisch", aan: e.target.checked });
                          setProject({ ...project, automatisch: e.target.checked });
                        })
                      }
                    />
                    Voortaan automatisch in dit project
                  </label>
                </div>
              </div>
            )}

            {w?.soort === "maken" && project.status === "wacht_op_maken" && (
              <div className="flex items-center gap-2 text-sm text-tekst-3">
                <span className="w-4 h-4 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                Bezig met maken ({w.ids.length}). De Regisseur kijkt mee en gaat vanzelf verder.
              </div>
            )}

            {project.status === "fout" && (
              <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">
                {project.foutmelding ?? "Er ging iets mis."} Typ hieronder om het opnieuw te proberen.
              </p>
            )}
            <div ref={onder} />
          </div>
        )}

        <div className="sticky bottom-3 mt-2">
          {fout && <p className="text-sm text-red-600 dark:text-red-300 mb-2">{fout}{fout.includes("credits") && <> <Link href="/pricing" className="underline">Credits bijkopen</Link></>}</p>}
          <div className="flex gap-2 rounded-2xl border border-rand bg-paneel p-2 shadow-sm">
            <textarea
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  verstuur();
                }
              }}
              rows={2}
              placeholder={project ? "Stuur bij, stel een vraag of geef een nieuwe opdracht…" : "Wat wil je maken? Plak gerust een link naar je product."}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-tekst outline-none placeholder:text-tekst-3"
            />
            <button onClick={() => verstuur()} disabled={!invoer.trim() || project?.status === "denkt"} className="btn-primary self-end disabled:opacity-50">
              Stuur
            </button>
          </div>
          {project?.gebruik?.usd !== undefined && (
            <p className="text-[11px] text-tekst-3 mt-1">Alleen voor beheer: Claude-tekstkosten dit project ≈ ${project.gebruik.usd.toFixed(3)}</p>
          )}
        </div>
      </section>

      {/* Galerij */}
      <aside className="lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-tekst-2 mb-2">In dit project</h2>
        {galerij.length === 0 ? (
          <p className="text-xs text-tekst-3">Wat de Regisseur maakt, verschijnt hier en in je bibliotheek.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[75vh] overflow-y-auto">
            {galerij.map((c) => <CreatieKaart key={c.id} creatie={c} onOpen={() => setOpen(c)} />)}
          </div>
        )}
      </aside>

      {open && (
        <CreatieDetail
          creatie={galerij.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={(c) => setGalerij((g) => g.map((x) => (x.id === c.id ? c : x)))}
          onWeg={(id) => setGalerij((g) => g.filter((x) => x.id !== id))}
          onNieuw={() => {}}
        />
      )}
    </div>
  );
}
