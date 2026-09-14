"use client";

import CastPicker from "./CastPicker";
import ArtDirection from "./ArtDirection";
import VasteVoorwerpen from "./VasteVoorwerpen";
import { DEFAULT_STORY_STYLE } from "@/lib/infographics/story-style";
import { opzetKlaar, type DialogueSetup } from "@/lib/infographics/dialogue-setup";
import { MAX_PER_SCENE, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import {
  FASE_INFO, MAX_DELEN, SECONDEN_PER_MOMENT, passendeLengte, verhaalProblemen,
  type VerhaalDeel, type VerhaalModus,
} from "@/lib/infographics/verhaallijn";

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

/**
 * De verhaallijn: vijf delen onder elkaar, elk met wat er gebeurt, waar en wie.
 *
 * Staat bewust bovenaan de opzet. In de kerstvideo was het verhaal het zwakste
 * punt van alles, en dat zag je pas in de video. Hier lees je het in een halve
 * minuut en zie je meteen of de oplossing te vroeg komt of iemand nooit meespeelt.
 */
// Dezelfde lengtes als bij het idee. Hier nog een keer, omdat je pas in de opzet
// ziet hoeveel momenten je verhaal heeft — en dus of de gekozen lengte past.
const LENGTES = [30, 60, 120, 180, 300] as const;
const lengteLabel = (s: number) => (s < 60 ? `${s} sec` : `${s / 60} min`);

function Verhaallijn({
  lijn,
  cast,
  modus,
  bron,
  lengte,
  onChange,
  onLengte,
  onWissel,
  disabled,
}: {
  lijn: VerhaalDeel[];
  cast: DialogueCastMember[];
  modus: VerhaalModus;
  bron: string;
  lengte: number;
  onChange: (lijn: VerhaalDeel[]) => void;
  onLengte: (seconden: number) => void;
  /** Een nieuw voorstel in de andere modus. */
  onWissel: (modus: VerhaalModus) => void;
  disabled?: boolean;
}) {
  const volg = modus === "volgen";
  const problemen = verhaalProblemen(lijn, cast, volg ? bron : null);
  const zetDeel = (i: number, velden: Partial<VerhaalDeel>) =>
    onChange(lijn.map((d, j) => (j === i ? { ...d, ...velden } : d)));
  const verwijder = (i: number) => onChange(lijn.filter((_, j) => j !== i));
  const voegToe = (na: number) => {
    const nieuw = [...lijn];
    nieuw.splice(na + 1, 0, { fase: null, titel: "", wat: "", plek: lijn[na]?.plek ?? "", wie: lijn[na]?.wie ?? [], verteller: "" });
    onChange(nieuw);
  };
  // Dertien momenten in één minuut is vijf seconden per plek: dat flitst voorbij.
  // Niet stilletjes ophogen — een langere video kost meer — maar het laten zien.
  const teKort = lijn.length > 0 && lengte < lijn.length * SECONDEN_PER_MOMENT;
  const passend = passendeLengte(lijn.length, LENGTES);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
        <p className="text-[11px] text-slate-300 min-w-0">
          {volg
            ? "Je gaf een uitgewerkt verhaal. De assistent volgt het moment voor moment en verzint er niets bij."
            : "Je gaf een idee. De assistent bedacht er een verhaal omheen, met een begin, een probleem, een tegenslag en een omslag."}
        </p>
        <button
          type="button"
          onClick={() => onWissel(volg ? "verzinnen" : "volgen")}
          disabled={disabled}
          className="text-[11px] text-orange-300 hover:text-orange-200 underline disabled:opacity-40"
        >
          {volg ? "Liever er een nieuw verhaal van laten maken" : "Volg liever precies mijn tekst"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-400 mr-1">Lengte</span>
        {LENGTES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onLengte(s)}
            disabled={disabled}
            className={`text-[11px] px-2.5 py-1 rounded-full transition disabled:opacity-40 ${
              lengte === s ? "bg-orange-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {lengteLabel(s)}
          </button>
        ))}
      </div>
      {teKort && (
        <p className="text-[11px] text-amber-300">
          ⚠ Je verhaal heeft {lijn.length} momenten. In {lengteLabel(lengte)} krijgt elk moment maar zo&apos;n{" "}
          {Math.max(1, Math.round(lengte / lijn.length))} seconden.{" "}
          {passend > lengte && (
            <button type="button" onClick={() => onLengte(passend)} disabled={disabled} className="underline hover:text-amber-200">
              Maak er {lengteLabel(passend)} van
            </button>
          )}
        </p>
      )}

      {lijn.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          Deze opzet heeft nog geen verhaallijn. Klik op “Ander voorstel” om er een te laten maken.
        </p>
      ) : (
      <>
      {problemen.length > 0 && (
        <ul className="text-[11px] text-amber-300 space-y-0.5">
          {problemen.map((p) => <li key={p}>⚠ {p}</li>)}
        </ul>
      )}
      <ol className="space-y-2">
        {lijn.map((d, i) => (
          <li key={d.fase ?? `moment-${i}`} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-300">
                {i + 1}.{d.fase ? ` ${FASE_INFO[d.fase].label}` : ""}
              </span>
              {d.fase ? (
                <span className="text-[10px] text-slate-500">{FASE_INFO[d.fase].uitleg}</span>
              ) : (
                <>
                  <input
                    value={d.titel}
                    onChange={(e) => zetDeel(i, { titel: e.target.value })}
                    disabled={disabled}
                    placeholder="naam van dit moment"
                    className="flex-1 min-w-0 bg-transparent text-[11px] font-semibold uppercase tracking-wide text-orange-300 placeholder:normal-case placeholder:font-normal placeholder:text-slate-600 outline-none focus:bg-slate-900/60 rounded px-1 disabled:opacity-50"
                  />
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => voegToe(i)}
                      disabled={disabled || lijn.length >= MAX_DELEN}
                      title="Moment eronder toevoegen"
                      className="text-xs text-slate-500 hover:text-emerald-400 disabled:opacity-30"
                    >+</button>
                    <button
                      type="button"
                      onClick={() => verwijder(i)}
                      disabled={disabled || lijn.length <= 1}
                      title="Moment verwijderen"
                      className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-30"
                    >✕</button>
                  </span>
                </>
              )}
            </div>
            <textarea
              value={d.wat}
              onChange={(e) => zetDeel(i, { wat: e.target.value })}
              disabled={disabled}
              rows={2}
              placeholder="Wat gebeurt er in dit deel?"
              className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-600 disabled:opacity-50 resize-y"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                value={d.plek}
                onChange={(e) => zetDeel(i, { plek: e.target.value })}
                disabled={disabled}
                placeholder="waar"
                className="w-full sm:w-56 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-slate-600 disabled:opacity-50"
              />
              {/* Wie er in beeld is. Meer dan drie past niet in één beeld. */}
              <div className="flex flex-wrap gap-1">
                {cast.map((c) => {
                  const aan = d.wie.includes(c.characterId);
                  const vol = !aan && d.wie.length >= MAX_PER_SCENE;
                  return (
                    <button
                      key={c.characterId}
                      type="button"
                      onClick={() =>
                        zetDeel(i, { wie: aan ? d.wie.filter((x) => x !== c.characterId) : [...d.wie, c.characterId] })
                      }
                      disabled={disabled || vol}
                      title={vol ? `Hooguit ${MAX_PER_SCENE} personages tegelijk in beeld` : undefined}
                      className={`text-[11px] px-2 py-0.5 rounded-full transition disabled:opacity-40 ${
                        aan ? "bg-orange-500 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              value={d.verteller}
              onChange={(e) => zetDeel(i, { verteller: e.target.value })}
              disabled={disabled}
              placeholder="🎙 vertellerzin die dit deel opent (mag leeg)"
              className="mt-1.5 w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs italic text-violet-200 placeholder:not-italic placeholder:text-slate-600 disabled:opacity-50"
            />
            {/* De zinnen die de gebruiker zelf schreef. Die komen er letterlijk in,
                bij deze persoon. Wegklikken = de scenarist mag hem zelf verwoorden. */}
            {(d.citaten ?? []).length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {(d.citaten ?? []).map((c, k) => (
                  <li key={k} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                    <span className="shrink-0 text-slate-500">💬 letterlijk</span>
                    <span className="shrink-0 text-orange-300">{cast.find((p) => p.characterId === c.wie)?.name ?? "?"}:</span>
                    <span className="min-w-0 italic">“{c.tekst}”</span>
                    <button
                      type="button"
                      onClick={() => zetDeel(i, { citaten: (d.citaten ?? []).filter((_, x) => x !== k) })}
                      disabled={disabled}
                      title="Deze zin niet letterlijk overnemen"
                      className="ml-auto shrink-0 text-slate-600 hover:text-red-400 disabled:opacity-30"
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      </>
      )}
    </div>
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
  onTekenVoorwerpen,
  voorwerpTekenBezig = [],
}: {
  setup: DialogueSetup;
  onChange: (s: DialogueSetup) => void;
  onGenereer: () => void;
  /** Een nieuw voorstel; met een modus erbij in die modus (volgen of verzinnen). */
  onOpnieuwVoorstellen: (modus?: VerhaalModus) => void;
  bezig?: boolean;
  voorstelBezig?: boolean;
  credits: number;
  /** Voorwerpen (indexen) nu tekenen, zodat je ze in de opzet al ziet. */
  onTekenVoorwerpen?: (indices: number[]) => void;
  voorwerpTekenBezig?: string[];
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
            {setup.modus === "volgen"
              ? "De assistent knipte je verhaal op in momenten en koos wie erin speelt. Pas aan wat niet klopt — pas daarna worden de scènes geschreven."
              : "De assistent bedacht een verhaal en wie erin speelt. Pas aan wat niet klopt — pas daarna worden de scènes geschreven."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpnieuwVoorstellen()}
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

      <Groep
        titel="Verhaallijn"
        open
        samenvatting={
          (setup.verhaallijn ?? []).length === 0
            ? "nog geen verhaallijn"
            : (() => {
                const volg = setup.modus === "volgen";
                const n = verhaalProblemen(setup.verhaallijn, setup.cast, volg ? setup.text : null).length;
                if (n) return `${n} ${n === 1 ? "aandachtspunt" : "aandachtspunten"}`;
                return volg ? `je eigen verhaal, ${(setup.verhaallijn ?? []).length} momenten` : "begin, probleem, tegenslag, omslag, slot";
              })()
        }
      >
        <Verhaallijn
          lijn={setup.verhaallijn ?? []}
          cast={setup.cast}
          modus={setup.modus ?? "verzinnen"}
          bron={setup.text}
          lengte={setup.targetSeconds}
          onChange={(lijn) => zet("verhaallijn", lijn)}
          onLengte={(s) => zet("targetSeconds", s)}
          onWissel={(modus) => onOpnieuwVoorstellen(modus)}
          disabled={uit}
        />
      </Groep>

      <Groep titel="Kern en bron" open samenvatting={setup.kern || undefined}>
        <Veld
          label="Waar het onderhuids over gaat"
          uitleg="Wat iemand mist, hoopt of niet durft. Elke scène heeft hier iets mee te maken."
          waarde={setup.kern}
          onChange={(v) => zet("kern", v)}
          placeholder="bijv. Tyrrell wil niemand teleurstellen en zegt daarom tegen niemand wat hij zelf wil"
        />
        <Veld
          label="De wending"
          uitleg="Wat er anders loopt dan verwacht. Zonder wending zijn ze het meteen eens en valt er niets te kijken."
          waarde={setup.wending}
          onChange={(v) => zet("wending", v)}
          placeholder="bijv. papa blijkt zelf ook niet alleen te willen zijn met kerst"
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

      {/* Het aantal voorwerpen staat in de rand: dichtgeklapt zag niemand dat de lijst
          leeg was, ook niet bij een verhaal over een bloem en een grote boom. */}
      <Groep
        titel="Beeld en voorwerpen"
        samenvatting={[
          setup.format === "9:16" ? "Staand, social" : "Liggend",
          setup.voorwerpen?.length
            ? `${setup.voorwerpen.length} ${setup.voorwerpen.length === 1 ? "voorwerp" : "voorwerpen"}`
            : "nog geen voorwerpen",
        ].join(" · ")}
      >
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
        <VasteVoorwerpen
          voorwerpen={setup.voorwerpen ?? []}
          onChange={(v) => zet("voorwerpen", v)}
          styleId={setup.styleId}
          onTeken={onTekenVoorwerpen}
          tekenBezig={voorwerpTekenBezig}
          disabled={uit}
        />
      </Groep>
    </div>
  );
}
