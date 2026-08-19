"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Character } from "@/lib/types";
import { STORY_VOICES, voicePreviewUrl } from "@/lib/infographics/story-voices";
import {
  MAX_CAST,
  type DialogueCastMember,
  type CastPosition,
} from "@/lib/infographics/dialogue-schema";

// De cast komt uit de karakterbibliotheek van de gebruiker. Bewust GEEN tweede
// uploadscherm hier: uploaden, genereren en beheren gebeurt op /characters, zodat
// er één plek is waar een personage vandaan komt en je hem in meerdere video's
// kunt hergebruiken.

const POSITIES: { id: CastPosition; label: string }[] = [
  { id: "left", label: "Links" },
  { id: "right", label: "Rechts" },
  { id: "center", label: "Midden" },
];

export default function CastPicker({
  cast,
  onChange,
  disabled = false,
}: {
  cast: DialogueCastMember[];
  onChange: (cast: DialogueCastMember[]) => void;
  disabled?: boolean;
}) {
  const [bibliotheek, setBibliotheek] = useState<Character[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setBibliotheek(d.characters ?? []);
      })
      .catch((e) => setFout(e instanceof Error ? e.message : String(e)));
  }, []);

  const gekozen = new Set(cast.map((c) => c.characterId));
  const vrijeStem = () => STORY_VOICES.map((v) => v.id).find((id) => !cast.some((c) => c.voice === id)) ?? STORY_VOICES[0].id;
  const vrijePositie = (): CastPosition => {
    const bezet = new Set(cast.map((c) => c.position));
    return (POSITIES.find((p) => !bezet.has(p.id))?.id ?? "center") as CastPosition;
  };

  function voegToe(ch: Character) {
    if (cast.length >= MAX_CAST || !ch.image_url) return;
    onChange([
      ...cast,
      {
        id: `char-${cast.length + 1}`,
        characterId: ch.id,
        name: ch.name,
        role: "",
        voice: vrijeStem(),
        portraitUrl: ch.image_url,
        position: vrijePositie(),
      },
    ]);
  }

  function verwijder(id: string) {
    // Id's opnieuw nummeren zou verwijzingen in een al geschreven draaiboek breken,
    // dus we laten ze staan zoals ze zijn.
    onChange(cast.filter((c) => c.id !== id));
  }

  function wijzig(id: string, velden: Partial<DialogueCastMember>) {
    onChange(cast.map((c) => (c.id === id ? { ...c, ...velden } : c)));
  }

  return (
    <div className="space-y-4">
      {/* Gekozen cast */}
      {cast.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {cast.map((c) => (
            <div key={c.id} className="w-64 rounded-lg border border-white/10 bg-slate-900/60 p-3">
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.portraitUrl} alt={c.name} className="w-16 h-16 rounded-md object-cover border border-white/10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <input
                    value={c.name}
                    onChange={(e) => wijzig(c.id, { name: e.target.value })}
                    disabled={disabled}
                    className="w-full bg-transparent text-sm text-white font-medium border-b border-white/10 focus:border-orange-400 outline-none disabled:opacity-60"
                  />
                  <input
                    value={c.role}
                    onChange={(e) => wijzig(c.id, { role: e.target.value })}
                    disabled={disabled}
                    placeholder="rol, bijv. de expert"
                    className="w-full mt-1 bg-transparent text-[11px] text-slate-400 outline-none placeholder:text-slate-600 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] text-slate-500 mb-0.5">Stem</span>
                  <select
                    value={c.voice}
                    onChange={(e) => wijzig(c.id, { voice: e.target.value })}
                    disabled={disabled}
                    className="w-full bg-slate-800 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white disabled:opacity-60"
                  >
                    {STORY_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label} — {v.description}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] text-slate-500 mb-0.5">Plek in beeld</span>
                  <select
                    value={c.position}
                    onChange={(e) => wijzig(c.id, { position: e.target.value as CastPosition })}
                    disabled={disabled}
                    className="w-full bg-slate-800 border border-white/10 rounded px-1.5 py-1 text-[11px] text-white disabled:opacity-60"
                  >
                    {POSITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-2 flex items-center justify-between">
                {/* Voorbeluisteren kost niets: vooraf gegenereerde mp3 uit /public. */}
                <button
                  onClick={() => new Audio(voicePreviewUrl(c.voice)).play().catch(() => {})}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  ♪ stem beluisteren
                </button>
                {!disabled && (
                  <button onClick={() => verwijder(c.id)} className="text-[11px] text-slate-500 hover:text-red-400">
                    verwijderen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bibliotheek */}
      {!disabled && cast.length < MAX_CAST && (
        <div>
          <div className="text-[11px] text-slate-500 mb-2">
            Kies uit je personages {cast.length > 0 && `(nog ${MAX_CAST - cast.length} mogelijk)`}
          </div>
          {fout && <p className="text-xs text-red-400 mb-2">{fout}</p>}
          {bibliotheek === null && !fout && <p className="text-xs text-slate-500">Laden…</p>}
          {bibliotheek?.length === 0 && (
            <p className="text-xs text-slate-400">
              Je hebt nog geen personages.{" "}
              <Link href="/characters" className="text-orange-300 underline hover:text-orange-200">
                Maak er een aan
              </Link>{" "}
              — je kunt een foto uploaden of er een laten tekenen.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(bibliotheek ?? [])
              .filter((ch) => ch.image_url && !gekozen.has(ch.id))
              .map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => voegToe(ch)}
                  className="w-24 rounded-lg border border-white/10 bg-slate-900/40 p-1.5 hover:border-orange-400/60 transition text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ch.image_url!} alt={ch.name} className="w-full aspect-square rounded object-cover mb-1" />
                  <span className="block text-[10px] text-slate-300 truncate">{ch.name}</span>
                </button>
              ))}
          </div>
          {(bibliotheek?.length ?? 0) > 0 && (
            <Link href="/characters" className="inline-block mt-2 text-[11px] text-slate-500 hover:text-white">
              + nieuw personage maken
            </Link>
          )}
        </div>
      )}

      {cast.length < 2 && (
        <p className="text-[11px] text-amber-300">Kies minstens twee personages — een gesprek heeft twee kanten.</p>
      )}
    </div>
  );
}
