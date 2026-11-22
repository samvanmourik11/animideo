"use client";

// Gratis schetsbeelden per scene, vóór de klant betaalt (verbeterplan idee 05). De server
// geeft een pagina met een vaste schetsmotor (public/motion/schets.js, geen AI); deze browser
// tekent per scene één beeld. Verandert het script of de stijl, dan na een tel opnieuw.

import { useEffect, useRef, useState } from "react";
import { openPagina } from "./BrowserVideo";

export interface SchetsInvoer {
  plan: unknown;
  formaat: string;
  stijl: string;
  kleur: string;
  kleur2: string;
  font: string;
  bedrijf: string;
  website: string;
}

export function useSchetsen(invoer: SchetsInvoer | null): { beelden: (string | null)[]; bezig: boolean } {
  const [beelden, setBeelden] = useState<(string | null)[]>([]);
  const [bezig, setBezig] = useState(false);
  const sleutel = invoer ? JSON.stringify(invoer) : "";
  const ronde = useRef(0);

  useEffect(() => {
    if (!sleutel) return;
    const mijn = ++ronde.current;
    const wacht = setTimeout(async () => {
      setBezig(true);
      let pagina: Awaited<ReturnType<typeof openPagina>> | null = null;
      try {
        const res = await fetch("/api/motion/schets", { method: "POST", headers: { "Content-Type": "application/json" }, body: sleutel });
        const r = (await res.json()) as { html?: string; tijden?: number[]; w: number; h: number; error?: string };
        if (!res.ok || !r.html || !r.tijden) throw new Error(r.error ?? "Geen schets");
        pagina = await openPagina(r.html, { w: r.w, h: r.h });
        const doek = document.createElement("canvas");
        const b = r.w >= r.h ? 360 : 200;
        doek.width = b;
        doek.height = Math.round((b * r.h) / r.w);
        const uit: (string | null)[] = [];
        for (const t of r.tijden) {
          if (mijn !== ronde.current) return;
          const bmp = await pagina.beeld(t);
          doek.getContext("2d")?.drawImage(bmp, 0, 0, doek.width, doek.height);
          bmp.close();
          uit.push(doek.toDataURL("image/jpeg", 0.75));
        }
        if (mijn === ronde.current) setBeelden(uit);
      } catch {
        if (mijn === ronde.current) setBeelden([]);
      } finally {
        pagina?.sluit();
        if (mijn === ronde.current) setBezig(false);
      }
    }, 900);
    return () => clearTimeout(wacht);
  }, [sleutel]);

  return { beelden, bezig };
}
