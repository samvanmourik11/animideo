"use client";

import { useRef, useState } from "react";

// De procesvideo bovenaan: speelt stil en herhalend af (zoals bezoekers uit een advertentie
// gewend zijn), met een duidelijke knop om met geluid opnieuw te beginnen. De voice-over legt
// het proces uit; zonder geluid vertellen de ondertitels in de video het verhaal.
export function ProcesVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [geluid, setGeluid] = useState(false);
  const [fout, setFout] = useState(false);

  function metGeluid() {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    v.loop = false;
    v.controls = true;
    void v.play();
    setGeluid(true);
  }

  return (
    <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-[#0b1430] shadow-[0_30px_80px_-20px_rgba(37,99,235,0.45)] ring-1 ring-white/10 aspect-video">
      {fout ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="w-full h-full object-cover" />
      ) : (
        <video
          ref={ref}
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setFout(true)}
          className="w-full h-full object-cover"
        />
      )}
      {!geluid && !fout && (
        <button
          onClick={metGeluid}
          className="absolute inset-0 flex items-end sm:items-center justify-center p-4 group"
          aria-label="Bekijk de video met geluid"
        >
          <span className="flex items-center gap-3 rounded-full bg-white/95 text-slate-900 pl-2 pr-5 py-2 shadow-xl transition group-hover:scale-105">
            <span className="grid place-items-center h-10 w-10 rounded-full bg-blue-600 text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="text-sm font-semibold">Bekijk hoe het werkt <span className="text-slate-500 font-normal">· met geluid</span></span>
          </span>
        </button>
      )}
    </div>
  );
}

/** Kort stil fragment dat herhaalt, voor de stappen. Laadt pas als het in beeld komt. */
export function Lus({ src, className = "" }: { src: string; className?: string }) {
  return <video src={src} autoPlay muted loop playsInline preload="none" className={className} />;
}

/** Een voorbeeld uit de app: stil met een klik voor geluid. */
export function Voorbeeld({ src, titel, staand }: { src: string; titel: string; staand: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [aan, setAan] = useState(false);
  return (
    <figure className="group">
      <div className={`relative overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-200 ${staand ? "aspect-[9/16]" : "aspect-video"}`}>
        <video ref={ref} src={`${src}#t=0.5`} muted={!aan} loop playsInline preload="metadata" controls={aan} className="w-full h-full object-cover" />
        {!aan && (
          <button
            onClick={() => { setAan(true); const v = ref.current; if (v) { v.muted = false; v.currentTime = 0; void v.play(); } }}
            className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-transparent to-transparent"
            aria-label={`Speel ${titel}`}
          >
            <span className="grid place-items-center h-14 w-14 rounded-full bg-white/95 text-blue-600 shadow-lg transition group-hover:scale-110">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 text-sm text-slate-600">{titel}</figcaption>
    </figure>
  );
}

/** Vragen die openklappen. */
export function Vragen({ vragen }: { vragen: { v: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {vragen.map((q, i) => (
        <div key={q.v}>
          <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-4 text-left px-5 py-4">
            <span className="font-semibold text-slate-900">{q.v}</span>
            <span className={`shrink-0 text-blue-600 text-xl leading-none transition ${open === i ? "rotate-45" : ""}`}>+</span>
          </button>
          {open === i && <p className="px-5 pb-5 -mt-1 text-slate-600 leading-relaxed">{q.a}</p>}
        </div>
      ))}
    </div>
  );
}
