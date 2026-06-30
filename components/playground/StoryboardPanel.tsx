"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaygroundNode, Project, TransitionType } from "@/lib/types";

const VOICES = [
  { value: "Charlotte", label: "Charlotte (warm vrouwelijk)" },
  { value: "Sarah",     label: "Sarah (zacht vrouwelijk)" },
  { value: "Rachel",    label: "Rachel (kalm vrouwelijk)" },
  { value: "Jessica",   label: "Jessica (jeugdig vrouwelijk)" },
  { value: "Lily",      label: "Lily (warm jong vrouwelijk)" },
  { value: "Brian",     label: "Brian (warm mannelijk)" },
  { value: "Daniel",    label: "Daniel (autoritair mannelijk)" },
  { value: "George",    label: "George (Brits mannelijk)" },
  { value: "Liam",      label: "Liam (jong mannelijk)" },
  { value: "Will",      label: "Will (rustig mannelijk)" },
];

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "cut",         label: "Cut (snel)" },
  { value: "fade",        label: "Fade" },
  { value: "dissolve",    label: "Dissolve" },
  { value: "slide-left",  label: "Slide naar links" },
  { value: "slide-right", label: "Slide naar rechts" },
  { value: "zoom-in",     label: "Zoom-in" },
];

export default function StoryboardPanel({
  open,
  onClose,
  project,
  shots,
  onShotChange,
  onShotRemove,
  onReorder,
  onProjectChange,
  onRunRegisseur,
  regisseurBusy,
  musicMoodHint,
  onFinish,
  finishBusy,
  finishError,
  onAnimateShot,
  animatingShots,
  onGenerateVoice,
  voiceBusy,
  voiceError,
  onAutoSync,
  autosyncBusy,
  autosyncMsg,
  autosyncError,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  shots: PlaygroundNode[];
  onShotChange: (
    nodeId: string,
    patch: { voiceover_text?: string | null; duration_sec?: number | null; transition_out?: TransitionType | null }
  ) => Promise<void>;
  onShotRemove: (nodeId: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onProjectChange: (
    patch: { selected_voice?: string | null; bg_music_url?: string | null; outro_text?: string | null }
  ) => Promise<void>;
  onRunRegisseur: () => Promise<void>;
  regisseurBusy: boolean;
  musicMoodHint: string;
  onFinish: () => Promise<void>;
  finishBusy: boolean;
  finishError: string;
  onAnimateShot: (nodeId: string, regenerate?: boolean, motionPrompt?: string) => Promise<void>;
  animatingShots: Set<string>;
  onGenerateVoice: () => Promise<void>;
  voiceBusy: boolean;
  voiceError: string;
  onAutoSync: () => Promise<void>;
  autosyncBusy: boolean;
  autosyncMsg: string;
  autosyncError: string;
}) {
  const orderedShots = useMemo(
    () => [...shots].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [shots]
  );

  const totalDuration = orderedShots.reduce((sum, s) => sum + (s.duration_sec ?? 4), 0);

  const [voice, setVoice] = useState(project.selected_voice ?? "Charlotte");
  const [musicUrl, setMusicUrl] = useState(project.bg_music_url ?? "");
  const [outroText, setOutroText] = useState((project.outro_contact?.tagline as string | undefined) ?? "");

  // Houd lokale state in sync als project van buitenaf verandert (regisseur-voorstel).
  useEffect(() => {
    setVoice(project.selected_voice ?? "Charlotte");
    setMusicUrl(project.bg_music_url ?? "");
    setOutroText((project.outro_contact?.tagline as string | undefined) ?? "");
  }, [project.selected_voice, project.bg_music_url, project.outro_contact]);

  // Eenvoudige HTML5 drag-and-drop reorder.
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Concept-motion-prompts per shot. Wat de gebruiker typt voordat hij op
  // animeer drukt; valt terug op meta.motion_prompt zodat een eerder gebruikte
  // aanwijzing zichtbaar blijft na refresh.
  const [motionDrafts, setMotionDrafts] = useState<Record<string, string>>({});
  function motionDraftFor(shot: PlaygroundNode): string {
    if (shot.id in motionDrafts) return motionDrafts[shot.id];
    const fromMeta = (shot.meta as Record<string, unknown> | null)?.motion_prompt;
    return typeof fromMeta === "string" ? fromMeta : "";
  }

  function onDragStart(id: string) {
    dragId.current = id;
  }
  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragId.current && dragId.current !== id) setDragOverId(id);
  }
  function onDrop(targetId: string) {
    const sourceId = dragId.current;
    dragId.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = orderedShots.map((s) => s.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    onReorder(ids);
  }

  if (!open) return null;

  return (
    <aside className="fixed top-0 right-0 z-40 h-full w-full sm:w-[420px] bg-[#060d1f] border-l border-white/10 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/10">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-white">Video opbouwen</h2>
          <span className="text-xs text-slate-500">{orderedShots.length} shots, ca. {Math.round(totalDuration)}s</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white text-sm"
        >
          Sluiten ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {/* AI-regisseur */}
        <section className="rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">✦</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">AI-regisseur</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Laat de regisseur op basis van je beelden een compleet videoconcept voorstellen: volgorde, voice-over, overgangen, muziek en outro. Bestaande shots worden vervangen.
              </p>
              <button
                type="button"
                onClick={onRunRegisseur}
                disabled={regisseurBusy}
                className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regisseurBusy ? "Regisseur denkt na…" : "Stel een videoconcept voor"}
              </button>
              {musicMoodHint && (
                <p className="text-[11px] text-purple-200/80 mt-2 italic">
                  Voorgestelde muziekstemming: {musicMoodHint}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Shots */}
        <section>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Shots</p>
          {orderedShots.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              Klik op een beeld op het canvas en kies "+ Voeg toe aan video" om hier shots in te zetten.
            </p>
          ) : (
            <ol className="space-y-3">
              {orderedShots.map((shot, idx) => {
                const isAnimating = animatingShots.has(shot.id);
                const hasVideo = !!shot.video_url;
                return (
                  <li
                    key={shot.id}
                    draggable={!isAnimating}
                    onDragStart={() => !isAnimating && onDragStart(shot.id)}
                    onDragOver={(e) => onDragOver(e, shot.id)}
                    onDrop={() => onDrop(shot.id)}
                    onDragEnd={() => setDragOverId(null)}
                    className={`rounded-xl border p-3 bg-white/[0.02] ${
                      dragOverId === shot.id ? "border-blue-400" : "border-white/10"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 relative w-20 h-20">
                        {hasVideo ? (
                          <video
                            src={shot.video_url ?? undefined}
                            className="w-20 h-20 object-cover rounded-lg bg-black"
                            muted
                            loop
                            playsInline
                            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                            onMouseLeave={(e) => {
                              e.currentTarget.pause();
                              e.currentTarget.currentTime = 0;
                            }}
                          />
                        ) : (
                          shot.image_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={shot.image_url}
                              alt=""
                              className="w-20 h-20 object-cover rounded-lg"
                            />
                          )
                        )}
                        <span className="absolute -top-1.5 -left-1.5 text-[10px] bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        {hasVideo && (
                          <span
                            className="absolute -top-1.5 -right-1.5 text-[10px] bg-emerald-600 text-white w-5 h-5 rounded-full flex items-center justify-center font-bold"
                            title="Bewegend"
                          >
                            ▶
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            className="input w-full text-[11px] py-1 px-2"
                            placeholder="Hoe moet het beeld bewegen? (optioneel, bv. langzame zoom-in)"
                            value={motionDraftFor(shot)}
                            onChange={(e) =>
                              setMotionDrafts((prev) => ({ ...prev, [shot.id]: e.target.value }))
                            }
                            disabled={isAnimating}
                          />
                          <div className="flex items-center gap-2">
                            {isAnimating ? (
                              <span className="text-[11px] text-purple-300 flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                                Animeren…
                              </span>
                            ) : hasVideo ? (
                              <button
                                type="button"
                                onClick={() => onAnimateShot(shot.id, true, motionDraftFor(shot))}
                                className="text-[11px] font-medium px-2 py-1 rounded-md border border-purple-500/30 text-purple-200 hover:bg-purple-500/[0.08]"
                                title="Genereer opnieuw met bovenstaande aanwijzing"
                              >
                                ↻ Opnieuw animeren
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onAnimateShot(shot.id, false, motionDraftFor(shot))}
                                className="text-[11px] font-medium px-2 py-1 rounded-md bg-purple-600/80 hover:bg-purple-500 text-white"
                              >
                                ✦ Maak bewegend
                              </button>
                            )}
                            {!isAnimating && !hasVideo && (
                              <span className="text-[10px] text-amber-300/80">10 credits</span>
                            )}
                          </div>
                        </div>
                        <textarea
                          className="input w-full text-xs min-h-[44px] resize-none py-1.5"
                          placeholder="Voice-over voor dit shot…"
                          value={shot.voiceover_text ?? ""}
                          onChange={(e) => onShotChange(shot.id, { voiceover_text: e.target.value })}
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500 shrink-0">Duur</label>
                          <input
                            type="range"
                            min={1}
                            max={15}
                            step={1}
                            value={shot.duration_sec ?? 4}
                            onChange={(e) => onShotChange(shot.id, { duration_sec: Number(e.target.value) })}
                            className="flex-1"
                          />
                          <span className="text-[11px] text-slate-400 w-8 text-right">{shot.duration_sec ?? 4}s</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-500 shrink-0">Overgang</label>
                          <select
                            className="input text-[11px] py-1 px-2 flex-1"
                            value={shot.transition_out ?? "cut"}
                            onChange={(e) => onShotChange(shot.id, { transition_out: e.target.value as TransitionType })}
                          >
                            {TRANSITIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => onShotRemove(shot.id)}
                          className="text-[11px] text-slate-500 hover:text-red-300"
                        >
                          Uit video halen
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Stem + voice-over generatie */}
        <section className="space-y-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Voice-over
          </label>
          <select
            className="input w-full text-sm"
            value={voice}
            onChange={(e) => {
              setVoice(e.target.value);
              onProjectChange({ selected_voice: e.target.value });
            }}
          >
            {VOICES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>

          {project.voice_audio_url && (
            <audio
              key={project.voice_audio_url}
              src={project.voice_audio_url}
              controls
              className="w-full h-9 mt-1"
            />
          )}

          <button
            type="button"
            onClick={onGenerateVoice}
            disabled={voiceBusy || orderedShots.length === 0}
            className="text-xs font-medium w-full px-3 py-1.5 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {voiceBusy
              ? "Voice-over genereren…"
              : project.voice_audio_url
              ? "↻ Voice-over opnieuw genereren"
              : "✦ Genereer voice-over"}
          </button>
          {voiceError && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1">
              {voiceError}
            </p>
          )}
          <p className="text-[10px] text-slate-600">
            Gebruikt de tekst die per shot is ingevuld. 1 credit.
          </p>

          <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1.5">
            <button
              type="button"
              onClick={onAutoSync}
              disabled={autosyncBusy || !project.voice_audio_url || orderedShots.length === 0}
              className="text-xs font-medium w-full px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-200 hover:bg-purple-500/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={!project.voice_audio_url ? "Genereer eerst de voice-over" : ""}
            >
              {autosyncBusy ? "Synct duren…" : "⇆ Autosync beeld op voice-over"}
            </button>
            {autosyncError && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1">
                {autosyncError}
              </p>
            )}
            {autosyncMsg && !autosyncError && (
              <p className="text-emerald-300/90 text-[11px] bg-emerald-500/[0.08] border border-emerald-500/20 rounded-lg px-2.5 py-1">
                {autosyncMsg}
              </p>
            )}
            <p className="text-[10px] text-slate-600">
              Whisper bepaalt waar elke shot-tekst in de audio valt en past de duur per beeld daarop aan.
            </p>
          </div>
        </section>

        {/* Muziek */}
        <section>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
            Achtergrondmuziek (URL)
          </label>
          <input
            type="url"
            className="input w-full text-sm"
            placeholder="https://…"
            value={musicUrl}
            onChange={(e) => setMusicUrl(e.target.value)}
            onBlur={() => onProjectChange({ bg_music_url: musicUrl || null })}
          />
          <p className="text-[11px] text-slate-600 mt-1">
            Optioneel. Laat leeg voor stilte onder de voice-over.
          </p>
        </section>

        {/* Outro-tekst */}
        <section>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
            Outro-tekst
          </label>
          <textarea
            className="input w-full text-sm min-h-[60px] resize-none"
            placeholder="Korte afsluitende tekst, bv. Vraag je vrijblijvend offerte aan op jouwbedrijf.nl"
            value={outroText}
            onChange={(e) => setOutroText(e.target.value)}
            onBlur={() => onProjectChange({ outro_text: outroText })}
            rows={2}
          />
        </section>
      </div>

      <div className="shrink-0 border-t border-white/10 px-4 py-3 bg-[#060d1f] space-y-2">
        {finishError && (
          <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            {finishError}
          </p>
        )}
        {(() => {
          const stillImages = orderedShots.filter((s) => !s.video_url).length;
          return (
            stillImages > 0 && (
              <p className="text-[11px] text-amber-300/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-2.5 py-1">
                {stillImages} {stillImages === 1 ? "shot is" : "shots zijn"} nog niet bewegend. In de editor verschijnen die als zwart beeld.
              </p>
            )
          );
        })()}
        <button
          type="button"
          onClick={onFinish}
          disabled={finishBusy || orderedShots.length === 0}
          className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={orderedShots.length === 0 ? "Voeg eerst minstens één shot toe" : ""}
        >
          {finishBusy ? "Bezig…" : "Naar de editor →"}
        </button>
        <p className="text-[11px] text-slate-600 text-center">
          In de editor zet je timeline, achtergrondmuziek en exporteer je naar MP4.
        </p>
      </div>
    </aside>
  );
}
