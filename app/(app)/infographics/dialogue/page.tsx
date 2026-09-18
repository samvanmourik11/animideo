"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { canUseDialoog } from "@/lib/studio/access";
import DialogueChat from "@/components/dialogue/DialogueChat";
import DialogueBuddy from "@/components/dialogue/DialogueBuddy";
import CastPicker from "@/components/dialogue/CastPicker";
import ScriptBoard, { schatCredits, schatStoryboardCredits } from "@/components/dialogue/ScriptBoard";
import Storyboard, { type HertekenWijziging } from "@/components/dialogue/Storyboard";
import DialoguePlayer, { bouwFragmenten } from "@/components/dialogue/DialoguePlayer";
import FragmentEditor, { type RegelPlek } from "@/components/dialogue/FragmentEditor";
import type { FragmentDiagnose } from "@/lib/infographics/fragment-diagnose";
import ArtDirection from "@/components/dialogue/ArtDirection";
import SetupPanel from "@/components/dialogue/SetupPanel";
import { type DialogueSetup } from "@/lib/infographics/dialogue-setup";
import type { VerhaalModus } from "@/lib/infographics/verhaallijn";
import { DEFAULT_STORY_STYLE, STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import { regelKlaar, heeftStem, castbladSoort, sceneCast, voorwerpenInScene, bruikbareRegel, VIDEO_STANDAARD_SEC, type DialogueSpec, type DialogueVoorwerp } from "@/lib/infographics/dialogue-schema";
import { leesRegie, pasRegieToe, regieNodig } from "@/lib/infographics/beeldregie";
import { MAX_VOORWERPEN, voegVoorwerpenSamen, voorwerpenVoorStijl, type BibliotheekVoorwerp } from "@/lib/infographics/voorwerp-bibliotheek";
import { tekenVoorwerp, voorwerpSleutel, type TekenContext } from "@/lib/infographics/voorwerp-tekenen";
import { zitHouding, zegtIetsOverHouding } from "@/lib/infographics/dialogue-staging";
import VasteVoorwerpen from "@/components/dialogue/VasteVoorwerpen";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { DIALOOG_CREDITS, creditTekst } from "@/lib/infographics/dialoog-credits";
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

type Stap = 1 | 2 | 3 | 4 | 5;

export default function DialoguePage() {
  const [spec, setSpec] = useState<DialogueSpec | null>(null);
  const [stap, setStap] = useState<Stap>(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLaden, setProjectLaden] = useState(false);
  const [heeftPersonages, setHeeftPersonages] = useState<boolean | null>(null);
  // De tool is nog niet voor iedereen open (zie access.ts). null = nog aan het kijken.
  const [toegang, setToegang] = useState<boolean | null>(null);
  const [lengte, setLengte] = useState(VIDEO_STANDAARD_SEC);
  // De opzet: alle dimensies van de video, vastgesteld vóór er iets geschreven is.
  const [setup, setSetup] = useState<DialogueSetup | null>(null);
  const [setupBezig, setSetupBezig] = useState(false);
  const [schrijfBezig, setSchrijfBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  // Apart van `fout`: een gelukte bewaarbeurt ruimt deze melding op, maar nooit een andere fout.
  const [bewaarFout, setBewaarFout] = useState<string | null>(null);

  const [renderBezig, setRenderBezig] = useState(false);
  const [renderFout, setRenderFout] = useState<string | null>(null);
  const [voortgang, setVoortgang] = useState("");
  const [exportBezig, setExportBezig] = useState(false);
  const [exportFout, setExportFout] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  // Welke regel op dit moment gericht opnieuw gemaakt wordt ("si-li").
  const [herstelBezig, setHerstelBezig] = useState<string[]>([]);
  // Van welke scène het storyboard nu een nieuw basisbeeld maakt.
  const [hertekenBezig, setHertekenBezig] = useState<number | null>(null);
  // Van welke regels ("si-li") het storyboard nu los een nieuw beeld maakt. Een
  // lijst, want je wilt niet op het ene beeld wachten voor je het volgende aanpast.
  const [regelsBezig, setRegelsBezig] = useState<string[]>([]);
  // Voorwerpen uit het draaiboek halen (zie zoekVoorwerpen).
  const [voorwerpenBezig, setVoorwerpenBezig] = useState(false);
  const [bladBezig, setBladBezig] = useState<string | null>(null);
  const [voorwerpenMelding, setVoorwerpenMelding] = useState<string | null>(null);
  // Welke voorwerpen nu getekend worden (voorwerpSleutel), in de opzet of het draaiboek.
  const [voorwerpTekenBezig, setVoorwerpTekenBezig] = useState<string[]>([]);

  /** Wat het tekenen van een voorwerp uit de spec nodig heeft. */
  function tekenContext(werk: DialogueSpec): TekenContext {
    return {
      styleId: werk.styleId, language: werk.language, illustrationBrief: werk.illustrationBrief,
      seed: werk.seed, castSheetUrl: werk.castSheetUrl, cast: werk.cast,
    };
  }

  // Het plaatje landt alleen op een voorwerp met nog dezelfde naam en beschrijving: is
  // het intussen aangepast, dan hoort dat plaatje er niet meer bij.
  const zetBladInSpec = (sleutel: string, bladUrl: string, bladStijl: string) =>
    setSpec((prev) => prev && {
      ...prev,
      voorwerpen: (prev.voorwerpen ?? []).map((v) => (voorwerpSleutel(v) === sleutel ? { ...v, bladUrl, bladStijl } : v)),
    });
  const zetBladInOpzet = (sleutel: string, bladUrl: string, bladStijl: string) =>
    setSetup((prev) => prev && {
      ...prev,
      voorwerpen: (prev.voorwerpen ?? []).map((v) => (voorwerpSleutel(v) === sleutel ? { ...v, bladUrl, bladStijl } : v)),
    });

  /**
   * Voorwerpbladen in de tekenstijl van deze video houden (zie voorwerpenVoorStijl).
   * Vervalt er een blad terwijl het storyboard al bestaat, dan wordt het meteen in de
   * goede stijl getekend: een shot dat je daarna opnieuw maakt zou anders zonder
   * boomplaatje gaan, en dat is erger dan met een verkeerd.
   */
  async function voorwerpenInStijl(werk: DialogueSpec) {
    if (!werk.voorwerpen?.length) return;
    let bibliotheek: BibliotheekVoorwerp[] = [];
    try {
      const r = await fetch("/api/voorwerpen");
      const d = await r.json();
      if (r.ok && Array.isArray(d.voorwerpen)) bibliotheek = d.voorwerpen;
    } catch { /* dan weet alleen het voorwerp zelf in welke stijl zijn blad is */ }
    const stijl = werk.styleId ?? DEFAULT_STORY_STYLE;
    const nieuw = voorwerpenVoorStijl(werk.voorwerpen, stijl, { bibliotheek });
    if (nieuw.every((v, i) => v === werk.voorwerpen![i])) return;
    // Op de nieuwste spec: je kunt intussen doorwerken.
    setSpec((prev) => (prev?.voorwerpen?.length
      ? { ...prev, voorwerpen: voorwerpenVoorStijl(prev.voorwerpen, prev.styleId ?? DEFAULT_STORY_STYLE, { bibliotheek }) }
      : prev));
    const vervallen = nieuw.filter((v, i) => !v.bladUrl && !!werk.voorwerpen![i].bladUrl);
    if (werk.castSheetUrl && vervallen.length) void tekenVoorwerpenVoor(vervallen, tekenContext(werk), zetBladInSpec);
  }

  /**
   * Voorwerpen tekenen, zodat je ze in de opzet en het draaiboek al ziet.
   *
   * Eerst gebeurde dit pas bij het storyboard: de vakjes naast de klaproos en de
   * grote boom bleven leeg, en je keurde ze goed zonder te zien hoe ze eruitzagen.
   */
  async function tekenVoorwerpenVoor(
    lijst: DialogueVoorwerp[],
    ctx: TekenContext,
    zetBlad: (sleutel: string, bladUrl: string, bladStijl: string) => void,
  ) {
    const teDoen = lijst.filter(
      (v) => v.naam.trim() && v.uiterlijk.trim() && !voorwerpTekenBezig.includes(voorwerpSleutel(v)),
    );
    if (!teDoen.length) return;
    setVoorwerpTekenBezig((bezig) => [...bezig, ...teDoen.map(voorwerpSleutel)]);
    const fouten: string[] = [];
    await Promise.all(teDoen.map(async (v) => {
      const uit = await tekenVoorwerp(v, ctx);
      if ("fout" in uit) fouten.push(`${v.naam}: ${uit.fout}`);
      else zetBlad(voorwerpSleutel(v), uit.bladUrl, uit.bladStijl);
      setVoorwerpTekenBezig((bezig) => bezig.filter((k) => k !== voorwerpSleutel(v)));
    }));
    if (fouten.length) setVoorwerpenMelding(`Tekenen niet gelukt. ${fouten.join("; ")}`);
  }

  function tekenVoorwerpenInDraaiboek(indices: number[]) {
    if (!spec) return;
    const lijst = indices.map((i) => spec.voorwerpen?.[i]).filter((v): v is DialogueVoorwerp => !!v);
    void tekenVoorwerpenVoor(lijst, tekenContext(spec), zetBladInSpec);
  }

  function tekenVoorwerpenInOpzet(indices: number[]) {
    if (!setup) return;
    const lijst = indices.map((i) => setup.voorwerpen?.[i]).filter((v): v is DialogueVoorwerp => !!v);
    void tekenVoorwerpenVoor(
      lijst,
      { styleId: setup.styleId, language: setup.language, illustrationBrief: setup.illustrationBrief, cast: setup.cast },
      zetBladInOpzet,
    );
  }

  /**
   * Voorwerpen uit het draaiboek halen, erbij zetten en meteen tekenen.
   *
   * De opzet koos voor een verhaal over een klaproos en een grote boom geen enkel
   * voorwerp (zie de route dialogue-voorwerpen). Wat er al staat blijft staan, met
   * zijn blad; het resultaat landt op de nieuwste spec, want je kunt intussen doorwerken.
   */
  async function zoekVoorwerpen(bron?: DialogueSpec) {
    const werk = bron ?? spec;
    if (!werk || voorwerpenBezig) return;
    setVoorwerpenBezig(true);
    setVoorwerpenMelding(null);
    try {
      const r = await fetch("/api/infographics/dialogue-voorwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: werk }),
      });
      const d = await r.json();
      if (!r.ok) { setVoorwerpenMelding(d.detail || d.error || "Voorwerpen zoeken mislukt"); return; }
      const gevonden = (d.voorwerpen ?? []) as NonNullable<DialogueSpec["voorwerpen"]>;
      const bestaand = werk.voorwerpen ?? [];
      const nieuw = voegVoorwerpenSamen(bestaand, gevonden).slice(bestaand.length);
      setSpec((prev) => {
        if (!prev) return prev;
        const samen = voegVoorwerpenSamen(prev.voorwerpen ?? [], gevonden);
        return { ...prev, voorwerpen: samen.length ? samen : null };
      });
      // Meteen tekenen wat nog geen plaatje heeft: een voorwerp uit de bibliotheek
      // brengt zijn plaatje in deze stijl vaak al mee.
      const zonderPlaatje = nieuw.filter((v) => !v.bladUrl);
      if (zonderPlaatje.length) void tekenVoorwerpenVoor(zonderPlaatje, tekenContext(werk), zetBladInSpec);
      setVoorwerpenMelding(
        gevonden.length === 0
          ? "Geen voorwerpen gevonden die een rol spelen of in meer beelden terugkomen."
          : nieuw.length === 0
            ? "Geen nieuwe voorwerpen: wat er gevonden is, staat er al."
            : `${nieuw.length} ${nieuw.length === 1 ? "voorwerp" : "voorwerpen"} toegevoegd` +
              (zonderPlaatje.length
                ? `, de plaatjes worden nu getekend (${creditTekst(zonderPlaatje.length * DIALOOG_CREDITS.VOORBEREIDING)}).`
                : ".") +
              " Klopt een plaatje niet, pas dan de beschrijving aan en teken hem opnieuw.",
      );
    } catch (e) {
      setVoorwerpenMelding(e instanceof Error ? e.message : String(e));
    } finally {
      setVoorwerpenBezig(false);
    }
  }

  const creditFout = (d: { error?: string; required?: number; credits?: number; detail?: string }) =>
    d.error === "insufficient_credits"
      ? `Te weinig credits (nodig: ${d.required}, saldo: ${d.credits})`
      : (d.detail || d.error || "Mislukt");

  // Of de gebruiker überhaupt personages heeft bepaalt of de assistent iets kan
  // kiezen; zonder cast heeft doorpraten geen zin.
  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data }) => setToegang(canUseDialoog(data.user?.email)))
      .catch(() => setToegang(false));
  }, []);

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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Hier stond de kale serverfout bovenaan: "Unauthorized", terwijl Sam gewoon
        // ingelogd was en de verbinding met de database even haperde. Bewaren gaat bij
        // de volgende wijziging vanzelf opnieuw, en de melding verdwijnt als dat lukt.
        setBewaarFout(
          res.status === 401
            ? "Bewaren lukte even niet: de verbinding met de server haperde. Bij je volgende wijziging wordt het opnieuw geprobeerd. Blijft deze melding staan, log dan opnieuw in."
            : `Bewaren mislukt: ${d.detail || d.error || "onbekende fout"}. Bij je volgende wijziging wordt het opnieuw geprobeerd.`,
        );
        return id;
      }
      setBewaarFout(null);
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
        setStap(3);
        void voorwerpenInStijl(geladen);
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
    setStap(3);
    // Ook via het gesprek: zonder voorwerpen meteen zoeken (zie zoekVoorwerpen).
    if (!nieuw.voorwerpen?.length) void zoekVoorwerpen(nieuw);
  }

  // ---------- De opzet ----------
  function ontvangOpzet(nieuw: DialogueSetup) {
    setSetup(nieuw);
    setStap(2);
  }

  // Een nieuw voorstel vragen. Wat de gebruiker zelf koos gaat als vaste cast mee,
  // zodat "ander voorstel" niet stilzwijgend zijn rolverdeling weggooit.
  async function opnieuwVoorstellen(modus?: VerhaalModus) {
    if (!setup) return;
    setSetupBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/infographics/dialogue-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: setup.topic,
          text: setup.text,
          targetSeconds: setup.targetSeconds,
          format: setup.format,
          language: setup.language,
          // Wisselt de gebruiker van "volg mijn tekst" naar "maak er een verhaal van"
          // (of andersom), dan geldt die keuze; anders blijft de huidige modus staan.
          modus: modus ?? setup.modus,
          vasteCast: setup.cast.map((c) => ({
            characterId: c.characterId,
            name: c.name,
            portraitUrl: c.portraitUrl,
            role: c.role,
            appearance: c.appearance,
            kleding: c.kleding,
            nieuw: c.nieuw,
            bibliotheekId: c.bibliotheekId,
            soort: c.soort,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) { setFout(creditFout(d)); return; }
      if (d.setup) setSetup(d.setup as DialogueSetup);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setSetupBezig(false);
    }
  }

  // Het draaiboek schrijven binnen de vastgestelde opzet. De chat-route doet het
  // zware werk (samenhang, lengte, aanscherpen); de opzet overschrijft daarin alle
  // keuzes die de gebruiker zelf heeft gemaakt.
  async function schrijfDraaiboek() {
    if (!setup) return;
    const gerenderd = spec?.scenes.flatMap((s) => s.lines).filter(regelKlaar).length ?? 0;
    if (gerenderd > 0 && !window.confirm(`Er ${gerenderd === 1 ? "staat 1 clip" : `staan ${gerenderd} clips`} klaar. Een nieuw draaiboek vervangt die. Doorgaan?`)) {
      return;
    }
    setSchrijfBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/infographics/dialogue-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: setup.text }],
          targetSeconds: setup.targetSeconds,
          setup,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setFout(creditFout(d)); return; }
      if (!d.spec) { setFout(d.reply || "De assistent kreeg het draaiboek niet rond."); return; }
      setSpec(d.spec as DialogueSpec);
      setLengte(setup.targetSeconds);
      setExportUrl(null);
      setStap(3);
      // Meteen de voorwerpen erbij zoeken als de opzet er geen gaf. Zonder erop te
      // wachten: het draaiboek staat al klaar om te lezen.
      if (!(d.spec as DialogueSpec).voorwerpen?.length) void zoekVoorwerpen(d.spec as DialogueSpec);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setSchrijfBezig(false);
    }
  }

  /**
   * Het kader van het shot vlak vóór dit shot, ook als dat in de vorige scene ligt.
   *
   * Zonder deze blik over de scenegrens heen krijg je precies op de overgang twee
   * dezelfde kaders achter elkaar — en juist daar valt het op, want daar hoort de
   * kijker een nieuwe plek te zien.
   */
  function vorigKaderVoor(spec: DialogueSpec, si: number, li: number) {
    if (li > 0) return spec.scenes[si].lines[li - 1]?.kader ?? null;
    for (let k = si - 1; k >= 0; k--) {
      const regels = spec.scenes[k].lines;
      if (regels.length) return regels[regels.length - 1].kader ?? null;
    }
    return null;
  }

  // ---------- Het storyboard: de basisbeelden ----------

  /**
   * Het verzoek voor het basisbeeld van één scène.
   *
   * Eén plek voor zowel het eerste storyboard als een los opnieuw gemaakt beeld,
   * zodat die twee nooit uit elkaar lopen in wat ze meesturen.
   */
  function twoShotVerzoek(werk: DialogueSpec, si: number) {
    const s = werk.scenes[si];
    // Hier gingen eerdere plekbeelden mee als voorbeeld (anker, zelfde plek, licht).
    // Dat leverde kopieën met een harde, overbelichte afwerking op; zie
    // dialogue-twoshot. Elke plek wordt nu vanaf de omschrijving getekend.
    return {
      // Alleen wie er in DEZE scene speelt. De hele cast meesturen gaf bij
      // meer dan drie personages beelden vol mensen die er niets te zoeken
      // hadden — en het beeldmodel moest ze dan ook nog uit elkaar houden.
      setting: s.setting, cast: sceneCast(s, werk.cast, werk.verhaallijn), styleId: werk.styleId,
      castSheetUrl: werk.castSheetUrl ?? null, castSheetVan: werk.castSheetVan ?? null,
      format: werk.format, language: werk.language, seed: werk.seed,
      illustrationBrief: werk.illustrationBrief ?? "",
      sceneIndex: si,
      wereld: s.wereld ?? null,
      licht: s.licht ?? null,
      aanwijzing: s.beeldAanwijzing ?? undefined,
      voorwerpen: voorwerpenInScene(werk.voorwerpen, s, 0),
      // Het scènebeeld volgt de houding van het openingsbeeld: zitten ze aan tafel,
      // dan tekenen we ze niet eerst staand midden in de kamer.
      zit: zitHouding(s.lines, 1),
    };
  }

  /**
   * Het verzoek voor één regel: het beeld, en bij de clip ook stem en beweging.
   *
   * Stond twee keer uitgeschreven (video maken en opnieuw maken), en geen van
   * beide stuurde de plek mee: een shot met een eigen camerastandpunt kreeg dan
   * "the same place as in the reference image" als omschrijving. Storyboard, video
   * en herstel komen nu uit deze ene functie, zodat ze niet uit elkaar lopen.
   */
  function regelVerzoek(
    werk: DialogueSpec,
    si: number,
    li: number,
    opties: {
      alleenBeeld?: boolean;
      hergebruikBeeld?: string | null;
      beeldInstructie?: string | null;
      bewegingInstructie?: string | null;
      /** Het beeld valt onder de credit per scène (storyboard of hele video in één keer). */
      doorSceneBetaald?: boolean;
    } = {},
  ) {
    const scene = werk.scenes[si];
    const regel = scene.lines[li];
    return {
      twoShotUrl: scene.twoShotUrl, castSheetUrl: werk.castSheetUrl ?? null, castSheetVan: werk.castSheetVan ?? null,
      // Alleen de spelers van deze scene; het castblad houdt de rest bij. Hier ging
      // eerst bij opnieuw maken de hele cast mee, waardoor een opnieuw gemaakte
      // regel ineens iemand anders in beeld had.
      cast: sceneCast(scene, werk.cast, werk.verhaallijn), speakerId: regel.characterId,
      kind: regel.kind ?? "dialoog", actie: regel.actie ?? "", seconden: regel.seconden ?? undefined,
      narratorVoice: werk.narratorVoice ?? undefined,
      text: regel.text, emotion: regel.emotion, language: werk.language,
      // De stem uit de opname per stem (maakStemmen). Zonder stem spreekt de regel
      // zelf in, zoals voorheen.
      hergebruikAudioUrl: regel.audioUrl ?? undefined,
      hergebruikAudioDuration: regel.audioUrl ? regel.audioDuration ?? undefined : undefined,
      format: werk.format, styleId: werk.styleId, seed: werk.seed,
      illustrationBrief: werk.illustrationBrief ?? "",
      setting: scene.setting,
      wereld: scene.wereld ?? undefined,
      beeld: regel.beeld ?? undefined,
      // Het kader van dit shot, plus dat van het vorige zodat er geen twee dezelfde
      // achter elkaar komen. Het vorige shot kan in een eerdere scene liggen.
      kader: regel.kader ?? null,
      vorigKader: vorigKaderVoor(werk, si, li),
      // Doorlopende nummering over alle scenes heen, zodat de camerabewegingen
      // rouleren en niet elke scene opnieuw bij "inzoomen" beginnen.
      shotIndex: werk.scenes.slice(0, si).reduce((n, sc) => n + sc.lines.length, 0) + li,
      licht: scene.licht ?? null,
      voorwerpen: voorwerpenInScene(werk.voorwerpen, scene, li),
      zit: zitHouding(scene.lines, li) && (regel.kind !== "actie" || !zegtIetsOverHouding(regel.actie)),
      alleenBeeld: opties.alleenBeeld || undefined,
      hergebruikShotImageUrl: opties.hergebruikBeeld || undefined,
      beeldInstructie: opties.beeldInstructie || undefined,
      bewegingInstructie: opties.bewegingInstructie || undefined,
      doorSceneBetaald: opties.doorSceneBetaald || undefined,
    };
  }

  /**
   * Alles wat vóór de clips komt: model sheets, castblad en per scène het
   * basisbeeld. Samen is dat het storyboard.
   *
   * Slaat over wat er al is, dus opnieuw aanroepen is een hervatting. Geeft een
   * melding terug als er gestopt moest worden (te weinig credits).
   */
  async function maakBasisbeelden(werk: DialogueSpec, mislukt: string[]): Promise<string | null> {
    let gestopt: string | null = null;

    // ALLEREERST een houdingenblad per personage: hetzelfde personage van voren, schuin en
    // opzij. Dat blad is DE tekening die naar elk beeld gaat. Gemeten op 19-09-2026: met het
    // blad klopte Coco's uitrusting in 5 van de 5 beelden, met het karakter uit de
    // bibliotheek in 2 van de 5. Het blad kan zijn eigen fouten hebben (Leo's rugnummer
    // verdween), daarom kun je het in het storyboard bekijken en opnieuw laten maken.
    const zonderBlad = werk.cast.filter((c) => c.portraitUrl && !c.modelSheetUrl);
    if (zonderBlad.length) {
      let klaar = 0;
      setVoortgang(`Personages vastleggen (0/${zonderBlad.length})…`);
      for (const lid of zonderBlad) {
        try {
          const r = await fetch("/api/infographics/dialogue-model-sheet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lid, styleId: werk.styleId, language: werk.language,
              illustrationBrief: werk.illustrationBrief ?? "", seed: werk.seed,
            }),
          });
          const d = await r.json();
          if (!r.ok) {
            if (d.error === "insufficient_credits") { gestopt = creditFout(d); break; }
            // Zonder blad valt dit personage terug op zijn karakter uit de bibliotheek.
            mislukt.push(`personage ${lid.name}`);
          } else if (d.modelSheetUrl) {
            const i = werk.cast.findIndex((c) => c.id === lid.id);
            if (i >= 0) werk.cast[i] = { ...werk.cast[i], modelSheetUrl: d.modelSheetUrl };
          }
        } catch { mislukt.push(`personage ${lid.name}`); }
        klaar++;
        setVoortgang(`Personages vastleggen (${klaar}/${zonderBlad.length})…`);
        setSpec(structuredClone(werk));
      }
    }

    // DAARNA het castblad: iedereen ten voeten uit naast elkaar. Dat is de
    // identiteits- én maatreferentie voor élk beeld dat hierna komt. Zonder dat
    // blad verzint het beeldmodel per scène opnieuw hoe groot iemand is — de
    // reden dat de ene keer Tyrell boven Lily uitstak en de volgende keer andersom.
    // Het castblad hoort uit dezelfde ronde te komen als de personagetekeningen: anders
    // staan er twee versies van hetzelfde personage in de referenties. Gratis voorbereiding.
    if (!werk.castSheetUrl || werk.castSheetVan !== castbladSoort(werk.cast)) {
      setVoortgang("Personages op maat zetten…");
      try {
        const r = await fetch("/api/infographics/dialogue-cast-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cast: werk.cast, styleId: werk.styleId, language: werk.language,
            illustrationBrief: werk.illustrationBrief ?? "", seed: werk.seed,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          if (d.error === "insufficient_credits") gestopt = creditFout(d);
          // Zonder castblad kan de video wél gemaakt worden, alleen minder
          // consistent. Dat is beter dan hier afbreken.
          else mislukt.push("castblad");
        } else {
          werk.castSheetUrl = d.castSheetUrl;
          werk.castSheetVan = castbladSoort(werk.cast);
          setSpec(structuredClone(werk));
        }
      } catch { mislukt.push("castblad"); }
    }
    // Dan één blad per vast voorwerp, zoals het castblad voor de personages. Alleen
    // voor voorwerpen die echt in een scène voorkomen: een blad dat nergens gebruikt
    // wordt is een weggegooide credit.
    if (!gestopt) {
      const nodig = (werk.voorwerpen ?? []).filter(
        (v) => !v.bladUrl && werk.scenes.some((s) => voorwerpenInScene([v], s).length > 0)
      );
      for (const v of nodig) {
        setVoortgang(`Voorwerp vastleggen: ${v.naam}…`);
        // Het castblad bestaat op dit punt al en laat zien in welke look het voorwerp
        // hoort. Het blad van een bibliotheekvoorwerp gaat terug naar de bibliotheek.
        const uit = await tekenVoorwerp(v, tekenContext(werk));
        if ("fout" in uit) {
          if (uit.geenCredits) { gestopt = uit.fout; break; }
          // Zonder blad gaat de beschrijving in woorden nog steeds mee.
          mislukt.push(`voorwerp ${v.naam}`);
        } else {
          v.bladUrl = uit.bladUrl;
          v.bladStijl = uit.bladStijl;
          setSpec(structuredClone(werk));
        }
      }
    }

    // Hier stond een kale `return`, waardoor de knop bij te weinig credits eeuwig
    // op "Bezig…" bleef staan: het afronden hieronder werd nooit bereikt.
    if (gestopt) return gestopt;

    // De beeldregie, vóór de eerste plek getekend wordt: per scène een eigen plekje
    // binnen het gebied, en per regel wat je ziet. Zonder dit werd een wandeling door
    // het bos zeven keer hetzelfde bospad (zie beeldregie.ts). Mislukt het, dan
    // tekenen we met wat er staat: minder precies, maar geen reden om te stoppen.
    if (regieNodig(werk)) {
      setVoortgang("Per shot bepalen wat je ziet…");
      try {
        const r = await fetch("/api/infographics/dialogue-beeldregie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: werk }),
        });
        const d = await r.json();
        if (r.ok && d.regie) {
          werk.scenes = pasRegieToe(werk, leesRegie(d.regie)).scenes;
          setSpec(structuredClone(werk));
        } else {
          mislukt.push("de beeldregie (plekken en beelden per zin)");
        }
      } catch { mislukt.push("de beeldregie (plekken en beelden per zin)"); }
    }

    // Daarna per scène het twee-shot: elke regel is straks een bewerking daarvan.
    // BEWUST één voor één en niet parallel: het eerste twee-shot is het anker voor
    // alle volgende, zodat de personages tussen scènes niet veranderen.
    const zonderShot = werk.scenes.map((s, si) => ({ s, si })).filter(({ s }) => !s.twoShotUrl);
    if (zonderShot.length) {
      let klaar = 0;
      setVoortgang(`Scènes opzetten (0/${zonderShot.length})…`);
      for (const { si } of zonderShot) {
        try {
          const r = await fetch("/api/infographics/dialogue-twoshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(twoShotVerzoek(werk, si)),
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
    return gestopt;
  }

  /**
   * Alleen de basisbeelden maken, zodat je het storyboard kunt bekijken en
   * bijsturen vóór er één clip betaald is.
   */
  async function maakStoryboard(start?: DialogueSpec) {
    const bron = start ?? spec;
    if (!bron) return;
    setRenderBezig(true); setRenderFout(null); setStap(4);
    const werk: DialogueSpec = structuredClone(bron);
    const mislukt: string[] = [];
    let gestopt = await maakBasisbeelden(werk, mislukt);
    // Daarna het beeld per regel: pas dan laat het storyboard zien wat er in de video komt.
    if (!gestopt) gestopt = await maakShotbeelden(werk, mislukt);
    if (gestopt) setRenderFout(gestopt);
    else if (mislukt.length) setRenderFout(`${mislukt.length} onderdeel/onderdelen mislukt: ${mislukt.join(", ")}. Klik nogmaals — alleen die worden opnieuw geprobeerd.`);
    setVoortgang(gestopt || mislukt.length ? "Deels klaar" : "Storyboard staat klaar");
    setRenderBezig(false);
    void bewaar(werk, projectId);
  }

  /**
   * Het beeld per regel, voor het storyboard. Drie tegelijk, net als de clips.
   *
   * Deze beelden werden pas gemaakt samen met stem en clip, dus je zag ze pas als
   * alles al betaald was. De clip hergebruikt nu het beeld dat hier gemaakt en in
   * het storyboard bekeken is.
   */
  async function maakShotbeelden(werk: DialogueSpec, mislukt: string[]): Promise<string | null> {
    const taken: { si: number; li: number }[] = [];
    werk.scenes.forEach((s, si) =>
      s.lines.forEach((l, li) => {
        if (s.twoShotUrl && bruikbareRegel(l) && !l.shotImageUrl) taken.push({ si, li });
      })
    );
    if (taken.length === 0) return null;

    let gestopt: string | null = null;
    let af = 0;
    let volgende = 0;
    setVoortgang(`Beelden per zin (0/${taken.length})…`);
    const werkers = Array.from({ length: Math.min(PARALLEL, taken.length) }, async () => {
      while (volgende < taken.length && !gestopt) {
        const { si, li } = taken[volgende++];
        const regel = werk.scenes[si].lines[li];
        try {
          const r = await fetch("/api/infographics/dialogue-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Een eerdere aanwijzing van de gebruiker over dit shot geldt ook voor een
            // nieuwe versie, bijvoorbeeld nadat de plek opnieuw gemaakt is.
            // Het storyboard is per scène afgerekend; de beelden van de zinnen komen gratis mee.
            body: JSON.stringify(regelVerzoek(werk, si, li, { alleenBeeld: true, beeldInstructie: regel.beeldAanwijzing, doorSceneBetaald: true })),
          });
          const d = await r.json();
          if (!r.ok) {
            if (d.error === "insufficient_credits") gestopt = creditFout(d);
            else mislukt.push(`beeld ${li + 1} van scène ${si + 1}`);
          } else {
            Object.assign(regel, {
              shotImageUrl: d.shotImageUrl,
              sprekerZeker: d.sprekerZeker ?? null,
              beeldWaarschuwingen: d.beeldWaarschuwingen ?? null,
            });
          }
        } catch {
          mislukt.push(`beeld ${li + 1} van scène ${si + 1}`);
        }
        af++;
        setVoortgang(`Beelden per zin (${af}/${taken.length})…`);
        setSpec(structuredClone(werk));
      }
    });
    await Promise.all(werkers);
    return gestopt;
  }

  /**
   * Eén basisbeeld opnieuw maken, met de aanwijzing uit het storyboard.
   *
   * Alleen die scène wordt bijgewerkt (niet de hele spec vervangen): het maken duurt
   * een halve minuut, en wat je intussen elders aanpaste mag niet verdwijnen.
   */
  /**
   * Het houdingenblad van één personage opnieuw tekenen.
   *
   * Dat blad is de tekening die naar elk beeld gaat, dus een fout erin (Leo's rugnummer
   * dat verdween) zit in de hele video. Gratis; het castblad hoort er daarna bij.
   */
  async function bladOpnieuw(id: string) {
    if (!spec) return;
    const lid = spec.cast.find((c) => c.id === id);
    if (!lid) return;
    setBladBezig(id);
    setFout(null);
    try {
      const r = await fetch("/api/infographics/dialogue-model-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lid: { ...lid, modelSheetUrl: null }, styleId: spec.styleId, language: spec.language,
          illustrationBrief: spec.illustrationBrief ?? "", seed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.modelSheetUrl) throw new Error(d?.detail || d?.error || "Blad maken mislukt");
      setSpec((prev) => prev && {
        ...prev,
        cast: prev.cast.map((c) => (c.id === id ? { ...c, modelSheetUrl: d.modelSheetUrl } : c)),
        // Het castblad komt van de bladen: met een nieuw blad hoort er een nieuw castblad.
        castSheetUrl: null,
        castSheetVan: null,
      });
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBladBezig(null);
    }
  }

  async function hertekenScene(si: number, wijziging: HertekenWijziging) {
    if (!spec || hertekenBezig !== null || renderBezig) return;
    const scene = spec.scenes[si];
    if (!scene) return;
    const klaar = scene.lines.filter(regelKlaar).length;
    if (klaar > 0 && !window.confirm(`In deze scène ${klaar === 1 ? "staat 1 clip" : `staan ${klaar} clips`} klaar. Die ${klaar === 1 ? "hoort" : "horen"} bij het oude beeld en ${klaar === 1 ? "wordt" : "worden"} opnieuw gemaakt. Doorgaan?`)) {
      return;
    }

    const velden = {
      setting: wijziging.setting.trim() || scene.setting,
      licht: wijziging.licht,
      beeldAanwijzing: wijziging.aanwijzing.trim() || null,
    };
    const werk: DialogueSpec = structuredClone(spec);
    Object.assign(werk.scenes[si], velden);

    setHertekenBezig(si);
    setRenderFout(null);
    try {
      const r = await fetch("/api/infographics/dialogue-twoshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(twoShotVerzoek(werk, si)),
      });
      const d = await r.json();
      if (!r.ok) { setRenderFout(creditFout(d)); return; }
      if (!d.twoShotUrl) { setRenderFout("Er kwam geen beeld terug. Probeer het nog eens."); return; }
      setSpec((prev) => prev && {
        ...prev,
        scenes: prev.scenes.map((s, i) => i !== si ? s : {
          ...s,
          ...velden,
          twoShotUrl: d.twoShotUrl as string,
          // De stem blijft: de tekst is niet veranderd. Beeld en beweging horen
          // bij het oude basisbeeld en moeten opnieuw.
          lines: s.lines.map((l) => ({ ...l, shotImageUrl: null, videoUrl: null, mouthStart: null, sprekerZeker: null, beeldWaarschuwingen: null })),
        }),
      });
      setExportUrl(null);
    } catch (e) {
      setRenderFout(e instanceof Error ? e.message : String(e));
    } finally {
      setHertekenBezig(null);
    }
  }

  /**
   * Eén beeld per regel opnieuw maken vanuit het storyboard, met de aanwijzing van
   * de gebruiker. De stem blijft staan; een clip die bij het oude beeld hoorde niet.
   */
  async function hertekenRegel(si: number, li: number, aanwijzing: string) {
    if (!spec || renderBezig || hertekenBezig !== null) return;
    const sleutel = `${si}-${li}`;
    if (regelsBezig.includes(sleutel)) return;
    if (!spec.scenes[si]?.twoShotUrl || !spec.scenes[si].lines[li]) return;

    const tekst = aanwijzing.trim() || null;
    const werk: DialogueSpec = structuredClone(spec);
    const heeftBeeld = !!werk.scenes[si].lines[li].shotImageUrl;

    setRegelsBezig((bezig) => [...bezig, sleutel]);
    setRenderFout(null);
    try {
      // "Het kapsel van het rechter poppetje zoals op de andere foto's" ging als losse
      // tekst naar de beeldmaker, die die foto's niet zag. Nu wordt een aanwijzing op
      // een bestaand beeld eerst begrepen mét de andere beelden erbij. Een kleine
      // correctie is dan meteen een bewerking van dit beeld; een grote wijziging wordt
      // opnieuw getekend, met de precieze instructie in plaats van de losse tekst.
      let uitleg: string | null = null;
      let instructie = tekst;
      let nieuw: { shotImageUrl: string; sprekerZeker?: boolean | null; beeldWaarschuwingen?: string[] | null } | null = null;
      if (tekst && heeftBeeld) {
        const r = await fetch("/api/infographics/dialogue-aanwijzing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: werk, si, li, aanwijzing: tekst }),
        });
        const d = await r.json();
        if (!r.ok) { setRenderFout(creditFout(d)); return; }
        uitleg = d.begrepen ?? null;
        instructie = d.instructie || tekst;
        if (d.shotImageUrl) nieuw = { shotImageUrl: d.shotImageUrl };
      }
      if (!nieuw) {
        const r = await fetch("/api/infographics/dialogue-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regelVerzoek(werk, si, li, { alleenBeeld: true, beeldInstructie: instructie })),
        });
        const d = await r.json();
        if (!r.ok) { setRenderFout(creditFout(d)); return; }
        if (!d.shotImageUrl) { setRenderFout("Er kwam geen beeld terug. Probeer het nog eens."); return; }
        nieuw = { shotImageUrl: d.shotImageUrl, sprekerZeker: d.sprekerZeker ?? null, beeldWaarschuwingen: d.beeldWaarschuwingen ?? null };
      }
      const beeld = nieuw;
      // Alleen deze regel bijwerken: intussen kan elders al een ander beeld klaar zijn.
      setSpec((prev) => prev && {
        ...prev,
        scenes: prev.scenes.map((s, i) => i !== si ? s : {
          ...s,
          lines: s.lines.map((l, j) => j !== li ? l : {
            ...l,
            beeldAanwijzing: tekst,
            beeldAanwijzingUitleg: uitleg,
            shotImageUrl: beeld.shotImageUrl,
            sprekerZeker: beeld.sprekerZeker ?? l.sprekerZeker ?? null,
            beeldWaarschuwingen: beeld.beeldWaarschuwingen ?? null,
            videoUrl: null,
            mouthStart: null,
          }),
        }),
      });
      setExportUrl(null);
    } catch (e) {
      setRenderFout(e instanceof Error ? e.message : String(e));
    } finally {
      setRegelsBezig((bezig) => bezig.filter((k) => k !== sleutel));
    }
  }

  /**
   * Een storyboard van vóór de beeldregie opnieuw opzetten: een eigen plek per
   * scène en een beeld per regel. De stemmen blijven staan, want de zinnen zijn
   * hetzelfde; beelden en clips horen bij de oude plekken en gaan eruit.
   */
  function storyboardOpnieuwOpzetten() {
    if (!spec || renderBezig || hertekenBezig !== null || regelsBezig.length > 0) return;
    const nieuw: DialogueSpec = {
      ...spec,
      scenes: spec.scenes.map((s) => ({
        ...s,
        twoShotUrl: null,
        // Een aanwijzing over de oude plek ("de boom links") klopt niet meer bij een nieuwe.
        beeldAanwijzing: null,
        gebied: null,
        wereld: null,
        geregisseerd: null,
        lines: s.lines.map((l) => ({
          ...l, beeld: null, beeldAanwijzing: null, shotImageUrl: null,
          videoUrl: null, mouthStart: null, sprekerZeker: null, beeldWaarschuwingen: null,
        })),
      })),
    };
    const clips = spec.scenes.flatMap((s) => s.lines).filter((l) => l.videoUrl).length;
    const credits = schatStoryboardCredits(nieuw);
    if (!window.confirm(
      `Alle beelden worden opnieuw gemaakt, met een eigen plek per scène en een beeld per zin ` +
      `(ongeveer ${creditTekst(credits)})${clips ? `. De ${clips === 1 ? "clip die er staat, verdwijnt" : `${clips} clips die er staan, verdwijnen`}` : ""}. ` +
      `De stemmen blijven. Doorgaan?`
    )) return;
    setSpec(nieuw);
    setExportUrl(null);
    void maakStoryboard(nieuw);
  }

  /**
   * Alle stemmen vooraf, per stem in één opname.
   *
   * Zinnen die los werden ingesproken klonken elk net anders, ook van hetzelfde
   * personage. Mislukt dit, dan is dat geen stopper: de regels die nog geen stem
   * hebben, spreken bij hun eigen clip los in, zoals voorheen.
   */
  async function maakStemmen(werk: DialogueSpec): Promise<string | null> {
    const regels = werk.scenes
      .flatMap((s, si) => s.lines.map((l, li) => ({ l, sleutel: `${si}-${li}` })))
      .filter(({ l }) => heeftStem(l) && !l.audioUrl && !regelKlaar(l));
    if (regels.length === 0) return null;
    setVoortgang(`Stemmen inspreken (${regels.length} zinnen)…`);
    try {
      const r = await fetch("/api/infographics/dialogue-stemmen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regels: regels.map(({ l, sleutel }) => ({ sleutel, characterId: l.characterId, text: l.text })),
          cast: werk.cast, narratorVoice: werk.narratorVoice ?? null, language: werk.language,
        }),
      });
      const d = await r.json();
      if (!r.ok) return d.error === "insufficient_credits" ? creditFout(d) : null;
      for (const { l, sleutel } of regels) {
        const stem = d.stemmen?.[sleutel];
        if (stem?.audioUrl) Object.assign(l, { audioUrl: stem.audioUrl, audioDuration: stem.audioDuration });
      }
      setSpec(structuredClone(werk));
    } catch {
      // Terugval: per regel inspreken.
    }
    return null;
  }

  // ---------- Video maken ----------
  async function maakVideo() {
    if (!spec) return;
    setRenderBezig(true); setRenderFout(null); setExportUrl(null); setStap(5);

    const werk: DialogueSpec = structuredClone(spec);
    const mislukt: string[] = [];
    // Wat het storyboard nog niet had, wordt hier alsnog gemaakt.
    let gestopt = await maakBasisbeelden(werk, mislukt);
    if (!gestopt) gestopt = await maakStemmen(werk);

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
            // Het beeld uit het storyboard gaat mee: de clip brengt dát in beweging, in
            // plaats van een nieuw beeld te tekenen dat niemand gezien heeft.
            // Ontbreekt het beeld nog, dan valt het onder de credit per scène.
            const verzoek = JSON.stringify(regelVerzoek(werk, si, li, { hergebruikBeeld: regel.shotImageUrl, doorSceneBetaald: true }));
            const stuur = () => fetch("/api/infographics/dialogue-line", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: verzoek,
            });
            let r = await stuur();
            // Vier regels mislukten met "Unauthorized" terwijl Sam ingelogd was: de
            // inlogcontrole kreeg door een haperende verbinding geen antwoord. Die
            // controle komt vóór het maken en afschrijven, dus één keer opnieuw kost niets.
            if (r.status === 401) {
              await new Promise((klaar) => setTimeout(klaar, 2000));
              r = await stuur();
            }
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
      // Loopt de server over zijn tijd of geheugen, dan stuurt Vercel een kale
      // tekstpagina ("An error occurred…") in plaats van JSON.
      const d = await res.json().catch(() => null);
      if (!d) throw new Error("Het exporteren is onderweg afgebroken. Probeer het nog een keer; lukt het dan weer niet, laat het ons weten.");
      if (!res.ok) throw new Error(creditFout(d));
      setExportUrl(d.url as string);
    } catch (e) {
      setExportFout(e instanceof Error ? e.message : String(e));
    } finally { setExportBezig(false); }
  }

  /**
   * Vraagt de achterkant wat er mis is met dit fragment. Null = geen antwoord; dan
   * wordt alleen de beweging opnieuw gemaakt en blijft het beeld staan.
   */
  async function vraagDiagnose(werk: DialogueSpec, si: number, li: number): Promise<FragmentDiagnose | null> {
    const scene = werk.scenes[si];
    try {
      const r = await fetch("/api/infographics/dialogue-diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regel: scene.lines[li],
          setting: scene.setting,
          cast: sceneCast(scene, werk.cast, werk.verhaallijn),
        }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return (d.diagnose as FragmentDiagnose | undefined) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Maakt één of meer regels opnieuw, en alleen het deel dat kapot is.
   *
   * Eerst kijkt de achterkant wat er mis is (vraagDiagnose): zit de fout al in het
   * bronbeeld, dan komt er een nieuw beeld met een gerichte aanwijzing; anders
   * alleen een nieuwe beweging en blijft het beeld staan. De stem blijft altijd
   * staan zolang de tekst niet veranderd is — die klinkt dan gelijk aan de rest.
   *
   * Meerdere regels lopen drie tegelijk, net als bij het maken van de video. Alle
   * uitkomsten landen in één werkkopie: los van elkaar opgeslagen zou de laatste
   * regel die klaar is de andere weer overschrijven met hun oude versie.
   */
  async function herstelRegels(taken: RegelPlek[]) {
    if (!spec || herstelBezig.length > 0 || taken.length === 0) return;
    const werk: DialogueSpec = structuredClone(spec);
    const geldig = taken.filter(({ si, li }) => werk.scenes[si]?.twoShotUrl && werk.scenes[si]?.lines[li]);
    if (geldig.length === 0) return;

    setHerstelBezig(geldig.map(({ si, li }) => `${si}-${li}`));
    setRenderFout(null);
    let gestopt: string | null = null;
    const mislukt: string[] = [];
    let volgende = 0;

    const werkers = Array.from({ length: Math.min(PARALLEL, geldig.length) }, async () => {
      while (volgende < geldig.length && !gestopt) {
        const { si, li } = geldig[volgende++];
        const scene = werk.scenes[si];
        const regel = scene.lines[li];
        try {
          const diagnose = regel.videoUrl || regel.shotImageUrl ? await vraagDiagnose(werk, si, li) : null;
          const nieuwBeeld = !regel.shotImageUrl || diagnose?.opnieuw === "beeld";
          const hergebruikBeeld = nieuwBeeld ? undefined : regel.shotImageUrl ?? undefined;
          // De stem gaat mee via regelVerzoek. Bij een gewijzigde tekst is audioUrl al
          // leeg, en spreekt de regel zelf in.

          const r = await fetch("/api/infographics/dialogue-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Dezelfde mensen, hetzelfde kader, licht en camerawerk als bij het eerste
            // maken: het komt uit hetzelfde verzoek (regelVerzoek).
            body: JSON.stringify(regelVerzoek(werk, si, li, {
              hergebruikBeeld,
              // Alleen bij een bestaand beeld dat afgekeurd is: zonder beeld wordt er
              // sowieso een nieuw getekend, en dan is er niets om te corrigeren.
              beeldInstructie: nieuwBeeld && regel.shotImageUrl
                ? diagnose?.beeldAanwijzing || "Draw this shot again and get the people, their places and the location exactly right."
                : undefined,
              bewegingInstructie: diagnose?.bewegingAanwijzing,
            })),
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
            setSpec(structuredClone(werk));
          }
        } catch {
          mislukt.push(`regel ${li + 1} van scène ${si + 1}`);
        }
        setHerstelBezig((bezig) => bezig.filter((k) => k !== `${si}-${li}`));
      }
    });
    await Promise.all(werkers);

    if (gestopt) setRenderFout(gestopt);
    else if (mislukt.length) setRenderFout(`${mislukt.length} niet gelukt: ${mislukt.join(", ")}. Probeer die nog een keer.`);
    setHerstelBezig([]);
    setExportUrl(null);
    void bewaar(werk, projectId);
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

  // Wie het adres kent maar nog geen toegang heeft, ziet dit in plaats van de tool; de
  // API-routes weigeren hem hoe dan ook.
  if (toegang === false) {
    return (
      <div className="max-w-[980px] mx-auto p-6">
        <h1 className="text-xl font-bold text-white mb-2">Dialoogmodus</h1>
        <p className="text-sm text-slate-400">
          Deze tool is nog niet beschikbaar. <Link href="/dashboard" className="underline hover:text-white">Terug naar je projecten</Link>
        </p>
      </div>
    );
  }

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
      {bewaarFout && <p className="text-[11px] text-amber-300 mb-4">{bewaarFout}</p>}

      <div className="flex items-center gap-2 mb-6 text-[11px]">
        {([[1, "Idee"], [2, "Opzet"], [3, "Draaiboek"], [4, "Storyboard"], [5, "Video"]] as const).map(([n, label]) => (
          <button
            key={n}
            onClick={() => { if (n === 1 || (n === 2 ? setup : spec)) setStap(n as Stap); }}
            disabled={n === 2 ? !setup : n !== 1 && !spec}
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
          <DialogueChat
            onPlan={ontvangPlan}
            onOpzet={ontvangOpzet}
            heeftPersonages={heeftPersonages}
            lengte={lengte}
            onLengte={setLengte}
          />
          <p className="text-[11px] text-slate-600">
            De assistent stelt een complete opzet voor: personages uit je <Link href="/characters" className="text-slate-500 underline hover:text-slate-300">bibliotheek</Link> met hun rollen — en past daar niemand bij het verhaal, dan tekent hij ze zelf —
            de kernboodschap, de wending, toon en tekenstijl. Die opzet stel je zelf bij vóór er één regel geschreven wordt. Denken kost vrijwel niets; pas bij het maken van de video gaat er geld op.
          </p>
        </div>
      )}

      {/* ---------- Stap 2: de opzet ---------- */}
      {stap === 2 && setup && (
        <SetupPanel
          setup={setup}
          onChange={setSetup}
          onGenereer={schrijfDraaiboek}
          onOpnieuwVoorstellen={opnieuwVoorstellen}
          bezig={schrijfBezig}
          voorstelBezig={setupBezig}
          credits={CREDIT_COSTS.SCRIPT_GENERATION}
          onTekenVoorwerpen={tekenVoorwerpenInOpzet}
          voorwerpTekenBezig={voorwerpTekenBezig}
        />
      )}

      {/* ---------- Stap 3: het draaiboek ---------- */}
      {stap === 3 && spec && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">{spec.title}</h2>
              <p className="text-[11px] text-slate-500">
                Pas aan wat je wilt. Verander je een zin of de spreker, dan wordt die clip opnieuw gemaakt.
              </p>
            </div>
            {/* Eerst het storyboard: voor een paar credits per scène zie je of de beelden
                kloppen, vóór je per regel voor stem, beeld en beweging betaalt. */}
            <div className="flex flex-col items-end gap-1 shrink-0">
              {spec.scenes.every((s) => s.twoShotUrl) ? (
                <button onClick={() => setStap(4)} disabled={renderBezig}
                  className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition">
                  Naar het storyboard
                </button>
              ) : (
                <button onClick={() => void maakStoryboard()} disabled={renderBezig}
                  className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition">
                  Storyboard maken ({creditTekst(schatStoryboardCredits(spec))})
                </button>
              )}
              <button onClick={maakVideo} disabled={renderBezig}
                className="text-[11px] text-slate-400 hover:text-white underline disabled:opacity-40">
                of meteen de hele video ({creditTekst(schatCredits(spec))})
              </button>
            </div>
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
                onStyle={(id) => {
                  // Getekende voorwerpen horen bij de vorige stijl: die worden een voorbeeld
                  // en het storyboard tekent ze opnieuw. Zie voorwerpenVoorStijl.
                  const werk = {
                    ...spec,
                    styleId: id,
                    voorwerpen: spec.voorwerpen && voorwerpenVoorStijl(spec.voorwerpen, id, { vorigeStijl: spec.styleId ?? DEFAULT_STORY_STYLE }),
                  };
                  setSpec(werk);
                  void voorwerpenInStijl(werk);
                }}
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

          {/* De voorwerpen stonden onder de dichtgeklapte beeldregie, en daar zag niemand
              dat de lijst leeg was — ook niet in een verhaal over een bloem en een grote boom. */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium text-white">Voorwerpen</h3>
              <button
                onClick={() => void zoekVoorwerpen()}
                disabled={renderBezig || voorwerpenBezig || (spec.voorwerpen?.length ?? 0) >= MAX_VOORWERPEN}
                className="text-[11px] rounded px-2.5 py-1 bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition"
              >
                {voorwerpenBezig ? "Zoeken…" : "Voorwerpen uit het draaiboek halen"}
              </button>
            </div>
            {voorwerpenMelding && <p className="text-[11px] text-slate-400 mb-1.5">{voorwerpenMelding}</p>}
            <VasteVoorwerpen
              voorwerpen={spec.voorwerpen ?? []}
              onChange={(v) => setSpec({ ...spec, voorwerpen: v.length ? v : null })}
              styleId={spec.styleId}
              onTeken={tekenVoorwerpenInDraaiboek}
              tekenBezig={voorwerpTekenBezig}
              disabled={renderBezig || voorwerpenBezig}
            />
          </div>

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

      {/* ---------- Stap 4: het storyboard ---------- */}
      {stap === 4 && spec && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">Storyboard</h2>
              <p className="text-[11px] text-slate-500">
                Per scène het beeld van de plek, met daarnaast één beeld per zin: dat is precies wat er straks beweegt.
                Klopt een beeld niet, geef dan een aanwijzing en maak alleen dat beeld opnieuw. Pas als het bord klopt, maak je de clips.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {spec.scenes.some((s) => !s.twoShotUrl || s.lines.some((l) => bruikbareRegel(l) && !l.shotImageUrl)) && (
                <button onClick={() => void maakStoryboard()} disabled={renderBezig || hertekenBezig !== null || regelsBezig.length > 0}
                  className="text-sm rounded px-4 py-2 bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition">
                  {renderBezig ? "Bezig…" : `Ontbrekende beelden maken (${creditTekst(schatStoryboardCredits(spec))})`}
                </button>
              )}
              {/* Ook voor borden die al geregisseerd zijn: die kunnen nog gemaakt zijn
                  met eerdere beelden als voorbeeld, en dan zijn ze overbelicht. */}
              {spec.scenes.some((s) => s.twoShotUrl) && !spec.scenes.some((s) => s.twoShotUrl && !s.geregisseerd) && (
                <button onClick={storyboardOpnieuwOpzetten} disabled={renderBezig || hertekenBezig !== null || regelsBezig.length > 0}
                  className="text-sm rounded px-4 py-2 bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 disabled:opacity-40 transition">
                  Opnieuw opzetten
                </button>
              )}
              <button onClick={maakVideo} disabled={renderBezig || hertekenBezig !== null || regelsBezig.length > 0}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition">
                Clips maken ({creditTekst(schatCredits(spec))})
              </button>
            </div>
          </div>
          {/* De tekening die naar elk beeld gaat. Zie je hier iets fouts (een ontbrekend
              rugnummer, een verkeerde pet), maak hem dan opnieuw: dan is hij in het hele
              storyboard goed. */}
          {spec.cast.some((c) => c.modelSheetUrl) && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
              <p className="text-[11px] text-slate-400 mb-2">
                Zo staan je personages in elk beeld. Klopt er iets niet? Maak het blad opnieuw (gratis); daarna maak je de beelden opnieuw.
              </p>
              <div className="flex flex-wrap gap-3">
                {spec.cast.filter((c) => c.modelSheetUrl).map((c) => (
                  <div key={c.id} className="w-64">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.modelSheetUrl ?? ""} alt={c.name} className="w-full rounded border border-white/10 bg-slate-900/60" />
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[11px] text-slate-300 truncate">{c.name}</span>
                      <button
                        onClick={() => void bladOpnieuw(c.id)}
                        disabled={bladBezig !== null || renderBezig || regelsBezig.length > 0}
                        className="text-[11px] text-slate-400 hover:text-white underline disabled:opacity-40"
                      >
                        {bladBezig === c.id ? "Bezig…" : "↻ Opnieuw"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Een storyboard van vóór de beeldregie: alle scènes op dezelfde plek en
              geen beeld per zin. Aanvullen zou de oude plekken laten staan. */}
          {spec.scenes.some((s) => s.twoShotUrl && !s.geregisseerd) && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/[0.06] px-3 py-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] text-amber-200 flex-1 min-w-0">
                Dit storyboard is gemaakt vóór de plekken en beelden per zin. Zet je het opnieuw op, dan krijgt elke scène een eigen plek en zie je per zin wat er in beeld komt.
              </p>
              <button onClick={storyboardOpnieuwOpzetten} disabled={renderBezig || hertekenBezig !== null || regelsBezig.length > 0}
                className="text-xs rounded px-3 py-1.5 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 border border-amber-400/30 disabled:opacity-40 transition">
                Storyboard opnieuw opzetten
              </button>
            </div>
          )}
          {(voortgang || renderFout) && (
            <p className={`text-xs ${renderFout ? "text-red-400" : "text-slate-400"}`}>{renderFout || voortgang}</p>
          )}
          <button onClick={() => setStap(3)} className="text-xs text-orange-300 hover:text-orange-200 underline">
            ← Terug naar het draaiboek
          </button>
          <Storyboard
            spec={spec}
            onOpnieuw={hertekenScene}
            onRegelOpnieuw={(si, li, aanwijzing) => void hertekenRegel(si, li, aanwijzing)}
            bezigMet={hertekenBezig}
            regelsBezig={regelsBezig}
            disabled={renderBezig}
          />
        </div>
      )}

      {/* ---------- Stap 5: de video ---------- */}
      {stap === 5 && spec && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={maakVideo} disabled={renderBezig}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-medium rounded px-4 py-2 transition">
              {renderBezig ? "Bezig…" : klaarAantal === alleRegels.length ? "Alles staat klaar" : `Verder maken (${creditTekst(schatCredits(spec))})`}
            </button>
            <span className="text-xs text-slate-400">
              {klaarAantal}/{alleRegels.length} regels klaar {voortgang && `· ${voortgang}`}
            </span>
          </div>
          {renderFout && <p className="text-xs text-red-400">{renderFout}</p>}
          <p className="text-[11px] text-slate-500">
            Per regel brengen we het beeld uit het storyboard in beweging, met de stem erbij. Ontbreekt dat beeld nog, dan wordt het eerst gemaakt. Reken op een halve minuut per regel.
          </p>

          {/* Er gaat altijd wel iets mis bij AI-beeld. Vanuit de video moet je in
              één klik terug kunnen naar het draaiboek om één regel of één hele
              scène opnieuw te laten maken. */}
          <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Iets verkeerd uitgepakt?</span>
            <button onClick={() => setStap(3)} className="text-xs text-orange-300 hover:text-orange-200 underline">
              Terug naar het draaiboek
            </button>
            <button onClick={() => setStap(4)} className="text-xs text-orange-300 hover:text-orange-200 underline">
              naar het storyboard
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
                  Klopt er iets niet? Druk op opnieuw: er wordt eerst gekeken wat er mis is, en alleen dat deel wordt opnieuw gemaakt. Vink meerdere regels of een hele scène aan om ze in één keer opnieuw te maken. Het beeld van een hele scène pas je aan in het storyboard.
                </p>
                <FragmentEditor
                  spec={spec}
                  onSpec={setSpec}
                  onOpnieuw={herstelRegels}
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
