"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// Het regieboek van de Regisseur: de voorstellen uit de wekelijkse leerronde (met de
// beelden waarop ze gebaseerd zijn) aanzetten of afwijzen, en zelf regels toevoegen.

interface Regel {
  id: string;
  categorie: string;
  regel: string;
  waarom: string | null;
  voorbeelden: { id: string; url: string; prompt: string }[];
  status: "voorstel" | "actief" | "afgewezen";
  bron: string;
  created_at: string;
}

const CATS = ["beeld", "video", "verhaal", "stem", "montage"];

export default function Regieboek() {
  const [regels, setRegels] = useState<Regel[]>([]);
  const [basis, setBasis] = useState("");
  const [toonBasis, setToonBasis] = useState(false);
  const [bewerk, setBewerk] = useState<Record<string, string>>({});
  const [nieuw, setNieuw] = useState({ regel: "", categorie: "beeld" });
  const [melding, setMelding] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const d = await fetch("/api/admin/regieboek", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setRegels(d.regels ?? []);
    setBasis(d.basis ?? "");
  }, []);
  useEffect(() => {
    laad();
  }, [laad]);

  async function doe(body: Record<string, unknown>) {
    setMelding(null);
    const res = await fetch("/api/admin/regieboek", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMelding(d.error ?? "Dat lukte niet.");
    if (d.regels) setRegels(d.regels);
    if (body.actie === "leerronde") setMelding("De leerronde loopt (1-2 minuten). Ververs de pagina straks voor nieuwe voorstellen.");
  }

  const groep = (s: Regel["status"]) => regels.filter((r) => r.status === s);

  const kaart = (r: Regel) => (
    <div key={r.id} className="n-kaart space-y-2">
      <div className="flex items-center gap-2 text-xs text-tekst-3">
        <span className="rounded-full bg-paneel-2 px-2 py-0.5">{r.categorie}</span>
        <span>{r.bron === "handmatig" ? "zelf toegevoegd" : "uit de leerronde"} · {new Date(r.created_at).toLocaleDateString("nl-NL")}</span>
      </div>
      <textarea
        value={bewerk[r.id] ?? r.regel}
        onChange={(e) => setBewerk({ ...bewerk, [r.id]: e.target.value })}
        rows={2}
        className="w-full rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst"
      />
      {r.waarom && <p className="text-xs text-tekst-2">🔍 {r.waarom}</p>}
      {r.voorbeelden?.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {r.voorbeelden.map((v) => (
            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" title={v.prompt} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.url} alt="" className="h-20 w-20 rounded-lg object-cover border border-rand" />
            </a>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {r.status !== "actief" && <button onClick={() => doe({ actie: "actief", id: r.id, regel: bewerk[r.id] })} className="btn-primary text-sm">✓ Aanzetten</button>}
        {r.status === "actief" && bewerk[r.id] !== undefined && <button onClick={() => doe({ actie: "actief", id: r.id, regel: bewerk[r.id] })} className="n-knop2 text-sm">Bewaren</button>}
        {r.status !== "afgewezen" && <button onClick={() => doe({ actie: "afgewezen", id: r.id })} className="n-knop2 text-sm">{r.status === "actief" ? "Uitzetten" : "Afwijzen"}</button>}
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-tekst-3 hover:text-tekst">← Beheer</Link>
        <h1 className="text-2xl font-bold text-tekst mt-2">📖 Regieboek van de Regisseur</h1>
        <p className="text-sm text-tekst-2 mt-1">
          Elke maandag bekijkt Claude een greep uit de beelden van de afgelopen week en de feedback van klanten, en stelt regels voor tegen fouten die steeds terugkomen. Pas als jij een regel aanzet, gebruikt de Regisseur hem.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => doe({ actie: "leerronde" })} className="n-knop2 text-sm">🔍 Nu een leerronde draaien</button>
          <button onClick={() => setToonBasis((x) => !x)} className="n-knop2 text-sm">{toonBasis ? "Vaste regels verbergen" : "Vaste regels bekijken"}</button>
        </div>
        {melding && <p className="text-sm text-tekst-2 mt-2">{melding}</p>}
        {toonBasis && <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-paneel-2 p-3 text-xs text-tekst-2">{basis}</pre>}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-tekst">Voorstellen ({groep("voorstel").length})</h2>
        {groep("voorstel").length ? groep("voorstel").map(kaart) : <p className="text-sm text-tekst-3">Geen openstaande voorstellen.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-tekst">Aan ({groep("actief").length})</h2>
        {groep("actief").map(kaart)}
        <div className="n-kaart space-y-2">
          <div className="text-sm font-semibold text-tekst">Zelf een regel toevoegen</div>
          <div className="flex gap-2">
            <select value={nieuw.categorie} onChange={(e) => setNieuw({ ...nieuw, categorie: e.target.value })} className="rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst">
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input value={nieuw.regel} onChange={(e) => setNieuw({ ...nieuw, regel: e.target.value })} placeholder="Bijv.: Zet nooit tekst op een verpakking; laat die leeg." className="flex-1 rounded-lg border border-rand bg-paneel px-2 py-1 text-sm text-tekst" />
            <button onClick={async () => { await doe({ actie: "nieuw", ...nieuw }); setNieuw({ ...nieuw, regel: "" }); }} className="btn-primary text-sm">Toevoegen</button>
          </div>
        </div>
      </section>

      {groep("afgewezen").length > 0 && (
        <details>
          <summary className="text-sm text-tekst-3 cursor-pointer">Afgewezen / uitgezet ({groep("afgewezen").length})</summary>
          <div className="space-y-3 mt-3">{groep("afgewezen").map(kaart)}</div>
        </details>
      )}
    </div>
  );
}
