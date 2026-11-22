"use client";

// De tijdlijn van een klare docu (verbeterplan idee 14): alle scenes op een rij, met per scene
// het vaste beeld, de tekst in beeld en de foto. Wisselen en aanpassen kost geen AI: de video
// wordt opnieuw gemaakt met dezelfde stem (1 credit). De oude versie blijft staan.

import { useEffect, useMemo, useState } from "react";
import type { Creatie } from "@/lib/creaties/types";

interface Scene {
  id: string;
  sjabloon: string;
  kop: string;
  sub: string;
  getal: string;
  stempel: string;
  items: { a: string; b: string }[];
  foto?: string;
  tekst: string;
}
interface Deel {
  deel: number;
  scenes: Scene[];
}
interface Foto {
  id: string;
  url: string;
  wat: string;
}

const BEELDEN: { id: string; naam: string; icoon: string; velden: ("kop" | "sub" | "getal" | "stempel" | "items" | "foto")[] }[] = [
  { id: "foto", naam: "Foto", icoon: "🖼", velden: ["foto", "kop", "sub"] },
  { id: "datum", naam: "Datum", icoon: "📅", velden: ["kop", "sub", "stempel"] },
  { id: "teller", naam: "Teller", icoon: "🔢", velden: ["getal", "kop", "sub", "stempel"] },
  { id: "titel", naam: "Titel", icoon: "🅣", velden: ["kop", "sub"] },
  { id: "citaat", naam: "Citaat", icoon: "❝", velden: ["kop", "sub"] },
  { id: "plek", naam: "Plek", icoon: "📍", velden: ["kop", "sub"] },
  { id: "tijdlijn", naam: "Tijdlijn", icoon: "⏱", velden: ["kop", "items"] },
  { id: "dossier", naam: "Dossier", icoon: "🗂", velden: ["kop", "sub", "items", "stempel"] },
  { id: "vergelijk", naam: "Vergelijk", icoon: "⚖", velden: ["items", "sub"] },
  { id: "grafiek", naam: "Grafiek", icoon: "📊", velden: ["kop", "items"] },
  { id: "lijst", naam: "Lijst", icoon: "☰", velden: ["kop", "items"] },
];
const NAAM: Record<string, string> = { kop: "Kop", sub: "Regel eronder", getal: "Getal", stempel: "Stempel" };

const itemsTekst = (items: { a: string; b: string }[]) => items.map((x) => (x.b ? `${x.a} | ${x.b}` : x.a)).join("\n");
const leesItems = (t: string) => t.split("\n").map((r) => r.split("|")).map(([a, ...b]) => ({ a: (a ?? "").trim(), b: b.join("|").trim() })).filter((x) => x.a || x.b);

export default function DocuTijdlijn({ creatie, onSluit, onGestart }: { creatie: Creatie; onSluit: () => void; onGestart: (c: Creatie) => void }) {
  const [delen, setDelen] = useState<Deel[] | null>(null);
  const [origineel, setOrigineel] = useState<string>("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/docu/tijdlijn?id=${creatie.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Tijdlijn ophalen mislukt");
        setDelen(d.delen);
        setOrigineel(JSON.stringify(d.delen));
        setFotos(d.fotos);
      })
      .catch((e) => setFout(e instanceof Error ? e.message : String(e)));
  }, [creatie.id]);

  // Welke scenes anders zijn dan bij het openen: alleen die gaan mee.
  const wijzigingen = useMemo(() => {
    if (!delen || !origineel) return [];
    const oud = JSON.parse(origineel) as Deel[];
    return delen.flatMap((d, k) =>
      d.scenes
        .filter((s, i) => JSON.stringify(s) !== JSON.stringify(oud[k].scenes[i]))
        .map((s) => ({ deel: d.deel, id: s.id, sjabloon: s.sjabloon, kop: s.kop, sub: s.sub, getal: s.getal, stempel: s.stempel, items: s.items, foto: s.foto ?? "" })),
    );
  }, [delen, origineel]);

  function wijzig(k: number, i: number, deel: Partial<Scene>) {
    setDelen((ds) => ds!.map((d, j) => (j !== k ? d : { ...d, scenes: d.scenes.map((s, n) => (n === i ? { ...s, ...deel } : s)) })));
  }

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/docu/tijdlijn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: creatie.id, wijzigingen }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Opnieuw maken mislukt");
      onGestart(d.creatie);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
      setBezig(false);
    }
  }

  let nummer = 0;
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3 sm:p-4" onClick={onSluit}>
      <div className="n-kaart w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col !p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-rand">
          <div>
            <h2 className="font-bold text-tekst">🎞 Tijdlijn</h2>
            <p className="text-xs text-tekst-3 mt-0.5">Kies per scene een ander beeld, pas de tekst in beeld aan of neem een andere foto. De stem blijft hetzelfde; de video wordt opnieuw gemaakt zonder AI.</p>
          </div>
          <button onClick={onSluit} className="text-tekst-3 text-xl leading-none" aria-label="Sluiten">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!delen && !fout && <p className="text-sm text-tekst-3">Tijdlijn laden…</p>}
          {delen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {delen.map((d, k) =>
                d.scenes.map((s, i) => {
                  nummer++;
                  const sleutel = `${k}-${s.id}`;
                  const b = BEELDEN.find((x) => x.id === s.sjabloon) ?? BEELDEN[3];
                  const foto = s.foto ? fotos.find((f) => f.id === s.foto) : null;
                  const gewijzigd = wijzigingen.some((w) => w.deel === d.deel && w.id === s.id);
                  return (
                    <div key={sleutel} className={`rounded-2xl border overflow-hidden ${gewijzigd ? "border-amber-400" : open === sleutel ? "border-blue-500" : "border-rand"}`}>
                      <button onClick={() => setOpen(open === sleutel ? null : sleutel)} className="block w-full text-left">
                        <div className="relative aspect-video bg-[#111113] flex items-center justify-center overflow-hidden">
                          {foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={foto.url} alt={foto.wat} className="absolute inset-0 w-full h-full object-cover opacity-70" />
                          ) : (
                            <span className="text-3xl opacity-60">{b.icoon}</span>
                          )}
                          <span className="relative px-2 text-center text-[13px] font-black uppercase text-[#f3efe6] leading-tight line-clamp-2">{s.sjabloon === "teller" ? s.getal : s.kop}</span>
                          <span className="absolute top-1.5 left-1.5 rounded bg-black/60 text-[10px] text-white px-1.5">{nummer} · {b.naam}</span>
                        </div>
                        <p className="px-2.5 py-2 text-[11px] text-tekst-3 line-clamp-2">{s.tekst}</p>
                      </button>
                      {open === sleutel && (
                        <div className="px-2.5 pb-3 space-y-2">
                          <select value={s.sjabloon} onChange={(e) => wijzig(k, i, { sjabloon: e.target.value, ...(e.target.value === "foto" && !s.foto && fotos[0] ? { foto: fotos[0].id } : {}) })} className="n-invoer !py-1.5 text-sm">
                            {BEELDEN.filter((x) => x.id !== "foto" || fotos.length).map((x) => (
                              <option key={x.id} value={x.id}>{x.icoon} {x.naam}</option>
                            ))}
                          </select>
                          {b.velden.includes("foto") && (
                            <div className="grid grid-cols-4 gap-1">
                              {fotos.map((f) => (
                                <button key={f.id} onClick={() => wijzig(k, i, { foto: f.id })} title={f.wat} className={`rounded overflow-hidden border-2 ${s.foto === f.id ? "border-blue-500" : "border-transparent"}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={f.url} alt={f.wat} className="w-full aspect-square object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          {(["getal", "kop", "sub", "stempel"] as const).filter((v) => b.velden.includes(v)).map((v) => (
                            <input key={v} value={s[v] ?? ""} onChange={(e) => wijzig(k, i, { [v]: e.target.value })} placeholder={NAAM[v]} className="n-invoer !py-1.5 text-sm" />
                          ))}
                          {b.velden.includes("items") && (
                            <textarea value={itemsTekst(s.items ?? [])} onChange={(e) => wijzig(k, i, { items: leesItems(e.target.value) })} rows={3} placeholder={"Eén per regel: label | waarde"} className="n-invoer text-sm resize-none" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-rand flex items-center justify-between gap-3">
          <p className="text-xs text-tekst-3">{fout ? <span className="text-red-500">{fout}</span> : wijzigingen.length ? `${wijzigingen.length} scene${wijzigingen.length === 1 ? "" : "s"} gewijzigd. Je huidige docu blijft bewaard.` : "Klik op een scene om hem aan te passen."}</p>
          <button onClick={maak} disabled={bezig || !wijzigingen.length} className="btn-primary disabled:opacity-50 whitespace-nowrap">
            {bezig ? "Bezig…" : "🎬 Maak opnieuw · 1 credit"}
          </button>
        </div>
      </div>
    </div>
  );
}
