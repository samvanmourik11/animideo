"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DialogueChat from "@/components/dialogue/DialogueChat";
import DialogueBuddy from "@/components/dialogue/DialogueBuddy";
import CastPicker from "@/components/dialogue/CastPicker";
import ScriptBoard, { schatCredits } from "@/components/dialogue/ScriptBoard";
import DialoguePlayer, { bouwFragmenten } from "@/components/dialogue/DialoguePlayer";
import FragmentEditor, { type HerstelActie } from "@/components/dialogue/FragmentEditor";
import ArtDirection from "@/components/dialogue/ArtDirection";
import { DEFAULT_STORY_STYLE, STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import { regelKlaar, kaleSetting, VIDEO_STANDAARD_SEC, type DialogueSpec } from "@/lib/infographics/dialogue-schema";
import { MusicPickerButton } from "@/components/music/MusicPicker";
import { findMusicTrackByUrl } from "@/lib/music/library";

// Dialoogmodus: twee of drie personages die tegenover elkaar een gesprek voeren.
// Per gesproken zin is er één clip waarin die ene praat en de ander zichtbaar
// luistert.
//
// De voordeur is een GESPREK, geen formulier. Je beschrijft wat je wilt, de
// assistent vraagt door en levert een compleet draaiboek — inclusief cast uit je
// eigen bibliotheek, tekenstijl en beeldregie. Daarna is alles nog van jou: het
// draaiboek staat bewust vóór het genereren, want elke regel is een clip die geld
// kost. Je schaaft eerst en betaalt pas daarna.

// Elke clip duurt bij Seedance ongeveer een halve minuut; drie tegelijk houdt de
// wachttijd binnen de perken zonder de rate limits te raken.
const PARALLEL = 3;

type Stap = 1 | 2 | 3;

export default function DialoguePage() {
  const [spec, setSpec] = useState<DialogueSpec | null>(null);
  const [stap, setStap] = useState<Stap>(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLaden, setProjectLaden] = useState(false);
  const [heeftPersonages, setHeeftPersonages] = useState<boolean | null>(null);
  const [lengte, setLengte] = useState(VIDEO_STANDAARD_SEC);
  const [fout, setFout] = useState<string | null>(null);

  const [renderBezig, setRenderBezig] = useState(false);
  const [renderFout, setRenderFout] = useState<string | null>(null);
  const [voortgang, setVoortgang] = useState("");
  const [exportBezig, setExportBezig] = useState(false);
  const [exportFout, setExportFout] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  // Welke regel op dit moment gericht opnieuw gemaakt wordt ("si-li").
  const [herstelBezig, setHerstelBezig] = useState<string | null>(null);

  const creditFout = (d: { error?: string; required?: number; credits?: number; detail?: string }) =>
    d.error === "insufficient_credits"
      ? `Te weinig credits (nodig: ${d.required}, saldo: ${d.credits})`
      : (d.detail || d.error || "Mislukt");

  // Of de gebruiker überhaupt personages heeft bepaalt of de assistent iets kan
  // kiezen; zonder cast heeft doorpraten geen zin.
  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => setHeeftPersonages(((d.characters ?? []) as { image_url?: string }[]).some((c) => c.image_url)))
      .catch(() => setHeeftPersonages(true));
  }, []);

  // ---------- Bewaren ----------
  // Slot: voorkomt dat twee gelijktijdige autosaves elk een eigen project aanmaken.
  const bewaartRef = useRef(false);
  const bewaar = useCallback(async (teBewaren: DialogueSpec, id: string | null): Promise<string | null> => {
    if (bewaartRef.current) return id;
    bewaartRef.current = true;
    try {
      const res = await fetch("/api/infographics/save-dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, title: teBewaren.title, spec: teBewaren }),
      });
      const d = await res.json();
      if (!res.ok) { setFout(d.detail || d.error || "Opslaan mislukt"); return id; }
      if (d.id && d.id !== id) {
        setProjectId(d.id);
        window.history.replaceState(null, "", `?project=${d.id}`);
        return d.id as string;
      }
      return id;
    } catch {
      return id;
    } finally {
      bewaartRef.current = false;
    }
  }, []);

  // Zodra er een draaiboek is, hoort het bij een project. Iemand die zijn script
  // heeft zitten schaven mag dat niet kwijtraken aan een gesloten tabblad.
  useEffect(() => {
    if (!spec || projectLaden) return;
    const t = setTimeout(() => { void bewaar(spec, projectId); }, 1200);
    return () => clearTimeout(t);
  }, [spec, projectId, projectLaden, bewaar]);

  // ---------- Laden ----------
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    setProjectLaden(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("projects")
          .select("story_spec")
          .eq("id", id)
          .eq("mode", "dialogue")
          .single();
        if (error || !data?.story_spec) throw new Error(error?.message ?? "Dialoog niet gevonden");
        const geladen = data.story_spec as DialogueSpec;
        setSpec(geladen);
        if (geladen.targetSeconds) setLengte(geladen.targetSeconds);
        setProjectId(id);
        setStap(2);
      } catch (e) {
        setFout(e instanceof Error ? e.message : String(e));
      } finally {
        setProjectLaden(false);
      }
    })();
  }, []);

  // ---------- De assistent levert een plan ----------
  function ontvangPlan(nieuw: DialogueSpec, secs: number, _toon: string) {
    // Al gerenderde clips gaan verloren bij een nieuw draaiboek. Dat mag niet
    // stilzwijgend gebeuren — daar is voor betaald.
    const gerenderd = spec?.scenes.flatMap((s) => s.lines).filter(regelKlaar).length ?? 0;
    if (gerenderd > 0 && !window.confirm(`Er ${gerenderd === 1 ? "staat 1 clip" : `staan ${gerenderd} clips`} klaar. Een nieuw draaiboek vervangt die. Doorgaan?`)) {
      return;
    }
    setSpec(nieuw);
    setLengte(secs);
    setExportUrl(null);
    setStap(2);
  }

  // ---------- Video maken ----------
  async function maakVideo() {
    if (!spec) return;
    setRenderBezig(true); setRenderFout(null); setExportUrl(null); setStap(3);

    const werk: DialogueSpec = structuredClone(spec);
    let gestopt: string | null = null;
    const mislukt: string[] = [];

    // Eerst per scène het twee-shot: elke regel is straks een bewerking daarvan.
    // BEWUST één voor één en niet parallel: het eerste twee-shot is het anker voor
    // alle volgende, zodat de personages tussen scènes niet veranderen.
    const zonderShot = werk.scenes.map((s, si) => ({ s, si })).filter(({ s }) => !s.twoShotUrl);
    if (zonderShot.length) {
      let klaar = 0;
      setVoortgang(`Scènes opzetten (0/${zonderShot.length})…`);
      for (const { s, si } of zonderShot) {
        // Speelt deze scène op een plek die we al getekend hebben, neem dan dát
        // beeld over in plaats van de omgeving opnieuw te laten verzinnen. Oma's
        // woonkamer kwam in één verhaal drie keer terug en zag er drie keer anders
        // uit; nu is het letterlijk dezelfde kamer. Scheelt bovendien een credit.
        const zelfdePlek = werk.scenes.find(
          (sc) => sc.twoShotUrl && sc !== s && kaleSetting(sc.setting) === kaleSetting(s.setting)
        );
        if (zelfdePlek?.twoShotUrl) {
          werk.scenes[si].twoShotUrl = zelfdePlek.twoShotUrl;
          klaar++;
          setVoortgang(`Scènes opzetten (${klaar}/${zonderShot.length})…`);
          setSpec(structuredClone(werk));
          continue;
        }

        // Het eerste beschikbare twee-shot dient als anker; bij een hervatting kan
        // dat er dus al staan uit een eerdere ronde.
        const anker = werk.scenes.find((sc) => sc.twoShotUrl)?.twoShotUrl ?? null;
        try {
          const r = await fetch("/api/infographics/dialogue-twoshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              setting: s.setting, cast: werk.cast, styleId: werk.styleId,
              format: werk.format, language: werk.language, seed: werk.seed,
              illustrationBrief: werk.illustrationBrief ?? "",
              anchorTwoShotUrl: anker,
            }),
          });
          const d = await r.json();
          if (!r.ok) {
            if (d.error === "insufficient_credits") { gestopt = creditFout(d); break; }
            mislukt.push(`scène ${si + 1}`);
          } else {
            werk.scenes[si].twoShotUrl = d.twoShotUrl;
          }
        } catch { mislukt.push(`scène ${si + 1}`); }
        klaar++;
        setVoortgang(`Scènes opzetten (${klaar}/${zonderShot.length})…`);
        setSpec(structuredClone(werk));
      }
    }

    // Dan de regels. Alleen wat er nog niet staat, zodat opnieuw klikken een
    // hervatting is en je niet nog eens betaalt voor clips die al klaar zijn.
    const taken: { si: number; li: number }[] = [];
    werk.scenes.forEach((s, si) =>
      s.lines.forEach((l, li) => {
        const bruikbaar = l.kind === "actie" ? !!(l.actie ?? "").trim() : !!l.text.trim();
        if (!regelKlaar(l) && s.twoShotUrl && bruikbaar) taken.push({ si, li });
      })
    );

    if (!gestopt && taken.length) {
      let af = 0;
      setVoortgang(`Regels maken (0/${taken.length})…`);
      let volgende = 0;
      const werkers = Array.from({ length: Math.min(PARALLEL, taken.length) }, async () => {
        while (volgende < taken.length && !gestopt) {
          const { si, li } = taken[volgende++];
          const scene = werk.scenes[si];
          const regel = scene.lines[li];
          try {
            const r = await fetch("/api/infographics/dialogue-line", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                twoShotUrl: scene.twoShotUrl, cast: werk.cast, speakerId: regel.characterId,
                kind: regel.kind ?? "dialoog", actie: regel.actie ?? "", seconden: regel.seconden ?? undefined,
                narratorVoice: werk.narratorVoice ?? undefined,
                text: regel.text, emotion: regel.emotion, language: werk.language,
                format: werk.format, styleId: werk.styleId, seed: werk.seed,
                illustrationBrief: werk.illustrationBrief ?? "",
              }),
            });
            const d = await r.json();
            if (!r.ok) {
              if (d.error === "insufficient_credits") gestopt = creditFout(d);
              else mislukt.push(`regel ${li + 1} van scène ${si + 1}`);
            } else {
              Object.assign(regel, {
                audioUrl: d.audioUrl, audioDuration: d.audioDuration,
                shotImageUrl: d.shotImageUrl, videoUrl: d.videoUrl, mouthStart: d.mouthStart,
                sprekerZeker: d.sprekerZeker ?? null,
                beeldWaarschuwingen: d.beeldWaarschuwingen ?? null,
              });
              if (!d.videoUrl) mislukt.push(`regel ${li + 1} van scène ${si + 1} (beweging)`);
            }
          } catch {
            mislukt.push(`regel ${li + 1} van scène ${si + 1}`);
          }
          af++;
          setVoortgang(`Regels maken (${af}/${taken.length})…`);
          setSpec(structuredClone(werk));
        }
      });
      await Promise.all(werkers);
    }

    if (gestopt) setRenderFout(gestopt);
    else if (mislukt.length) setRenderFout(`${mislukt.length} onderdeel(en) mislukt: ${mislukt.join(", ")}. Klik nogmaals — alleen die worden opnieuw geprobeerd.`);
    setVoortgang(gestopt || mislukt.length ? "Deels klaar" : "Klaar");
    setRenderBezig(false);
    void bewaar(werk, projectId);
  }

  async function exporteer() {
    if (!spec) return;
    setExportBezig(true); setExportFout(null); setExportUrl(null);
    try {
      const res = await fetch("/api/infographics/dialogue-export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(creditFout(d));
      setExportUrl(d.url as string);
    } catch (e) {
      setExportFout(e instanceof Error ? e.message : String(e));
    } finally { setExportBezig(false); }
  }

  /**
   * Maakt ÉÉN regel opnieuw, en alleen het deel dat kapot is.
   *
   * Een regel bestaat uit stem, bronbeeld en beweging. Alles overdoen omdat de
   * beweging niet deugde is zonde van het geld én van een beeld dat je net goed
   * vond, dus we sturen mee wat hergebruikt mag worden.
   */
  async function herstelRegel(si: number, li: number, actie: HerstelActie) {
    if (!spec || herstelBezig) return;
    const scene = spec.scenes[si];
    const regel = scene?.lines[li];
    if (!scene?.twoShotUrl || !regel) return;

    setHerstelBezig(`${si}-${li}`);
    setRenderFout(null);
    try {
      const hergebruikBeeld = actie.soort === "beweging" ? regel.shotImageUrl ?? undefined : undefined;
      // De stem blijft staan zolang de tekst niet veranderd is; bij "alles
      // opnieuw" wil je hem juist wél opnieuw laten inspreken.
      const hergebruikStem = actie.soort === "alles" ? undefined : regel.audioUrl ?? undefined;

      const r = await fetch("/api/infographics/dialogue-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twoShotUrl: scene.twoShotUrl, cast: spec.cast, speakerId: regel.characterId,
          kind: regel.kind ?? "dialoog", actie: regel.actie ?? "", seconden: regel.seconden ?? undefined,
          narratorVoice: spec.narratorVoice ?? undefined,
          text: regel.text, emotion: regel.emotion, language: spec.language,
          format: spec.format, styleId: spec.styleId, seed: spec.seed,
          illustrationBrief: spec.illustrationBrief ?? "",
          hergebruikShotImageUrl: hergebruikBeeld,
          hergebruikAudioUrl: hergebruikStem,
          hergebruikAudioDuration: hergebruikStem ? regel.audioDuration ?? undefined : undefined,
          beeldInstructie: actie.soort === "beeld" ? actie.instructie : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setRenderFout(creditFout(d)); return; }

      const nieuw = structuredClone(spec);
      Object.assign(nieuw.scenes[si].lines[li], {
        audioUrl: d.audioUrl, audioDuration: d.audioDuration,
        shotImageUrl: d.shotImageUrl, videoUrl: d.videoUrl, mouthStart: d.mouthStart,
        sprekerZeker: d.sprekerZeker ?? null,
        beeldWaarschuwingen: d.beeldWaarschuwingen ?? null,
      });
      setSpec(nieuw);
      setExportUrl(null);
      void bewaar(nieuw, projectId);
    } catch (e) {
      setRenderFout(e instanceof Error ? e.message : String(e));
    } finally {
      setHerstelBezig(null);
    }
  }

  // Gooit alle getekende beelden en clips weg zodat een nieuwe stijl of briefing
  // op de HELE video wordt toegepast. De stemmen blijven staan: die veranderen
  // niet mee met de beeldregie, en opnieuw inspreken zou zonde van het geld zijn.
  function tekenOpnieuw() {
    if (!spec) return;
    setSpec({
      ...spec,
      scenes: spec.scenes.map((s) => ({
        ...s,
        twoShotUrl: null,
        lines: s.lines.map((l) => ({ ...l, shotImageUrl: null, videoUrl: null, mouthStart: null })),
      })),
    });
    setExportUrl(null);
  }

  const fragmenten = spec ? bouwFragmenten(spec) : [];
  const alleRegels = spec?.scenes.flatMap((s) => s.lines) ?? [];
  const klaarAantal = alleRegels.filter(regelKlaar).length;

  return (
    <div className="max-w-[980px] mx-auto p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-white">
          Dialoogmodus <span className="text-[11px] align-middle rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5">bèta</span>
        </h1>
        <div className="flex items-center gap-3">
          {projectId && <span className="text-[11px] text-emerald-400">bewaard</span>}
          <Link href="/infographics/story" className="text-xs text-slate-400 hover:text-white">← Storytelling</Link>
        </div>
      </div>
      <p className="text-sm text-slate-400 mb-5">
        Twee of drie personages voeren samen een gesprek, tegenover elkaar in beeld. Vertel wat je wilt — de assistent werkt het draaiboek uit.
      </p>
      {projectLaden && <p className="text-sm text-blue-300 mb-4">Dialoog laden…</p>}
      {fout && <p className="text-sm text-red-400 mb-4">{fout}</p>}

      <div className="flex items-center gap-2 mb-6 text-[11px]">
        {([[1, "Idee"], [2, "Draaiboek"], [3, "Video"]] as const).map(([n, label]) => (
          <button
            key={n}
            onClick={() => { if (n === 1 || spec) setStap(n as Stap); }}
            disabled={n !== 1 && !spec}
            className={`px-3 py-1.5 rounded-full transition disabled:opacity-30 ${
              stap === n ? "bg-orange-500 text-white" : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {n}. {label}
          </button>
        ))}
      </div>

      {/* ---------- Stap 1: het gesprek ---------- */}
      {stap === 1 && heeftPersonages !== null && (
        <div className="space-y-3">
          <DialogueChat onPlan={ontvangPlan} heeftPersonages={heeftPersonages} lengte={lengte} onLengte={setLengte} />
          <p className="text-[11px] text-slate-600">
            De assistent kiest personages uit je <Link href="/characters" className="text-slate-500 underline hover:text-slate-300">bibliotheek</Link>,
            bepaalt stijl en toon, en schrijft het gesprek. Alles is daarna nog aan te passen. Praten kost vrijwel niets; pas bij het maken van de video gaat er geld op.
          </p>
        </div>
      )}

      {/* ---------- Stap 2: het draaiboek ---------- */}
      {stap === 2 && spec && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">{spec.title}</h2>
              <p className="text-[11px] text-slate-500">
                Pas aan wat je wilt. Verander je een zin of de spreker, dan wordt die clip opnieuw gemaakt.
              </p>
            </div>
            <button onClick={maakVideo} disabled={renderBezig}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition shrink-0">
              Video maken ({schatCredits(spec)} credits)
            </button>
          </div>

          {/* Wie er meespelen — de assistent koos ze, jij mag wisselen. */}
          <details className="bg-white/5 border border-white/10 rounded-xl p-4 group">
            <summary className="text-sm font-medium text-white cursor-pointer list-none flex items-center gap-2">
              <span className="text-slate-500 text-xs group-open:rotate-90 transition-transform">▶</span>
              Rolverdeling
              <span className="text-[11px] font-normal text-slate-500">— {spec.cast.map((c) => c.name).join(" en ")}</span>
            </summary>
            <div className="mt-3">
              <CastPicker
                cast={spec.cast}
                onChange={(nieuw) => setSpec({ ...spec, cast: nieuw })}
                disabled={renderBezig}
              />
            </div>
          </details>

          <details className="bg-white/5 border border-white/10 rounded-xl p-4 group">
            <summary className="text-sm font-medium text-white cursor-pointer list-none flex items-center gap-2">
              <span className="text-slate-500 text-xs group-open:rotate-90 transition-transform">▶</span>
              Beeldregie
              <span className="text-[11px] font-normal text-slate-500">
                — {STORY_STYLE_PRESETS.find((s) => s.id === spec.styleId)?.name ?? "Flat vector"}
                {spec.illustrationBrief ? " · met briefing" : ""}
              </span>
            </summary>
            <div className="mt-3">
              <ArtDirection
                styleId={spec.styleId ?? DEFAULT_STORY_STYLE}
                brief={spec.illustrationBrief ?? ""}
                onStyle={(id) => setSpec({ ...spec, styleId: id })}
                onBrief={(t) => setSpec({ ...spec, illustrationBrief: t || null })}
                disabled={renderBezig}
                gemaakteBeelden={
                  spec.scenes.filter((s) => s.twoShotUrl).length +
                  spec.scenes.flatMap((s) => s.lines).filter((l) => l.shotImageUrl).length
                }
                onOpnieuw={tekenOpnieuw}
              />
            </div>
          </details>

          <ScriptBoard spec={spec} onChange={setSpec} disabled={renderBezig} />

          {/* Aanpassen in gewone taal. Dit is bewust GEEN nieuwe chat: de assistent
              krijgt het huidige draaiboek mee en past aan wat je vraagt, zodat clips
              van ongewijzigde regels blijven staan. */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-1">Iets laten aanpassen</h3>
            <p className="text-[11px] text-slate-500 mb-2.5">
              Zeg in gewone taal wat er anders moet. De assistent kent je draaiboek en verandert alleen wat je vraagt — clips van regels die hetzelfde blijven, blijven staan.
            </p>
            <DialogueBuddy spec={spec} onSpec={setSpec} disabled={renderBezig} />
          </div>
        </div>
      )}

      {/* ---------- Stap 3: de video ---------- */}
      {stap === 3 && spec && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={maakVideo} disabled={renderBezig}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition">
              {renderBezig ? "Bezig…" : klaarAantal === alleRegels.length ? "Alles staat klaar" : `Verder maken (${schatCredits(spec)} credits)`}
            </button>
            <span className="text-xs text-slate-400">
              {klaarAantal}/{alleRegels.length} regels klaar {voortgang && `· ${voortgang}`}
            </span>
          </div>
          {renderFout && <p className="text-xs text-red-400">{renderFout}</p>}
          <p className="text-[11px] text-slate-500">
            Per regel maken we een bronbeeld waarin deze persoon praat en de ander luistert, en brengen dat in beweging. Reken op een halve minuut per regel.
          </p>

          {/* Er gaat altijd wel iets mis bij AI-beeld. Vanuit de video moet je in
              één klik terug kunnen naar het draaiboek om één regel of één hele
              scène opnieuw te laten maken. */}
          <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Iets verkeerd uitgepakt?</span>
            <button onClick={() => setStap(2)} className="text-xs text-orange-300 hover:text-orange-200 underline">
              Terug naar het draaiboek
            </button>
            <span className="text-[11px] text-slate-600">
              — daar zet je met ↻ één regel of een hele scène opnieuw klaar, of laat je de assistent hem herschrijven. Daarna klik je hier weer op “Verder maken”.
            </span>
          </div>

          {fragmenten.length > 0 && (
            <>
              <DialoguePlayer
                fragmenten={fragmenten}
                format={spec.format}
                musicUrl={spec.musicUrl}
                musicVolume={spec.musicVolume}
              />

              {/* Per moment ingrijpen, direct onder de video: je ziet het bronbeeld
                  waar de clip uit komt, en kiest wat er precies opnieuw moet. */}
              <div className="border-t border-white/10 pt-4">
                <h3 className="text-sm font-medium text-white mb-1">Scènes aanpassen</h3>
                <p className="text-[11px] text-slate-500 mb-2.5">
                  Klopt er iets niet? Pas de tekst aan, geef het beeld een aanwijzing, of laat alleen de beweging opnieuw maken — dan blijft het beeld dat je al goed vond staan.
                </p>
                <FragmentEditor
                  spec={spec}
                  onSpec={setSpec}
                  onHerstel={herstelRegel}
                  bezigMet={herstelBezig}
                  disabled={renderBezig}
                />
              </div>

              <div className="border-t border-white/10 pt-4 flex flex-wrap items-center gap-3">
                <MusicPickerButton
                  value={spec.musicUrl}
                  onChange={(url) => { setSpec((p) => (p ? { ...p, musicUrl: url, musicVolume: p.musicVolume ?? 0.45 } : p)); setExportUrl(null); }}
                  videoDuration={spec.scenes.reduce(
                    (a, s) => a + s.lines.reduce((b, l) => b + (l.kind === "actie" ? (l.seconden ?? 4) : (l.audioDuration ?? 4)), 0),
                    0
                  )}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded px-3 py-1.5 transition"
                />
                {spec.musicUrl && (
                  <span className="text-xs text-emerald-300">
                    {findMusicTrackByUrl(spec.musicUrl)?.title ?? "Eigen muziek"} zit in de download
                  </span>
                )}
                <button onClick={exporteer} disabled={exportBezig}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition ml-auto">
                  {exportBezig ? "Samenvoegen…" : "Exporteren (MP4)"}
                </button>
                {exportUrl && <a href={exportUrl} className="text-sm text-emerald-300 underline hover:text-emerald-200">⬇ Download</a>}
              </div>
              {exportFout && <p className="text-xs text-red-400">{exportFout}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
