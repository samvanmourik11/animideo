"use client";

// ── Uploads ──────────────────────────────────────────────────────────────────
//
// Eigen beeld, video of geluid erbij. Wat je uploadt blijft in het paneel staan,
// zodat je hetzelfde logo in tien scènes kunt gebruiken zonder het tien keer te
// hoeven uploaden — dat is precies waar Canva's uploads-tab voor is.

import { useRef, useState } from "react";
import { uploadEditorMedia } from "@/lib/editor/media";
import { useEditor, type EditorStore } from "@/lib/editor/store";
import { heeftBeeld, huidigeClipId, nieuwId } from "@/lib/editor/plaatsing";
import type { Clip } from "@/lib/editor/timeline";
import { Melding, PaneelKop, Sectie } from "../ui";

interface Bestand {
  naam: string;
  clip: Clip;
}

export default function UploadsPanel({
  store,
  projectId,
  userId,
  onSluit,
}: {
  store: EditorStore;
  projectId: string;
  userId: string;
  onSluit: () => void;
}) {
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [bestanden, setBestanden] = useState<Bestand[]>([]);
  const doc = useEditor(store, (s) => s.doc);

  async function ontvang(files: FileList | null) {
    if (!files?.length) return;
    setBezig(true);
    setMelding(null);
    try {
      for (const file of Array.from(files)) {
        const clip = await uploadEditorMedia(file, projectId, userId);
        setBestanden((b) => [{ naam: file.name, clip }, ...b]);
      }
      setMelding("Klaar — klik op een bestand om het te gebruiken.");
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "Import mislukt");
    } finally {
      setBezig(false);
      if (invoer.current) invoer.current.value = "";
    }
  }

  /**
   * Video en audio gaan achteraan hun eigen spoor; een afbeelding komt als
   * element over de clip waar je staat. Dat verschil is wat je verwacht: een
   * extra scène versus een logo dat je ergens overheen legt.
   */
  function gebruik(b: Bestand) {
    if (b.clip.type === "image") {
      const clipId = huidigeClipId(store);
      if (!clipId) return setMelding("Zet eerst beeld op de tijdlijn.");
      const id = nieuwId("upload");
      const res = store.dispatch({
        op: "add_element",
        clipId,
        src: b.clip.src,
        label: b.naam,
        elementId: id,
        x: 0.5,
        y: 0.5,
        scale: 0.4,
      });
      if (res.ok) store.select(id);
      setMelding(res.ok ? `${b.naam} toegevoegd` : res.error.message);
      return;
    }
    const nieuw: Clip = { ...b.clip, id: `${b.clip.id}_${Date.now().toString(36)}` };
    const res = store.dispatch({ op: "add_clip", clip: nieuw });
    setMelding(res.ok ? `${b.naam} achteraan gezet` : res.error.message);
  }

  const opTijdlijn = doc.tracks.flatMap((t) => t.clips.map((c) => ({ track: t, clip: c })));

  return (
    <div className="flex flex-col h-full">
      <PaneelKop titel="Uploads" onSluit={onSluit} />

      <div className="px-4 pb-3 shrink-0">
        <button
          type="button"
          onClick={() => invoer.current?.click()}
          disabled={bezig}
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[14px] font-semibold py-3"
        >
          {bezig ? "Bezig met uploaden…" : "Bestanden uploaden"}
        </button>
        <input
          ref={invoer}
          type="file"
          accept="video/*,image/*,audio/*"
          multiple
          className="hidden"
          onChange={(e) => ontvang(e.target.files)}
        />
        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          Video, beeld of geluid. Beeld komt over de scène waar de tijdbalk staat; video en
          geluid gaan achteraan.
        </p>
      </div>

      <Melding tekst={melding} />

      <div className="flex-1 overflow-y-auto pb-6">
        {bestanden.length > 0 && (
          <Sectie titel="Deze sessie">
            <div className="grid grid-cols-3 gap-2">
              {bestanden.map((b, i) => (
                <button
                  key={`${b.clip.id}-${i}`}
                  type="button"
                  onClick={() => gebruik(b)}
                  disabled={b.clip.type === "image" && !heeftBeeld(store)}
                  title={b.naam}
                  className="rounded-lg bg-slate-100 hover:bg-slate-200 border border-transparent hover:border-slate-300 p-1.5 disabled:opacity-40"
                >
                  <div className="aspect-square flex items-center justify-center overflow-hidden rounded">
                    {b.clip.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.clip.src} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-2xl">{b.clip.type === "video" ? "🎬" : "🔊"}</span>
                    )}
                  </div>
                  <span className="block text-[10px] text-slate-600 truncate mt-1">{b.naam}</span>
                </button>
              ))}
            </div>
          </Sectie>
        )}

        <Sectie titel={`Op de tijdlijn (${opTijdlijn.length})`}>
          <div className="space-y-1">
            {opTijdlijn.map(({ track, clip }) => (
              <button
                key={clip.id}
                type="button"
                onClick={() => store.select(clip.id)}
                className="w-full text-left rounded-lg px-3 py-2 hover:bg-slate-50 border border-transparent hover:border-slate-200"
              >
                <span className="block text-[13px] text-slate-800 truncate">
                  {clip.meta?.label ?? (clip.type === "text" ? clip.text : clip.type)}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {track.name} · {clip.duration.toFixed(1)}s
                </span>
              </button>
            ))}
            {opTijdlijn.length === 0 && (
              <p className="text-[13px] text-slate-500">Nog niets op de tijdlijn.</p>
            )}
          </div>
        </Sectie>
      </div>
    </div>
  );
}
