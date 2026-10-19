"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Creatie } from "@/lib/creaties/types";
import { CREATIES_GEWIJZIGD } from "@/components/app-shell/Zijbalk";

// Eén lijst creaties met een filter, die vanzelf ververst zolang er iets in de maak is.
// Zowel het maakscherm als de bibliotheek gebruiken hem.

export interface CreatieFilter {
  soort?: string;
  maker?: string;
  recept?: string;
  favoriet?: boolean;
  map?: string;
  zoek?: string;
}

function query(f: CreatieFilter, voor?: string) {
  const p = new URLSearchParams();
  if (f.soort) p.set("soort", f.soort);
  if (f.maker) p.set("maker", f.maker);
  if (f.recept) p.set("recept", f.recept);
  if (f.favoriet) p.set("favoriet", "1");
  if (f.map) p.set("map", f.map);
  if (f.zoek) p.set("zoek", f.zoek);
  if (voor) p.set("voor", voor);
  return p.toString();
}

export function useCreaties(filter: CreatieFilter) {
  const [creaties, setCreaties] = useState<Creatie[]>([]);
  const [laden, setLaden] = useState(true);
  const [meer, setMeer] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const sleutel = query(filter);
  const sleutelRef = useRef(sleutel);
  sleutelRef.current = sleutel;

  const ververs = useCallback(async () => {
    const voorSleutel = sleutelRef.current;
    try {
      const res = await fetch(`/api/creaties?${voorSleutel}`, { cache: "no-store" });
      const data = await res.json();
      if (sleutelRef.current !== voorSleutel) return;
      if (!res.ok) throw new Error(data.error ?? "Laden mislukt");
      setCreaties(data.creaties);
      setMeer(data.meer);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    setLaden(true);
    ververs();
  }, [sleutel, ververs]);

  // Zolang er iets bezig is: elke 4 seconden kijken. De server rondt het dan ook af.
  const ietsBezig = creaties.some((c) => c.status === "bezig");
  useEffect(() => {
    if (!ietsBezig) return;
    const t = setInterval(ververs, 4000);
    return () => clearInterval(t);
  }, [ietsBezig, ververs]);

  useEffect(() => {
    window.addEventListener("creaties:klaar", ververs);
    return () => window.removeEventListener("creaties:klaar", ververs);
  }, [ververs]);

  const laadMeer = useCallback(async () => {
    const laatste = creaties[creaties.length - 1];
    if (!laatste) return;
    const res = await fetch(`/api/creaties?${query(filter, laatste.created_at)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return;
    setCreaties((oud) => [...oud, ...data.creaties]);
    setMeer(data.meer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creaties, sleutel]);

  /** Lokaal bijwerken na een actie, zonder op de server te wachten. */
  const werkBij = useCallback((c: Creatie) => {
    setCreaties((oud) => oud.map((x) => (x.id === c.id ? c : x)));
  }, []);
  const haalWeg = useCallback((id: string) => {
    setCreaties((oud) => oud.filter((x) => x.id !== id));
  }, []);
  const zetVoor = useCallback((c: Creatie) => {
    setCreaties((oud) => [c, ...oud.filter((x) => x.id !== c.id)]);
  }, []);

  return { creaties, laden, meer, fout, ververs, laadMeer, werkBij, haalWeg, zetVoor };
}

/** Start een maker. Gooit met de melding voor op het scherm. */
export async function startMaker(
  maker: string,
  invoer: Record<string, unknown>,
  ouderId?: string | null,
): Promise<Creatie> {
  const res = await fetch("/api/creaties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maker, invoer, ouderId: ouderId ?? null }),
  });
  const data = await res.json().catch(() => ({}));
  window.dispatchEvent(new Event(CREATIES_GEWIJZIGD));
  if (!res.ok) throw new Error(data.error ?? "Starten mislukt");
  return data.creatie as Creatie;
}

export async function zetFavoriet(c: Creatie): Promise<Creatie> {
  const res = await fetch(`/api/creaties/${c.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favoriet: !c.favoriet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
  return data.creatie;
}

export async function zetMap(c: Creatie, mapId: string | null): Promise<Creatie> {
  const res = await fetch(`/api/creaties/${c.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
  return data.creatie;
}

export async function verwijder(c: Creatie): Promise<void> {
  const res = await fetch(`/api/creaties/${c.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Verwijderen mislukt");
}
