"use client";

import { useRef, useState } from "react";
import { Character } from "@/lib/types";

// Textarea met "/"-autocomplete voor personages én klikbare {…}-tokens. Typ "/"
// (eventueel gevolgd door een naam) → kies een character → het wordt als {Naam}-
// token ingevoegd. Elk {…}-token in de prompt is bovendien aanklikbaar: een
// transparante overlay geeft de tokens een gekleurde, klikbare achtergrond
// (zelfde tekstmetriek als de textarea, dus de regelafbreking blijft kloppen).
// Klikken opent het personage-menu en roept onTokenPick(index, charId) aan — het
// i-de {…}-voorkomen wordt dan herschreven (parent: setTokenCharacter). Bij het
// genereren herkent generate-scene-image die {Naam}-tokens en gebruikt het juiste
// character als referentie (en haalt de accolades weer weg).
export default function PromptEditor({
  value, onChange, characters, disabled = false, rows = 5, className, onTokenPick,
}: {
  value: string;
  onChange: (v: string) => void;
  characters: Character[];
  disabled?: boolean;
  rows?: number;
  className?: string;
  // Een {…}-token op positie `index` (volgorde in de tekst) aan een character
  // koppelen. charId "" = leeg laten (terug naar {selecteer personage} / AI).
  onTokenPick?: (index: number, charId: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [idx, setIdx] = useState(0);
  // Open token-kiezer: welk {…}-voorkomen, en waar (wrapper-relatieve px).
  const [tokenMenu, setTokenMenu] = useState<{ index: number; x: number; y: number } | null>(null);

  const filtered = menu
    ? characters.filter(c => c.name.toLowerCase().includes(menu.query.toLowerCase())).slice(0, 8)
    : [];

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = before.match(/(^|\s)\/([\p{L}\p{N} _-]{0,30})$/u);
    if (m) {
      const query = m[2];
      setMenu({ query, start: caret - (query.length + 1) });
      setIdx(0);
    } else {
      setMenu(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function insert(c: Character) {
    if (!menu) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const token = `{${c.name}} `;
    const next = value.slice(0, menu.start) + token + value.slice(caret);
    onChange(next);
    setMenu(null);
    const pos = menu.start + token.length;
    requestAnimationFrame(() => { ta?.focus(); ta?.setSelectionRange(pos, pos); });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!menu || filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(filtered[idx]); }
    else if (e.key === "Escape") { e.preventDefault(); setMenu(null); }
  }

  // De prompt opdelen in tekst- en {…}-tokensegmenten; tokens krijgen hun
  // volgnummer (zelfde index als promptTokens/setTokenCharacter in de parent).
  function segments(text: string) {
    const out: { text: string; tokenIndex: number | null }[] = [];
    const re = /\{[^}]+\}/g;
    let last = 0, ti = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), tokenIndex: null });
      out.push({ text: m[0], tokenIndex: ti++ });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), tokenIndex: null });
    return out;
  }

  function openToken(e: React.MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const wrap = overlayRef.current?.parentElement;
    const rect = wrap?.getBoundingClientRect();
    setMenu(null);
    setTokenMenu({
      index,
      x: rect ? e.clientX - rect.left : 0,
      y: rect ? e.clientY - rect.top : 0,
    });
  }

  function pickToken(charId: string) {
    if (tokenMenu) onTokenPick?.(tokenMenu.index, charId);
    setTokenMenu(null);
  }

  const segs = segments(value);
  const interactive = !!onTokenPick && !disabled;

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onScroll={() => { if (overlayRef.current && taRef.current) overlayRef.current.scrollTop = taRef.current.scrollTop; }}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        rows={rows}
        disabled={disabled}
        className={`relative z-0 ${className ?? ""}`}
      />
      {/* Transparante overlay: enkel de {…}-tokens krijgen een klikbare achtergrond.
          Zelfde padding/rand/tekstgrootte als de textarea zodat alles uitlijnt. */}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap break-words border border-transparent rounded-md px-2 py-1.5 text-sm leading-5 text-transparent"
      >
        {segs.map((s, i) =>
          s.tokenIndex === null ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span
              key={i}
              onMouseDown={e => e.preventDefault()}
              onClick={interactive ? e => openToken(e, s.tokenIndex!) : undefined}
              title={interactive ? "Klik om een personage te kiezen" : undefined}
              className={`rounded ${interactive ? "pointer-events-auto cursor-pointer" : ""} ${
                s.text.slice(1, -1).trim().toLowerCase() === "selecteer personage"
                  ? "bg-amber-400/25 outline outline-1 outline-amber-300/40"
                  : "bg-cyan-500/30 outline outline-1 outline-cyan-300/40"
              }`}
            >
              {s.text}
            </span>
          )
        )}
      </div>
      {menu && filtered.length > 0 && (
        <div className="absolute z-30 left-2 top-full mt-1 w-64 max-h-52 overflow-auto rounded-lg border border-white/15 bg-slate-900 shadow-xl">
          <div className="px-2 py-1 text-[10px] text-slate-500 border-b border-white/10">Personage invoegen</div>
          {filtered.map((c, i) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={e => { e.preventDefault(); insert(c); }}
              className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs ${i === idx ? "bg-cyan-600/30 text-white" : "text-slate-200 hover:bg-white/5"}`}
            >
              <span className="w-6 h-6 rounded border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                ) : <span>🎭</span>}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {tokenMenu && (
        <>
          {/* Klik buiten = sluiten */}
          <div className="fixed inset-0 z-20" onMouseDown={() => setTokenMenu(null)} />
          <div
            className="absolute z-30 w-60 max-h-60 overflow-auto rounded-lg border border-white/15 bg-slate-900 shadow-xl"
            style={{ left: Math.max(0, tokenMenu.x), top: tokenMenu.y + 6 }}
          >
            <div className="px-2 py-1 text-[10px] text-slate-500 border-b border-white/10">Personage voor deze plek</div>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); pickToken(""); }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
            >
              <span className="w-6 h-6 rounded border border-white/10 bg-slate-950 flex items-center justify-center shrink-0">🎭</span>
              <span className="truncate">Leeg laten (AI kiest)</span>
            </button>
            {characters.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-slate-500">Nog geen personages aangemaakt.</div>
            )}
            {characters.map(c => (
              <button
                type="button"
                key={c.id}
                onMouseDown={e => { e.preventDefault(); pickToken(c.id); }}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-white/5"
              >
                <span className="w-6 h-6 rounded border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center shrink-0">
                  {c.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                  ) : <span>🎭</span>}
                </span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
