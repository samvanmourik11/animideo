"use client";

// ── Elementen ────────────────────────────────────────────────────────────────
//
// Canva's grootste paneel, en bij ons ook: vormen, iconen en diagrammen op één
// plek. Twee niveaus, net als daar — een overzicht met van elke categorie een
// handvol, en per categorie een volledige lijst.
//
// Alles wat je hier ziet is deterministisch: de vormen en diagrammen worden
// getekend uit hun eigen parameters, de iconen staan al klaar in de bibliotheek.
// Alleen de tegel linksboven maakt iets nieuws, en die staat er expres pas ná
// de vraag "staat het er al?".

import { useMemo, useState } from "react";
import {
  VORMEN, VORM_GROEPEN, STANDAARD_VORMSTIJL, vormDataUri,
  type VormGroepId, type VormStijl,
} from "@/lib/editor/shapes-svg";
import {
  DIAGRAM_SOORTEN, DIAGRAM_KLEUREN, VOORBEELD_DATA, diagramDataUri,
  type DiagramSoort,
} from "@/lib/editor/charts";
import { ICONEN, ICON_CATEGORIEEN, iconUrl, zoekIconen, type IconCategorie } from "@/lib/editor/icons/library";
import type { EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId } from "@/lib/editor/plaatsing";
import type { DiagramMeta } from "@/lib/editor/timeline";
import { Chip, GenereerVak, KleurKiezer, Melding, PaneelKop, Sectie, Tegel, Zoekbalk } from "../ui";

type Weergave =
  | { soort: "overzicht" }
  | { soort: "vormen"; groep: VormGroepId | "alle" }
  | { soort: "iconen" }
  | { soort: "diagrammen" };

export default function ElementenPanel({ store, onSluit }: { store: EditorStore; onSluit: () => void }) {
  const [weergave, setWeergave] = useState<Weergave>({ soort: "overzicht" });
  const [zoek, setZoek] = useState("");
  const [stijl, setStijl] = useState<VormStijl>(STANDAARD_VORMSTIJL);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [iconCategorie, setIconCategorie] = useState<IconCategorie | "alle">("alle");
  const leeg = !heeftBeeld(store);

  function meld(res: { ok: true; summary?: string } | { ok: false; error: { message: string } }, gelukt: string) {
    setMelding(res.ok ? gelukt : res.error.message);
  }

  function plaatsVorm(vormId: string) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    meld(store.dispatch({ op: "add_vorm", clipId, vormId, stijl }), "Geplaatst — sleep hem op zijn plek");
  }

  function plaatsIcoon(src: string, label: string) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    meld(
      store.dispatch({ op: "add_element", clipId, src, label, x: 0.5, y: 0.35, scale: 0.18 }),
      `${label} toegevoegd`
    );
  }

  function plaatsDiagram(soort: DiagramSoort) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    const diagram: DiagramMeta = { soort, data: VOORBEELD_DATA, kleuren: DIAGRAM_KLEUREN, toonWaarden: true };
    meld(
      store.dispatch({ op: "add_diagram", clipId, diagram }),
      "Diagram geplaatst — pas de cijfers rechts aan"
    );
  }

  async function genereerIcoon(beschrijving: string) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/editor/icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beschrijving }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) {
        setMelding(d.error === "insufficient_credits" ? "Te weinig credits voor een eigen element." : d.error ?? "Mislukt");
        return;
      }
      plaatsIcoon(d.url, beschrijving);
    } catch {
      setMelding("Het maken lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  // Zoeken doorbreekt de indeling: je typt "pijl" en krijgt zowel de vormen als
  // de iconen die daarbij horen, want je weet niet in welk hokje het zit.
  const treffers = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return null;
    return {
      vormen: VORMEN.filter((v) => `${v.label} ${v.id}`.toLowerCase().includes(q)),
      iconen: zoekIconen(zoek, 60),
    };
  }, [zoek]);

  const iconLijst = useMemo(() => {
    if (iconCategorie === "alle") return ICONEN;
    return ICONEN.filter((i) => i.categorie === iconCategorie);
  }, [iconCategorie]);

  return (
    <div className="flex flex-col h-full">
      <PaneelKop
        titel={
          weergave.soort === "overzicht" ? "Elementen"
          : weergave.soort === "vormen" ? "Vormen"
          : weergave.soort === "iconen" ? "Iconen"
          : "Diagrammen"
        }
        onTerug={weergave.soort === "overzicht" ? undefined : () => setWeergave({ soort: "overzicht" })}
        onSluit={onSluit}
      />

      <Zoekbalk waarde={zoek} onWijzig={setZoek} hint="Zoek een vorm of icoon" />
      <GenereerVak
        hint="Beschrijf je ideale element"
        knop="Maak dit element"
        bezig={bezig}
        onGenereer={genereerIcoon}
        toelichting="Alles uit de bibliotheek is gratis; zelf laten maken kost 1 credit."
      />
      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        {treffers ? (
          <>
            <Sectie titel={`Vormen (${treffers.vormen.length})`}>
              <div className="grid grid-cols-5 gap-1.5">
                {treffers.vormen.map((v) => (
                  <Tegel key={v.id} titel={v.label} uit={leeg} onClick={() => plaatsVorm(v.id)}>
                    <VormBeeld id={v.id} stijl={stijl} />
                  </Tegel>
                ))}
              </div>
            </Sectie>
            <Sectie titel={`Iconen (${treffers.iconen.length})`}>
              <div className="grid grid-cols-5 gap-1.5">
                {treffers.iconen.map((i) => (
                  <Tegel key={i.slug} titel={i.label} uit={leeg} onClick={() => plaatsIcoon(iconUrl(i.slug), i.label)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconUrl(i.slug)} alt={i.label} loading="lazy" className="w-full h-full object-contain" />
                  </Tegel>
                ))}
              </div>
            </Sectie>
            {treffers.vormen.length === 0 && treffers.iconen.length === 0 && (
              <p className="px-4 text-[13px] text-slate-500">
                Niets gevonden voor “{zoek}”. Laat hem hierboven maken.
              </p>
            )}
          </>
        ) : weergave.soort === "overzicht" ? (
          <>
            <Sectie titel="Categorieën">
              <div className="grid grid-cols-3 gap-2">
                <Categorie label="Vormen" onClick={() => setWeergave({ soort: "vormen", groep: "alle" })}>
                  <VormBeeld id="ster-5" stijl={{ ...stijl, vulling: "#8b5cf6" }} />
                </Categorie>
                <Categorie label="Iconen" onClick={() => setWeergave({ soort: "iconen" })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrl(ICONEN[0]?.slug ?? "")} alt="" className="w-full h-full object-contain" />
                </Categorie>
                <Categorie label="Diagrammen" onClick={() => setWeergave({ soort: "diagrammen" })}>
                  <VormBeeld id="ring-voorbeeld" stijl={stijl} diagram="ring" />
                </Categorie>
              </div>
            </Sectie>

            <Kleuren stijl={stijl} onWijzig={setStijl} />

            {VORM_GROEPEN.slice(0, 4).map((g) => (
              <Sectie key={g.id} titel={g.label} alles={{ open: false, onWissel: () => setWeergave({ soort: "vormen", groep: g.id }) }}>
                <div className="grid grid-cols-5 gap-1.5">
                  {VORMEN.filter((v) => v.groep === g.id).slice(0, 5).map((v) => (
                    <Tegel key={v.id} titel={v.label} uit={leeg} onClick={() => plaatsVorm(v.id)}>
                      <VormBeeld id={v.id} stijl={stijl} />
                    </Tegel>
                  ))}
                </div>
              </Sectie>
            ))}

            <Sectie titel="Iconen" alles={{ open: false, onWissel: () => setWeergave({ soort: "iconen" }) }}>
              <div className="grid grid-cols-5 gap-1.5">
                {ICONEN.slice(0, 10).map((i) => (
                  <Tegel key={i.slug} titel={i.label} uit={leeg} onClick={() => plaatsIcoon(iconUrl(i.slug), i.label)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconUrl(i.slug)} alt={i.label} loading="lazy" className="w-full h-full object-contain" />
                  </Tegel>
                ))}
              </div>
            </Sectie>
          </>
        ) : weergave.soort === "vormen" ? (
          <>
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              <Chip actief={weergave.groep === "alle"} onClick={() => setWeergave({ soort: "vormen", groep: "alle" })} label={`Alles (${VORMEN.length})`} />
              {VORM_GROEPEN.map((g) => (
                <Chip key={g.id} actief={weergave.groep === g.id} onClick={() => setWeergave({ soort: "vormen", groep: g.id })} label={g.label} />
              ))}
            </div>
            <Kleuren stijl={stijl} onWijzig={setStijl} />
            {(weergave.groep === "alle" ? VORM_GROEPEN : VORM_GROEPEN.filter((g) => g.id === weergave.groep)).map((g) => (
              <Sectie key={g.id} titel={g.label}>
                <div className="grid grid-cols-5 gap-1.5">
                  {VORMEN.filter((v) => v.groep === g.id).map((v) => (
                    <Tegel key={v.id} titel={v.label} uit={leeg} onClick={() => plaatsVorm(v.id)}>
                      <VormBeeld id={v.id} stijl={stijl} />
                    </Tegel>
                  ))}
                </div>
              </Sectie>
            ))}
          </>
        ) : weergave.soort === "iconen" ? (
          <>
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              <Chip actief={iconCategorie === "alle"} onClick={() => setIconCategorie("alle")} label={`Alles (${ICONEN.length})`} />
              {ICON_CATEGORIEEN.map((c) => (
                <Chip key={c.id} actief={iconCategorie === c.id} onClick={() => setIconCategorie(c.id)} label={c.label} />
              ))}
            </div>
            <div className="px-4 grid grid-cols-5 gap-1.5">
              {iconLijst.map((i) => (
                <Tegel key={i.slug} titel={i.label} uit={leeg} onClick={() => plaatsIcoon(iconUrl(i.slug), i.label)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={iconUrl(i.slug)} alt={i.label} loading="lazy" className="w-full h-full object-contain" />
                </Tegel>
              ))}
            </div>
          </>
        ) : (
          <Sectie titel="Kies een soort">
            <div className="grid grid-cols-2 gap-2">
              {DIAGRAM_SOORTEN.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={leeg}
                  onClick={() => plaatsDiagram(d.id)}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-2 disabled:opacity-40"
                >
                  <VormBeeld id={d.id} stijl={stijl} diagram={d.id} />
                  <span className="block text-[12px] text-slate-700 mt-1">{d.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[12px] text-slate-500 mt-3 leading-snug">
              Je krijgt een diagram met voorbeeldcijfers. De cijfers pas je daarna rechts aan;
              de tekening wordt dan opnieuw gemaakt.
            </p>
          </Sectie>
        )}
      </div>
    </div>
  );
}

function Kleuren({ stijl, onWijzig }: { stijl: VormStijl; onWijzig: (s: VormStijl) => void }) {
  return (
    <div className="px-4 pb-4 space-y-3">
      <KleurKiezer label="Vulkleur" waarde={stijl.vulling} onKies={(vulling) => onWijzig({ ...stijl, vulling })} />
      <KleurKiezer label="Lijnkleur" waarde={stijl.lijn} onKies={(lijn) => onWijzig({ ...stijl, lijn })} />
      <div>
        <p className="text-[12px] font-medium text-slate-600 mb-1">Lijndikte</p>
        <input
          type="range"
          min={0.01}
          max={0.2}
          step={0.005}
          value={stijl.dikte}
          onChange={(e) => onWijzig({ ...stijl, dikte: Number(e.target.value) })}
          className="w-full accent-violet-600"
        />
      </div>
    </div>
  );
}

function Categorie({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-3 text-center"
    >
      <div className="h-12 flex items-center justify-center">{children}</div>
      <span className="block text-[12px] font-medium text-slate-700 mt-1">{label}</span>
    </button>
  );
}

/**
 * De tegel toont letterlijk wat je krijgt: dezelfde SVG die straks in de video
 * belandt, met de kleuren die nu ingesteld staan. Geen aparte iconenset die uit
 * de pas kan lopen met het echte resultaat.
 */
function VormBeeld({ id, stijl, diagram }: { id: string; stijl: VormStijl; diagram?: DiagramSoort }) {
  const src = diagram
    ? diagramDataUri({
        soort: diagram,
        data: VOORBEELD_DATA.slice(0, 3),
        tekstkleur: "#64748b",
        toonWaarden: false,
        breedtePx: 240,
      })
    : vormDataUri(id, stijl, 200);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="w-full h-full object-contain" />;
}
