"use client";

import CastPicker from "./CastPicker";
import ArtDirection from "./ArtDirection";
import { DEFAULT_STORY_STYLE } from "@/lib/infographics/story-style";
import { opzetKlaar, type DialogueSetup } from "@/lib/infographics/dialogue-setup";

// DE OPZET — alle dimensies van de video op één scherm, vóór er iets geschreven is.
//
// De assistent doet een voorstel voor élk veld; dit scherm laat je dat voorstel
// lezen en bijstellen. Bewust géén blanco formulier: een leeg scherm met twintig
// velden is meer werk dan het tekstvak dat het vervangt, en dan vult niemand het in.
//
// Groepen die je meestal wilt zien (Verhaal, Rolverdeling) staan open; de rest is
// dichtgeklapt met een samenvatting in de rand, zodat je in één blik ziet wat de
// assistent koos zonder alles te hoeven doorlopen.

function Groep({
  titel,
  samenvatting,
  open = false,
  children,
}: {
  titel: string;
  samenvatting?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="bg-white/5 border border-white/10 rounded-xl p-4 group">
      <summary className="text-sm font-medium text-white cursor-pointer list-none flex items-center gap-2">
        <span className="text-slate-500 text-xs group-open:rotate-90 transition-transform">▶</span>
        {titel}
        {samenvatting && <span className="text-[11px] font-normal text-slate-500 truncate">— {samenvatting}</span>}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Veld({
  label,
  uitleg,
  waarde,
  onChange,
  placeholder,
  rows = 2,
  disabled,
}: {
  label: string;
  uitleg?: string;
  waarde: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
      <textarea
        value={waarde}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
      />
      {uitleg && <span className="block text-[10px] text-slate-600 mt-0.5">{uitleg}</span>}
    </label>
  );
}

/** Komma-lijst als tekstveld: makkelijker dan losse chips voor iets wat je zelden vult. */
function Termen({
  label,
  uitleg,
  waarden,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  uitleg: string;
  waarden: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
      <input
        type="text"
        value={waarden.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50"
      />
      <span className="block text-[10px] text-slate-600 mt-0.5">{uitleg}</span>
    </label>
  );
}

const TONEN: { id: string; label: string; uitleg: string }[] = [
  { id: "zakelijk", label: "Zakelijk", uitleg: "helder en to the point" },
  { id: "speels", label: "Speels", uitleg: "luchtig, met een glimlach" },
  { id: "energiek", label: "Energiek", uitleg: "korte zinnen, veel vaart" },
];

export default function SetupPanel({
  setup,
  onChange,
  onGenereer,
  onOpnieuwVoorstellen,
  bezig = false,
  voorstelBezig = false,
  credits,
}: {
  setup: DialogueSetup;
  onChange: (s: DialogueSetup) => void;
  onGenereer: () => void;
  onOpnieuwVoorstellen: () => void;
  bezig?: boolean;
  voorstelBezig?: boolean;
  credits: number;
}) {
  const zet = <K extends keyof DialogueSetup>(veld: K, waarde: DialogueSetup[K]) =>
    onChange({ ...setup, [veld]: waarde });

  const { klaar, reden } = opzetKlaar(setup);
  const uit = bezig || voorstelBezig;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <input
            value={setup.title}
            onChange={(e) => zet("title", e.target.value)}
            disabled={uit}
            className="bg-transparent text-lg font-semibold text-white w-full outline-none focus:bg-slate-900/60 rounded px-1 -ml-1 disabled:opacity-50"
          />
          <p className="text-[11px] text-slate-500 px-1">
            De assistent deed een voorstel. Pas aan wat niet klopt — pas daarna wordt het gesprek geschreven.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpnieuwVoorstellen}
            disabled={uit}
            title="Laat de assistent een nieuw voorstel doen. Wat jij zelf hebt ingevuld bij de rolverdeling blijft staan."
            className="text-xs px-3 py-2 rounded bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 disabled:opacity-40"
          >
            {voorstelBezig ? "Bezig…" : "Ander voorstel"}
          </button>
          <button
            onClick={onGenereer}
            disabled={uit || !klaar}
            title={reden ?? undefined}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition"
          >
            {bezig ? "Schrijven…" : `Schrijf het draaiboek (${credits} credits)`}
          </button>
        </div>
      </div>

      {reden && <p className="text-[11px] text-amber-300">{reden}</p>}

      <Groep titel="Verhaal" open samenvatting={setup.kern || undefined}>
        <Veld
          label="Kernboodschap"
          uitleg="Het ene punt waar het gesprek naartoe werkt. Zonder dit dwaalt het verhaal af."
          waarde={setup.kern}
          onChange={(v) => zet("kern", v)}
          placeholder="bijv. een animatievideo verkoopt beter dan een brochure omdat mensen kijken en niet lezen"
        />
        <Veld
          label="De wending"
          uitleg="Waar het omslaat — het moment dat de twijfelaar omgaat. Zonder wending zijn ze het meteen eens en valt er niets te kijken."
          waarde={setup.wending}
          onChange={(v) => zet("wending", v)}
          placeholder="bijv. als hij hoort dat het binnen een week klaar is"
        />
        <Veld
          label="Invalshoek"
          uitleg="Vanuit welke hoek je het onderwerp benadert. Leeg laten mag."
          waarde={setup.angle}
          onChange={(v) => zet("angle", v)}
          rows={1}
          placeholder="bijv. vanuit de twijfel van de klant"
        />
        <Veld
          label="Bron en onderwerp"
          uitleg="Waar de feiten en cijfers uit komen. De scenarist verzint niets wat hier niet staat."
          waarde={setup.text}
          onChange={(v) => zet("text", v)}
          rows={4}
        />
      </Groep>

      <Groep
        titel="Rolverdeling"
        open
        samenvatting={setup.cast.length ? setup.cast.map((c) => c.name).join(" en ") : "nog niemand gekozen"}
      >
        <p className="text-[11px] text-slate-500">
          Wie jij hier kiest, ligt vast. Vraag je een ander voorstel, dan blijven deze personages en jouw rollen staan.
        </p>
        <CastPicker cast={setup.cast} onChange={(nieuw) => zet("cast", nieuw)} disabled={uit} />
      </Groep>

      <Groep titel="Toon en taal" samenvatting={`${TONEN.find((t) => t.id === setup.tone)?.label ?? "Zakelijk"} · ${setup.language}`}>
        <div>
          <span className="block text-[11px] text-slate-400 mb-1.5">Verteltoon</span>
          <div className="flex flex-wrap gap-1.5">
            {TONEN.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => zet("tone", t.id)}
                disabled={uit}
                title={t.uitleg}
                className={`text-[11px] px-2.5 py-1 rounded-full transition disabled:opacity-40 ${
                  setup.tone === t.id ? "bg-orange-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="block text-[11px] text-slate-400 mb-0.5">Taal van de video</span>
          <input
            type="text"
            value={setup.language}
            onChange={(e) => zet("language", e.target.value)}
            disabled={uit}
            className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white w-48 disabled:opacity-50"
          />
        </label>
        <Termen
          label="Namen die exact zo moeten blijven"
          uitleg="Merk- en productnamen die nooit vertaald of verbasterd mogen worden. Scheid met komma's."
          waarden={setup.keepTerms}
          onChange={(v) => zet("keepTerms", v)}
          placeholder="bijv. JouwAnimatieVideo, Creator Studio"
          disabled={uit}
        />
        <Termen
          label="Namen die nergens mogen vallen"
          uitleg="Concurrenten of herleidbare klantnamen. De scenarist verwijst er hooguit omschrijvend naar."
          waarden={setup.avoidTerms}
          onChange={(v) => zet("avoidTerms", v)}
          placeholder="bijv. naam van een concurrent"
          disabled={uit}
        />
      </Groep>

      <Groep titel="Beeld" samenvatting={setup.format === "9:16" ? "Staand, social" : "Liggend"}>
        <div>
          <span className="block text-[11px] text-slate-400 mb-1.5">Formaat</span>
          <div className="flex gap-1.5">
            {(["16:9", "9:16"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => zet("format", f)}
                disabled={uit}
                className={`text-[11px] px-2.5 py-1 rounded-full transition disabled:opacity-40 ${
                  setup.format === f ? "bg-orange-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {f === "16:9" ? "16:9 liggend" : "9:16 staand"}
              </button>
            ))}
          </div>
        </div>
        <ArtDirection
          styleId={setup.styleId || DEFAULT_STORY_STYLE}
          brief={setup.illustrationBrief}
          onStyle={(id) => zet("styleId", id)}
          onBrief={(t) => zet("illustrationBrief", t)}
          disabled={uit}
        />
      </Groep>
    </div>
  );
}
