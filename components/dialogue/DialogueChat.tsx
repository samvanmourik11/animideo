"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { planVoorLengte, type DialogueSpec } from "@/lib/infographics/dialogue-schema";
import type { DialogueSetup } from "@/lib/infographics/dialogue-setup";
import { DIALOOG_CREDITS, creditTekst } from "@/lib/infographics/dialoog-credits";

// De lengte bepaalt hoeveel scènes en regels de assistent schrijft, en dus ook wat
// het kost en hoe lang je wacht. Die twee staan er bewust bij: bij vijf minuten
// praat je over tientallen clips, en dat hoor je te weten vóór je begint.
const LENGTES = [
  { sec: 30, label: "30 sec" },
  { sec: 60, label: "1 min" },
  { sec: 120, label: "2 min" },
  { sec: 180, label: "3 min" },
  { sec: 300, label: "5 min" },
];

// Elke clip duurt ongeveer een halve minuut en er lopen er drie tegelijk.
const SEC_PER_CLIP = 35;
const PARALLEL = 3;

// De voordeur van de dialoogmodus: je beschrijft in eigen woorden wat voor video
// je wilt, en de assistent vraagt door tot hij genoeg weet. Zodra dat zo is levert
// hij het complete draaiboek en vult daarmee de rest van de tool.
//
// Bewust een gesprek en geen formulier: bij een formulier moet de gebruiker weten
// wélke velden er zijn en wat ze betekenen. Bij een gesprek hoeft hij alleen te
// weten wat hij wil, en haalt de assistent de rest op.

interface Bericht {
  role: "user" | "assistant";
  content: string;
}

const OPENING =
  "Vertel eens wat voor video je wilt maken. Waar moet het gesprek over gaan, en voor wie is het bedoeld?";

const VOORBEELDEN = [
  "Een verkoper legt aan een sceptische ondernemer uit waarom animatievideo werkt",
  "Twee collega's bespreken hoe onze nieuwe planningstool tijd bespaart",
  "Een klant stelt vragen over onze tarieven en een adviseur beantwoordt ze",
];

export default function DialogueChat({
  onPlan,
  onOpzet,
  heeftPersonages,
  lengte,
  onLengte,
}: {
  onPlan: (spec: DialogueSpec, targetSeconds: number, tone: string) => void;
  /**
   * Is deze meegegeven, dan levert het gesprek eerst een OPZET in plaats van
   * meteen een draaiboek: de assistent vult alle dimensies in als voorstel en de
   * gebruiker stelt bij vóór er een regel geschreven is. Zonder deze stap kon je
   * alleen achteraf corrigeren op een script dat er al omheen geschreven was.
   */
  onOpzet?: (setup: DialogueSetup) => void;
  heeftPersonages: boolean;
  lengte: number;
  onLengte: (sec: number) => void;
}) {
  const [berichten, setBerichten] = useState<Bericht[]>([{ role: "assistant", content: OPENING }]);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const onderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onderRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [berichten, bezig]);

  async function stuur(tekst: string) {
    const schoon = tekst.trim();
    if (!schoon || bezig) return;
    const nieuw: Bericht[] = [...berichten, { role: "user", content: schoon }];
    setBerichten(nieuw);
    setInvoer("");
    setBezig(true);
    setFout(null);

    try {
      const res = await fetch(onOpzet ? "/api/infographics/dialogue-setup" : "/api/infographics/dialogue-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // De openingszin is van ons, niet van het model — die hoeft niet mee.
        body: JSON.stringify(
          onOpzet
            // De opzet-route werkt niet met een gespreksverloop: hij krijgt de
            // beschrijving in één keer en levert een voorstel terug.
            ? { text: nieuw.filter((m) => m.role === "user").map((m) => m.content).join("\n\n"), targetSeconds: lengte }
            : { messages: nieuw.slice(1), targetSeconds: lengte }
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || d.error || "Er ging iets mis");

      setBerichten([...nieuw, { role: "assistant", content: d.reply }]);
      if (d.setup && onOpzet) onOpzet(d.setup as DialogueSetup);
      else if (d.spec) onPlan(d.spec as DialogueSpec, d.targetSeconds ?? 60, d.tone ?? "zakelijk");
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
      // De vraag van de gebruiker laten staan zodat hij hem niet opnieuw hoeft te typen.
      setBerichten(nieuw);
    } finally {
      setBezig(false);
    }
  }

  // Hier stond een blokkade als de bibliotheek leeg was. Dat hoeft niet meer: past
  // er niemand, dan tekent de opzet zelf de personages die het verhaal nodig heeft.
  void heeftPersonages;
  void Link;

  const { regels, scenes } = planVoorLengte(lengte);
  // Zie dialoog-credits.ts: een credit per scène voor het storyboard en een per clip.
  const credits = regels * DIALOOG_CREDITS.CLIP + scenes * DIALOOG_CREDITS.SCENE;
  const minuten = Math.max(1, Math.round(((regels * SEC_PER_CLIP) / PARALLEL + scenes * 12) / 60));

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="border-b border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400 mr-1">Lengte</span>
          {LENGTES.map((l) => (
            <button
              key={l.sec}
              onClick={() => onLengte(l.sec)}
              className={`text-xs rounded-full px-3 py-1 transition ${
                lengte === l.sec ? "bg-orange-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          ≈ {scenes} scènes, {regels} regels · <span className="text-orange-300">{creditTekst(credits)}</span> ·
          {" "}ongeveer {minuten} {minuten === 1 ? "minuut" : "minuten"} genereren
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
        {berichten.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-orange-500 text-white rounded-br-sm"
                  : "bg-slate-800 text-slate-100 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {bezig && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm">
              <span className="inline-flex gap-1">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse [animation-delay:150ms]">●</span>
                <span className="animate-pulse [animation-delay:300ms]">●</span>
              </span>
            </div>
          </div>
        )}
        <div ref={onderRef} />
      </div>

      {/* Voorbeelden alleen bij een leeg gesprek: ze helpen op gang, maar zodra je
          praat zijn ze ruis. */}
      {berichten.length === 1 && !bezig && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {VOORBEELDEN.map((v) => (
            <button
              key={v}
              onClick={() => stuur(v)}
              className="text-[11px] text-slate-400 hover:text-white border border-white/10 hover:border-white/25 rounded-full px-2.5 py-1 transition text-left"
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {fout && <p className="px-4 pb-2 text-xs text-red-400">{fout}</p>}

      <div className="border-t border-white/10 p-3 flex gap-2">
        <textarea
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={(e) => {
            // Enter verstuurt, shift+enter is een nieuwe regel — zoals mensen van
            // chat gewend zijn.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void stuur(invoer);
            }
          }}
          disabled={bezig}
          rows={2}
          placeholder="Beschrijf je video, of plak je tekst en cijfers erbij…"
          className="flex-1 bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 resize-none disabled:opacity-60"
        />
        <button
          onClick={() => void stuur(invoer)}
          disabled={bezig || !invoer.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-4 transition self-stretch"
        >
          {bezig ? "…" : "Stuur"}
        </button>
      </div>
    </div>
  );
}
