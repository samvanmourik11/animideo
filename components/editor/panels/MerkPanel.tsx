"use client";

// ── Merk ─────────────────────────────────────────────────────────────────────
//
// Je huisstijl staat al ergens: kleuren, lettertypen, logo en referentiebeelden
// in de merkkit die je bij het aanmaken van een project kiest. Dit paneel haalt
// die op zodat je hem in de editor kunt gebruiken zonder hexcodes over te typen
// — dat is de hele reden dat Canva zo'n tabblad heeft.
//
// Er wordt hier niets gewijzigd aan de merkkit zelf; dat blijft op /brand. Dit
// is een gereedschapskist, geen instellingenscherm.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BrandKit } from "@/lib/types";
import type { EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId } from "@/lib/editor/plaatsing";
import { Melding, PaneelKop, Sectie } from "../ui";

export default function MerkPanel({ store, onSluit }: { store: EditorStore; onSluit: () => void }) {
  const [kits, setKits] = useState<BrandKit[] | null>(null);
  const [actief, setActief] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const leeg = !heeftBeeld(store);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("brand_kits")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) {
        setMelding("Je merkkits ophalen lukte niet.");
        setKits([]);
        return;
      }
      const lijst = (data ?? []) as BrandKit[];
      setKits(lijst);
      setActief(lijst[0]?.id ?? null);
    })();
  }, []);

  const kit = kits?.find((k) => k.id === actief) ?? null;

  function plaatsBeeld(url: string, label: string) {
    const clipId = huidigeClipId(store);
    if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
    const res = store.dispatch({ op: "add_element", clipId, src: url, label, x: 0.5, y: 0.5, scale: 0.3 });
    setMelding(res.ok ? `${label} toegevoegd` : res.error.message);
  }

  function kopieer(hex: string) {
    navigator.clipboard?.writeText(hex).then(
      () => setMelding(`${hex} gekopieerd — plak hem in een kleurveld`),
      () => setMelding(hex)
    );
  }

  const kleuren = kit
    ? (Object.entries(kit.colors ?? {}).filter(([, v]) => typeof v === "string" && v) as Array<[string, string]>)
    : [];

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Merk" onSluit={onSluit} />
      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        {kits === null ? (
          <p className="px-4 text-[13px] text-slate-500">Bezig met ophalen…</p>
        ) : kits.length === 0 ? (
          <div className="px-4">
            <p className="text-[13px] text-slate-600 leading-relaxed">
              Je hebt nog geen merkkit. Maak er een aan bij <span className="font-medium">Merk</span> in het
              hoofdmenu; je kleuren, lettertypen en logo staan dan hier klaar.
            </p>
          </div>
        ) : (
          <>
            {kits.length > 1 && (
              <Sectie titel="Merkkit">
                <select
                  value={actief ?? ""}
                  onChange={(e) => setActief(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] text-slate-900 bg-white"
                >
                  {kits.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </Sectie>
            )}

            {kit?.logo_url && (
              <Sectie titel="Logo">
                <button
                  type="button"
                  disabled={leeg}
                  onClick={() => plaatsBeeld(kit.logo_url!, `${kit.name}-logo`)}
                  className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-4 disabled:opacity-40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={kit.logo_url} alt="Logo" className="h-16 mx-auto object-contain" />
                  <span className="block text-[12px] text-slate-600 mt-2">In beeld zetten</span>
                </button>
              </Sectie>
            )}

            {kleuren.length > 0 && (
              <Sectie titel="Kleuren">
                <div className="grid grid-cols-4 gap-2">
                  {kleuren.map(([rol, hex]) => (
                    <button
                      key={rol}
                      type="button"
                      onClick={() => kopieer(hex)}
                      title={`${rol}: ${hex}`}
                      className="text-center"
                    >
                      <span
                        className="block aspect-square rounded-lg border border-slate-200"
                        style={{ background: hex }}
                      />
                      <span className="block text-[10px] text-slate-500 mt-1 truncate">{rol}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Klik om de kleurcode te kopiëren.</p>
              </Sectie>
            )}

            {kit?.fonts && (kit.fonts.primary || kit.fonts.secondary) && (
              <Sectie titel="Lettertypen">
                <div className="space-y-1 text-[13px] text-slate-700">
                  {kit.fonts.primary && <p><span className="text-slate-500">Primair:</span> {kit.fonts.primary}</p>}
                  {kit.fonts.secondary && <p><span className="text-slate-500">Secundair:</span> {kit.fonts.secondary}</p>}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                  De editor tekent met lettertypen die ook op de renderserver staan; kies bij Tekst de
                  variant die hier het dichtst bij komt.
                </p>
              </Sectie>
            )}

            {(kit?.reference_images?.length ?? 0) > 0 && (
              <Sectie titel="Merkbeelden">
                <div className="grid grid-cols-3 gap-2">
                  {kit!.reference_images.map((b, i) => (
                    <button
                      key={`${b.url}-${i}`}
                      type="button"
                      disabled={leeg}
                      onClick={() => plaatsBeeld(b.url, b.element ?? b.description ?? "Merkbeeld")}
                      title={b.description}
                      className="rounded-lg bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-1.5 disabled:opacity-40"
                    >
                      <div className="aspect-square overflow-hidden rounded">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.url} alt="" className="w-full h-full object-cover" />
                      </div>
                    </button>
                  ))}
                </div>
              </Sectie>
            )}
          </>
        )}
      </div>
    </div>
  );
}
