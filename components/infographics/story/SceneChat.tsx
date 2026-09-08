"use client";

import { useRef, useState } from "react";
import type { SceneChatMessage } from "@/lib/infographics/story-schema";

// Beeld-chat naast één scene. Vervangt de losse knoppen (briefing, regenereren,
// referentiefoto, "pas iets aan"): je typt gewoon wat er anders moet, hangt er zo
// nodig een foto aan van het échte logo/product, en het beeld verandert mee.
//
// De component is expres "dom": hij toont het verloop en geeft berichten door.
// Wat een bericht betekent (bijwerken, opnieuw tekenen of alleen antwoorden)
// bepaalt de server (/api/infographics/scene-chat).

function dagLabel(at?: number): string | null {
  if (!at) return null;
  const d = new Date(at);
  const vandaag = new Date();
  const zelfdeDag = d.toDateString() === vandaag.toDateString();
  if (zelfdeDag) return null;
  const gisteren = new Date(vandaag.getTime() - 86_400_000);
  if (d.toDateString() === gisteren.toDateString()) return "gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export default function SceneChat({
  messages,
  busy,
  creditLabel,
  gratis = false,
  onSend,
  onRevert,
}: {
  messages: SceneChatMessage[];
  busy: boolean;
  /** Bijv. "1 cr." — komt uit de creditweergave van de pagina. */
  creditLabel: string;
  /** Zelfgetekende scene: wijzigen kost niets, want er komt geen beeldmodel aan te pas. */
  gratis?: boolean;
  onSend: (text: string, file: File | null) => void;
  /** Zet het beeld terug naar hoe het vóór deze beurt was. */
  onRevert: (msg: SceneChatMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  // Bij een zelfgetekende scene heeft een foto meesturen geen betekenis.
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text, file);
    setDraft("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {messages.length > 0 && (
        <div className="max-h-72 overflow-y-auto space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2">
          {messages.map((m, i) => {
            const dag = dagLabel(m.at);
            const vorigeDag = dagLabel(messages[i - 1]?.at);
            return (
              <div key={m.id}>
                {dag && dag !== vorigeDag && (
                  <p className="text-center text-[10px] text-slate-600 py-0.5">{dag}</p>
                )}
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg rounded-br-sm bg-blue-500/20 text-blue-50 px-2 py-1 text-xs">
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {m.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photoUrl} alt="meegestuurde foto" className="mt-1 h-12 w-auto rounded border border-white/20" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-white/5 text-slate-200 px-2 py-1 text-xs">
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      {(m.imageUrl || m.previousLayout) && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-emerald-300/90">✓ beeld bijgewerkt</span>
                          {(m.previousImageUrl || m.previousLayout) && (
                            <button
                              onClick={() => onRevert(m)}
                              disabled={busy}
                              title="Zet het beeld terug naar vóór deze wijziging"
                              className="text-[10px] text-slate-400 hover:text-white underline disabled:opacity-40"
                            >
                              ↩ terug
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {busy && <p className="text-[10px] text-slate-400 pl-1">beeld wordt bijgewerkt…</p>}
        </div>
      )}

      {file && (
        <div className="flex items-center gap-2 text-[10px] text-emerald-300">
          <span className="truncate">📎 {file.name}</span>
          <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-slate-400 hover:text-white">
            verwijderen
          </button>
        </div>
      )}

      <div className="flex items-end gap-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter verstuurt, shift+enter maakt een nieuwe regel.
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          rows={2}
          placeholder={messages.length ? "En nu…?" : "Wat moet er anders aan dit beeld?"}
          className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 resize-none"
        />
        {!gratis && <label
          title="Foto meesturen (echt logo, product of object)"
          className={`shrink-0 cursor-pointer rounded px-2 py-1.5 text-xs ${file ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 hover:bg-white/15 text-slate-300"} ${busy ? "opacity-50 pointer-events-none" : ""}`}
        >
          📎
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>}
        <button
          onClick={send}
          disabled={busy || !draft.trim()}
          title={gratis ? "Aanpassen kost niets" : `Een beeldwijziging kost ${creditLabel}`}
          className="shrink-0 bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 rounded px-2.5 py-1.5 text-xs disabled:opacity-40"
        >
          ↵
        </button>
      </div>
      <p className="text-[10px] text-slate-500">
        {gratis
          ? "Beschrijf wat er anders moet (\u201czet er een huis bij\u201d, \u201cmaak er een vergelijking van\u201d). Deze scene wordt door de app zelf getekend, dus aanpassen kost geen credits."
          : `Beschrijf wat er anders moet ("zet het logo van de foto op de auto"). Een wijziging van het beeld kost ${creditLabel}; een vraag die niet over het beeld gaat is gratis.`}
      </p>
    </div>
  );
}
