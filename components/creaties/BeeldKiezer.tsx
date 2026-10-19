"use client";

import { useRef, useState } from "react";
import type { Creatie } from "@/lib/creaties/types";
import { useCreaties } from "./gebruik-creaties";
import { CREATIES_GEWIJZIGD } from "@/components/app-shell/Zijbalk";

// Een beeld kiezen om mee verder te gaan: een eigen foto uploaden, of iets uit je
// bibliotheek pakken. Gebruikt door het videoscherm en als voorbeeldfoto bij Beeld.

export interface GekozenBeeld {
  id?: string;
  url: string;
  formaat?: string;
}

/** Leest de verhouding van een foto, zodat de tegel in de bibliotheek de goede vorm krijgt. */
function meetFormaat(bestand: File): Promise<string> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const r = img.width / img.height;
      URL.revokeObjectURL(img.src);
      ok(r > 1.25 ? "16:9" : r < 0.8 ? "9:16" : "1:1");
    };
    img.onerror = () => ok("1:1");
    img.src = URL.createObjectURL(bestand);
  });
}

export async function uploadFoto(bestand: File): Promise<Creatie> {
  const form = new FormData();
  form.append("bestand", bestand);
  form.append("formaat", await meetFormaat(bestand));
  const res = await fetch("/api/creaties/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Uploaden mislukt");
  window.dispatchEvent(new Event(CREATIES_GEWIJZIGD));
  return data.creatie;
}

export default function BeeldKiezer({
  waarde,
  onKies,
  leeg = "Kies een beeld",
}: {
  waarde: GekozenBeeld | null;
  onKies: (b: GekozenBeeld | null) => void;
  leeg?: string;
}) {
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [kiezen, setKiezen] = useState(false);

  async function upload(bestand: File | undefined) {
    if (!bestand) return;
    setBezig(true);
    setFout(null);
    try {
      const c = await uploadFoto(bestand);
      onKies({ id: c.id, url: c.url!, formaat: (c.invoer as { formaat?: string }).formaat });
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
      if (invoer.current) invoer.current.value = "";
    }
  }

  return (
    <div>
      {waarde ? (
        <div className="relative rounded-xl overflow-hidden border border-rand bg-paneel-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={waarde.url} alt="" className="w-full max-h-56 object-contain" />
          <button
            onClick={() => onKies(null)}
            className="absolute top-2 right-2 text-xs bg-black/60 text-white px-2 py-1 rounded-lg"
          >
            Ander beeld
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files?.[0]);
          }}
          className="rounded-xl border-2 border-dashed border-rand p-4 text-center space-y-2"
        >
          <p className="text-sm text-tekst-3">{bezig ? "Uploaden…" : leeg}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => invoer.current?.click()} disabled={bezig} className="n-knop2 py-1.5 px-3 text-sm">
              📷 Upload foto
            </button>
            <button onClick={() => setKiezen(true)} disabled={bezig} className="n-knop2 py-1.5 px-3 text-sm">
              📚 Uit bibliotheek
            </button>
          </div>
          <p className="text-[11px] text-tekst-3">of sleep een foto hierheen</p>
        </div>
      )}
      <input
        ref={invoer}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {fout && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{fout}</p>}
      {kiezen && (
        <KiesUitBibliotheek
          onSluit={() => setKiezen(false)}
          onKies={(c) => {
            onKies({ id: c.id, url: c.url!, formaat: (c.invoer as { formaat?: string }).formaat });
            setKiezen(false);
          }}
        />
      )}
    </div>
  );
}

function KiesUitBibliotheek({ onSluit, onKies }: { onSluit: () => void; onKies: (c: Creatie) => void }) {
  const lijst = useCreaties({ soort: "beeld" });
  const klaar = lijst.creaties.filter((c) => c.status === "klaar" && c.url);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onSluit} />
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto n-kaart">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-tekst">Kies een beeld</h2>
          <button onClick={onSluit} className="text-tekst-3 hover:text-tekst" aria-label="Sluiten">✕</button>
        </div>
        {lijst.laden ? (
          <p className="text-sm text-tekst-3">Laden…</p>
        ) : klaar.length === 0 ? (
          <p className="text-sm text-tekst-3">Je bibliotheek heeft nog geen beelden.</p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {klaar.map((c) => (
              <button
                key={c.id}
                onClick={() => onKies(c)}
                className="aspect-square rounded-xl overflow-hidden border border-rand hover:border-blue-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url!} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
