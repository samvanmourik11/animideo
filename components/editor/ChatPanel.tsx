"use client";

// Het chatpaneel: zeggen wat je wilt, en het live op de tijdlijn zien gebeuren.
//
// De ops komen één voor één binnen en worden meteen toegepast via dezelfde
// dispatch als een muisklik. Daardoor verschijnt elke stap ook los in de
// geschiedenis en is hij los terug te draaien — dat is precies waar de
// concurrentie volgens het onderzoek op strandt: daar krijg je een black box
// die je achteraf moet repareren.

import { useEffect, useRef, useState } from "react";
import type { EditorStore } from "@/lib/editor/store";
import type { Op } from "@/lib/editor/core/ops";

interface Bericht {
  rol: "user" | "assistent";
  tekst: string;
  /** Wat er bij dit antwoord daadwerkelijk aan de montage veranderde. */
  stappen?: { summary: string; op: Op }[];
  /** Wat er is geweigerd, met de reden — eerlijker dan het stilhouden. */
  geweigerd?: string[];
  /** Waar hij nu mee bezig is (beeld maken, animeren) — dat duurt even. */
  bezigMet?: string;
}

export default function ChatPanel({
  projectId,
  store,
  onClose,
}: {
  projectId: string;
  store: EditorStore;
  onClose: () => void;
}) {
  const [berichten, setBerichten] = useState<Bericht[]>([]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const bodemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bodemRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [berichten, bezig]);

  async function verstuur() {
    const vraag = invoer.trim();
    if (!vraag || bezig) return;
    setInvoer("");
    setBezig(true);

    const historie = berichten.slice(-8).map((b) => ({
      role: b.rol === "user" ? ("user" as const) : ("assistant" as const),
      content: b.tekst,
    }));

    setBerichten((b) => [...b, { rol: "user", tekst: vraag }, { rol: "assistent", tekst: "", stappen: [] }]);

    const werkBij = (fn: (b: Bericht) => Bericht) =>
      setBerichten((lijst) => lijst.map((b, i) => (i === lijst.length - 1 ? fn(b) : b)));

    try {
      const res = await fetch("/api/editor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: vraag,
          history: historie,
          doc: store.getState().doc,
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => "Mislukt"));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const delen = buffer.split("\n\n");
        buffer = delen.pop() ?? "";
        for (const deel of delen) {
          const regel = deel.split("\n").find((l) => l.startsWith("data: "));
          if (!regel) continue;
          let ev: { type?: string; text?: string; op?: Op; summary?: string; reden?: string; message?: string; tekst?: string };
          try { ev = JSON.parse(regel.slice(6)); } catch { continue; }

          if (ev.type === "delta" && ev.text) {
            werkBij((b) => ({ ...b, tekst: b.tekst + ev.text }));
          } else if (ev.type === "op" && ev.op) {
            // Zelfde weg als een muisklik: valideren, toepassen, vastleggen —
            // alleen met "ai" als herkomst, zodat in de geschiedenis zichtbaar
            // blijft wat de monteur deed en wat jij zelf deed.
            const res2 = store.dispatch(ev.op, "ai");
            if (res2.ok) {
              werkBij((b) => ({ ...b, bezigMet: undefined, stappen: [...(b.stappen ?? []), { summary: ev.summary ?? "", op: ev.op! }] }));
            } else {
              werkBij((b) => ({ ...b, geweigerd: [...(b.geweigerd ?? []), res2.error.message] }));
            }
          } else if (ev.type === "bezig" && ev.tekst) {
            werkBij((b) => ({ ...b, bezigMet: ev.tekst }));
          } else if (ev.type === "geweigerd" && ev.reden) {
            werkBij((b) => ({ ...b, geweigerd: [...(b.geweigerd ?? []), ev.reden!] }));
          } else if (ev.type === "error") {
            werkBij((b) => ({ ...b, tekst: b.tekst || (ev.message ?? "Er ging iets mis.") }));
          }
        }
      }
    } catch {
      werkBij((b) => ({ ...b, tekst: b.tekst || "Ik kon je vraag niet verwerken. Probeer het nog eens." }));
    } finally {
      werkBij((b) => ({ ...b, bezigMet: undefined }));
      setBezig(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="text-[15px] font-semibold text-slate-900">Monteur</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
        {berichten.length === 0 ? (
          <div className="text-[13px] text-slate-600 space-y-2 leading-relaxed">
            <p>Zeg wat er moet gebeuren, in gewone taal. Bijvoorbeeld:</p>
            <ul className="space-y-1 text-slate-500">
              <li>· &ldquo;maak de intro twee seconden korter&rdquo;</li>
              <li>· &ldquo;haal de scène weg waarin niemand praat&rdquo;</li>
              <li>· &ldquo;zet de laatste clip vooraan&rdquo;</li>
            </ul>
            <p>Elke stap komt los in de tijdlijn en is los terug te draaien.</p>
          </div>
        ) : (
          berichten.map((b, i) => (
            <div key={i} className={b.rol === "user" ? "text-right" : ""}>
              {b.tekst ? (
                <p
                  className={`inline-block text-[13px] leading-snug rounded-xl px-3 py-2 ${
                    b.rol === "user" ? "bg-blue-100 text-blue-900" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {b.tekst}
                </p>
              ) : null}

              {b.stappen && b.stappen.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {b.stappen.map((s, k) => (
                    <li key={k} className="text-[12px] text-emerald-700 flex gap-1.5">
                      <span aria-hidden>✓</span>
                      <span>{s.summary}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {b.bezigMet ? (
                <p className="mt-1.5 text-[12px] text-slate-500">{b.bezigMet}</p>
              ) : null}

              {b.geweigerd && b.geweigerd.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {b.geweigerd.map((r, k) => (
                    <li key={k} className="text-[12px] text-amber-700">
                      Niet gedaan: {r}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {bezig ? <p className="text-[12px] text-slate-500">Bezig…</p> : null}
        <div ref={bodemRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        <textarea
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void verstuur();
            }
          }}
          rows={2}
          placeholder="Wat moet er gebeuren?"
          className="w-full resize-none rounded-xl bg-slate-100 focus:bg-white border border-transparent focus:border-blue-500 px-3 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void verstuur()}
          disabled={bezig || !invoer.trim()}
          className="mt-2 w-full text-[14px] font-medium py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white"
        >
          {bezig ? "Bezig…" : "Stuur"}
        </button>
      </div>
    </div>
  );
}
