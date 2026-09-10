"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SceneOverlay from "@/components/infographics/render/StoryScene";
import EditableStoryScene from "@/components/infographics/render/EditableStoryScene";
import OverheidSceneView from "@/components/infographics/render/OverheidSceneView";
import SceneChat from "@/components/infographics/story/SceneChat";
import StoryPlayer from "@/components/infographics/render/StoryPlayer";
import PdfUploadButton from "@/components/infographics/PdfUploadButton";
import { splitVoiceDurations, storyWindows } from "@/lib/infographics/story-layout";
import { storyAspectRatio } from "@/lib/infographics/canvas-size";
import { DEFAULT_STORY_STYLE } from "@/lib/infographics/story-style";
import StylePicker from "@/components/style/StylePicker";
import BibliotheekKiezer from "@/components/characters/BibliotheekKiezer";
import { createClient } from "@/lib/supabase/client";
import { isAdminAccount } from "@/lib/studio/access";
import type { StorySpec } from "@/lib/infographics/story-schema";
import { DEFAULT_VOICE, voicePreviewUrl, voicesForLanguage, voiceForLanguage } from "@/lib/infographics/story-voices";
import { CREDIT_COSTS, creditLabel } from "@/lib/credit-costs";
import { STORY_FONTS, DEFAULT_STORY_FONT, nearestStoryFont, STORY_FONTS_CSS_HREF } from "@/lib/infographics/story-fonts";
import { tekstInBeeldAan, castRefsVanSpec, castRefsVoorScene, MAX_CAST_REFS } from "@/lib/infographics/story-schema";
import type { StoryCastRef } from "@/lib/infographics/story-schema";
import { MusicPickerButton } from "@/components/music/MusicPicker";
import { findMusicTrackByUrl } from "@/lib/music/library";
import type { BrandKit } from "@/lib/types";
import type { StoryScene, SceneChatMessage } from "@/lib/infographics/story-schema";

// Storytelling-infographic generator: onderwerp + brontekst in, AI schrijft een
// verhaalboog en genereert per scene een platte illustratie; de typografie ligt
// er in SVG overheen.

// ~6 seconden per scene (praktijk: 5-7s). Gebruikt voor de live lengteschatting.
const SECS_PER_SCENE = 6;
const LANGUAGES = ["Nederlands", "Vlaams", "Engels", "Duits", "Frans", "Spaans", "Italiaans"];

// Vriendelijke foutmelding uit een API-antwoord; vangt het 402-creditgeval af.
function apiError(d: { error?: string; detail?: string; required?: number; credits?: number } | undefined, fallback: string): string {
  if (d?.error === "insufficient_credits")
    return `Onvoldoende credits: deze stap kost ${d.required} credits en je hebt er ${d.credits ?? 0}. Vul je saldo aan via Prijzen.`;
  const base = d?.error || fallback;
  // Toon ook de technische detail (helpt bij diagnose van export-fouten e.d.).
  return d?.detail && d.detail !== d.error ? `${base} — ${d.detail}` : base;
}

// Nederlandse basiskleuren -> RGB. Langere/specifiekere namen (bijv. nachtblauw)
// moeten vóór de algemene (blauw) gematcht worden; daarom sorteren we op lengte.
const DUTCH_BASE: Record<string, [number, number, number]> = {
  rood: [229, 57, 53], blauw: [30, 136, 229], groen: [67, 160, 71], geel: [253, 216, 53],
  oranje: [251, 140, 0], paars: [142, 36, 170], roze: [236, 64, 122], bruin: [109, 76, 65],
  grijs: [158, 158, 158], zwart: [22, 22, 22], wit: [255, 255, 255], beige: [232, 224, 200],
  creme: [255, 250, 235], crème: [255, 250, 235], turquoise: [26, 188, 156], turkoois: [26, 188, 156],
  petrol: [0, 109, 119], nachtblauw: [13, 27, 62], goud: [212, 175, 55], zilver: [192, 192, 192],
};
const DUTCH_KEYS = Object.keys(DUTCH_BASE).sort((a, b) => b.length - a.length);

// Vertaalt een Nederlandse kleurnaam (incl. modifiers donker/licht/diep/fel) naar
// hex. Geeft null als er geen basiskleur in de tekst zit.
function dutchColorToHex(str: string): string | null {
  const s = str.toLowerCase();
  const key = DUTCH_KEYS.find((k) => s.includes(k));
  if (!key) return null;
  let [r, g, b] = DUTCH_BASE[key];
  if (/donker|diep/.test(s)) { r = Math.round(r * 0.62); g = Math.round(g * 0.62); b = Math.round(b * 0.62); }
  else if (/licht|zacht/.test(s)) { r = Math.round(r + (255 - r) * 0.55); g = Math.round(g + (255 - g) * 0.55); b = Math.round(b + (255 - b) * 0.55); }
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Haalt een geldige #rrggbb-kleur uit een (vrij ingevuld) huisstijl-kleurveld.
// Huisstijlkleuren zijn vrije tekst: "donkerblauw (#1a3c6e)", "#abc", "navy",
// "rgb(10,20,30)" of een Nederlandse naam ("donkergrijs"). null als onbekend.
function toHex(raw?: string | null): string | null {
  if (!raw) return null;
  const str = raw.trim();
  // 1) Een hex ergens in de tekst (ook tussen haakjes).
  const m = str.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
  if (m) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return "#" + h;
  }
  // 2) De browser een CSS-kleurnaam/rgb laten herleiden via canvas. Twee
  // verschillende startkleuren: blijft de waarde gelijk, dan was de invoer geldig.
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000000"; ctx.fillStyle = str; const a = ctx.fillStyle;
      ctx.fillStyle = "#ffffff"; ctx.fillStyle = str; const b = ctx.fillStyle;
      if (a === b && /^#[0-9a-f]{6}$/i.test(a as string)) return (a as string).toLowerCase();
    }
  } catch {}
  // 3) Nederlandse kleurnaam.
  return dutchColorToHex(str);
}

function SceneField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-slate-400 mb-0.5">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white" />
    </label>
  );
}

export default function StoryPage() {
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  // Serie-generatie: voorgestelde losse "afleveringen" uit het onderwerp/de bron.
  const [episodes, setEpisodes] = useState<{ title: string; angle: string; brief: string }[]>([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  // "Tekst uit webpagina": URL waarvan de brontekst wordt opgehaald.
  const [pageUrl, setPageUrl] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [mode, setMode] = useState<"story" | "report" | "overheid">("story");
  // De Overheidsstijl is nog in aanbouw: hij tekent zijn scenes zelf en die
  // bibliotheek is nog te klein om klanten mee te laten werken. Daarom staat hij
  // alleen in het menu op interne accounts, net als de andere tools die nog niet
  // af zijn (zie lib/studio/access.ts).
  const [intern, setIntern] = useState(false);
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [styleId, setStyleId] = useState<string>(DEFAULT_STORY_STYLE);
  const [language, setLanguage] = useState<string>("Nederlands");
  const [tone, setTone] = useState<"zakelijk" | "speels" | "energiek">("zakelijk");
  const [angle, setAngle] = useState("");
  // De cast van dit verhaal: de personages die de gebruiker zelf vastlegt, elk
  // met een eigen rol. Eerder kon er maar één mee, waardoor je bij een video met
  // een monteur én een klant de halve cast aan het beeldmodel moest overlaten.
  const [castRefs, setCastRefs] = useState<StoryCastRef[]>([]);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [kiezerOpen, setKiezerOpen] = useState(false);
  // Gewenste videolengte in seconden; bepaalt hoeveel scenes de AI maakt.
  const [targetSeconds, setTargetSeconds] = useState(90);
  const [navy, setNavy] = useState("#16243f");
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_STORY_FONT);
  // Tekst in beeld: koppen, accentwoorden en grote getallen. Uit voor nieuwe
  // verhalen, aan zodra een bestaand verhaal die tekst al heeft — anders zou een
  // klant die er weken aan gewerkt heeft haar werk kwijtraken.
  const [tekstInBeeld, setTekstInBeeld] = useState(false);
  const [accent, setAccent] = useState("#e8643c");
  // Huisstijl-typografie (uit de brand kit; met keuze/override) en het logo, dat
  // de gebruiker zelf uploadt (niet uit de website of brand kit).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  // Huisstijlen van de gebruiker; bij keuze worden de tekst-/accentkleur en het
  // font automatisch overgenomen. Een huisstijl kan ook uit een website worden
  // gehaald (AI-extractie) en wordt dan als brand kit toegevoegd.
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [brandKitId, setBrandKitId] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [brandBusy, setBrandBusy] = useState(false);

  const [spec, setSpec] = useState<StorySpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState<Record<string, boolean>>({});
  // Beeldhistorie per scene (vorige imageUrls) → "vorige versie" terugzetten.
  // Referentiefoto per scène (sceneId → publieke URL van het geüploade product/logo).
  const [motionInstr, setMotionInstr] = useState<Record<string, string>>({});
  const [voiceBusy, setVoiceBusy] = useState(false);
  // Gekozen stem voor de voice-over + de stem die nu (als preview) speelt.
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  // Spreeksnelheid van de voice-over (ElevenLabs); 1 = normaal.
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  // Terugkoppeling na een autosync: hoe goed de scenegrenzen op de audio vielen.
  const [syncNote, setSyncNote] = useState<{ tekst: string; waarschuwing: boolean } | null>(null);
  // Eigen ingesproken voice-over uploaden.
  const [voiceUploadBusy, setVoiceUploadBusy] = useState(false);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const [motionBusy, setMotionBusy] = useState<Record<string, boolean>>({});
  // Scenes waarvan het kritische oog élke poging afkeurde omdat er iets werd
  // toegevoegd. Die blijven staan (met camerabeweging in player en export).
  const [motionSkipped, setMotionSkipped] = useState<Record<string, string>>({});
  // Korte terugkoppeling van de automatische bewegings-controle (kritisch oog).
  const [motionNote, setMotionNote] = useState<Record<string, string>>({});
  const [animatingAll, setAnimatingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Persistentie: het verhaal hangt aan een project (mode 'story'). Het project
  // wordt automatisch aangemaakt zodra er een verhaal is — de gebruiker hoeft
  // nergens op te klikken. Eerder moest dat wél, en wie dat vergat raakte al zijn
  // beelden en animaties kwijt.
  const [projectId, setProjectId] = useState<string | null>(null);
  // Slot: voorkomt dat twee gelijktijdige autosaves elk een eigen project aanmaken.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  // Bewaar het verhaal. Kleuren reizen mee in de spec zodat een herladen verhaal
  // er identiek uitziet. Geeft het (eventueel nieuwe) project-id terug.
  const save = useCallback(
    async (silent = false): Promise<string | null> => {
      if (!spec) return null;
      // Loopt er al een opslag? Dan die afwachten: anders maken twee tegelijk
      // lopende autosaves allebei een nieuw project aan.
      if (savingRef.current) return projectId;
      savingRef.current = true;
      if (!silent) setSaving(true);
      try {
        const specToSave: StorySpec = { ...spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled, tekstInBeeld };
        const res = await fetch("/api/infographics/save-story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, title: topic || spec.title, spec: specToSave }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Opslaan mislukt");
        if (d.id && d.id !== projectId) {
          setProjectId(d.id);
          // URL bijwerken zodat een refresh of gedeelde link het verhaal herlaadt.
          window.history.replaceState(null, "", `/infographics/story?project=${d.id}`);
        }
        setSavedAt(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
        return d.id as string;
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        savingRef.current = false;
        if (!silent) setSaving(false);
      }
    },
    [spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled, tekstInBeeld, projectId, topic]
  );

  // Een verhaal laden uit ?project=id (na een refresh of vanuit het overzicht).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    setLoadingProject(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("projects")
          .select("story_spec")
          .eq("id", id)
          .eq("mode", "story")
          .single();
        if (error || !data?.story_spec) throw new Error(error?.message ?? "Verhaal niet gevonden");
        const loaded = data.story_spec as StorySpec;
        setSpec(loaded);
        setProjectId(id);
        if (loaded.title) setTopic(loaded.title);
        if (loaded.navy) setNavy(loaded.navy);
        if (loaded.fontFamily) setFontFamily(loaded.fontFamily);
        // Bestaand verhaal met koppen erin: die tekst hoort gewoon te blijven staan.
        setTekstInBeeld(tekstInBeeldAan(loaded));
        if (loaded.accent) setAccent(loaded.accent);
        if (loaded.voice) setVoice(loaded.voice);
        if (loaded.voiceSpeed) setVoiceSpeed(loaded.voiceSpeed);
        if (loaded.logoUrl) setLogoUrl(loaded.logoUrl);
        if (typeof loaded.logoEnabled === "boolean") setLogoEnabled(loaded.logoEnabled);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingProject(false);
      }
    })();
  }, []);

  // Debounced autosave. Er is bewust GEEN "eerst zelf bewaren"-drempel: zodra er
  // een verhaal bestaat wordt het project aangemaakt en daarna bij elke wijziging
  // (nieuw beeld, animatie, voice-over) stil bijgewerkt, ~1,5s na de laatste
  // verandering. Tijdens het laden van een bestaand verhaal slaan we niets op.
  useEffect(() => {
    if (!spec || loadingProject) return;
    const t = setTimeout(() => { void save(true); }, 1500);
    return () => clearTimeout(t);
  }, [spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled, tekstInBeeld, projectId, loadingProject, save]);

  // Vangnet: waarschuw alleen als er nog écht een opslag onderweg is bij het
  // wegklikken. Normaal is er niets te verliezen, want alles is al bewaard.
  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (savingRef.current) e.preventDefault();
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  // Huisstijlen van de gebruiker ophalen (voor de stem-/kleurkeuze in stap 1).
  useEffect(() => {
    fetch("/api/brand-kits")
      .then((r) => (r.ok ? r.json() : { brandKits: [] }))
      .then((d) => setBrandKits((d.brandKits ?? []) as BrandKit[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setIntern(isAdminAccount(data.user?.email)))
      .catch(() => setIntern(false));
  }, []);

  // Past een brand kit toe: hoofdkleur ← primair (val terug op secundair) en
  // accent ← accent. Die twee sturen het kleurpalet van de illustraties. Alles
  // blijft daarna handmatig overschrijfbaar. Het logo komt NIET uit de kit maar uploadt de
  // gebruiker zelf; een reeds geüpload logo laten we hier dus staan.
  function applyKit(kit: BrandKit) {
    const text = toHex(kit.colors?.primary) || toHex(kit.colors?.secondary);
    const acc = toHex(kit.colors?.accent) || toHex(kit.colors?.secondary);
    if (text) setNavy(text);
    if (acc) setAccent(acc);
    setFontFamily(nearestStoryFont(kit.fonts?.primary));
  }

  // Kiest een huisstijl uit de dropdown en neemt hem over. Lege keuze laat alles staan.
  function applyBrandKit(id: string) {
    setBrandKitId(id);
    const kit = brandKits.find((k) => k.id === id);
    if (kit) applyKit(kit);
  }

  // Haalt de huisstijl (kleuren, font, logo) uit een website via AI, maakt er een
  // brand kit van, voegt die toe aan de lijst en past hem meteen toe.
  async function extractFromWebsite() {
    const url = brandUrl.trim();
    if (!url) return;
    setErr(null);
    setBrandBusy(true);
    try {
      const res = await fetch("/api/brand-kits/from-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Huisstijl ophalen mislukt"));
      const kit = d.brandKit as BrandKit;
      setBrandKits((prev) => [kit, ...prev]);
      setBrandKitId(kit.id);
      applyKit(kit);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBrandBusy(false);
    }
  }

  // Uploadt een zelfgekozen logobestand, host het en zet het als actief logo.
  async function uploadLogo(file: File) {
    setErr(null);
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/infographics/upload-logo", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Logo uploaden mislukt"));
      setLogoUrl(d.logoUrl as string);
      setLogoEnabled(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  // De cast vastleggen. Ook in een al gegenereerd draaiboek, want daar wint de
  // spec bij het maken van scènebeelden — zonder dit zou een rol die je ná het
  // genereren aanpast stil genegeerd worden. De oude enkel-personage-velden gaan
  // leeg mee: anders zou een bestaand verhaal dat je hier leegmaakt zijn oude
  // mascotte via de terugval in castRefsVanSpec terugkrijgen.
  function zetCast(volgende: StoryCastRef[]) {
    const beperkt = volgende.slice(0, MAX_CAST_REFS);
    setCastRefs(beperkt);
    setSpec((prev) =>
      !prev ? prev : { ...prev, castRefs: beperkt, characterUrl: null, characterRole: null }
    );
  }

  function voegCastLidToe(lid: StoryCastRef) {
    if (castRefs.length >= MAX_CAST_REFS) {
      setErr(`Je kunt maximaal ${MAX_CAST_REFS} personages vastleggen.`);
      return;
    }
    if (castRefs.some((r) => r.url === lid.url)) return;
    zetCast([...castRefs, lid]);
  }

  function wijzigCastLid(index: number, velden: Partial<StoryCastRef>) {
    zetCast(castRefs.map((r, i) => (i === index ? { ...r, ...velden } : r)));
  }

  // Een portret uploaden voor de cast. De route beschrijft het uiterlijk meteen,
  // zodat de art-director er geen tegenstrijdige beschrijving bij verzint.
  async function uploadCharacter(file: File) {
    setErr(null);
    setCharacterBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("describe", "character");
      const res = await fetch("/api/infographics/upload-scene-ref", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Personage uploaden mislukt"));
      voegCastLidToe({
        url: d.url as string,
        name: "",
        role: "",
        appearance: (d.description as string | null) ?? null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCharacterBusy(false);
    }
  }

  // Speelt de ingebakken preview-mp3 van een stem af (kost niets; geen generatie).
  // Nogmaals klikken op dezelfde stem stopt het afspelen.
  function playPreview(voiceId: string) {
    const el = previewRef.current;
    if (!el) return;
    if (previewVoice === voiceId && !el.paused) {
      el.pause();
      setPreviewVoice(null);
      return;
    }
    el.src = voicePreviewUrl(voiceId);
    el.currentTime = 0;
    setPreviewVoice(voiceId);
    void el.play().catch(() => setPreviewVoice(null));
  }

  // Zacht huisstijl-palet voor de illustraties: actief zodra er een huisstijl is
  // gekozen of de kleuren van de standaard afwijken (anders vrij AI-palet).
  function brandColorsPayload(): { primary: string; accent: string } | undefined {
    const active = !!brandKitId || navy.toLowerCase() !== "#16243f" || accent.toLowerCase() !== "#e8643c";
    return active ? { primary: navy, accent } : undefined;
  }

  // Houd de stijlkiezer in sync met het geladen/gegenereerde verhaal (bij herladen
  // van een opgeslagen project komt de stijl uit de spec).
  useEffect(() => { if (spec?.styleId) setStyleId(spec.styleId); }, [spec?.styleId]);
  useEffect(() => { if (spec?.language) setLanguage(spec.language); }, [spec?.language]);

  // De beschikbare stemmen hangen van de taal af: bij Vlaams alleen Vlaamse
  // stemmen. Staat er een stem gekozen die niet bij de taal past (bv. na het
  // omzetten naar Vlaams), dan schuiven we automatisch door naar de juiste.
  const beschikbareStemmen = voicesForLanguage(spec?.language ?? language);
  useEffect(() => {
    setVoice((huidig) => voiceForLanguage(huidig, spec?.language ?? language));
  }, [language, spec?.language]);
  // Bij het laden van een opgeslagen verhaal de cast overnemen. castRefsVanSpec
  // leest ook de oude characterUrl/characterRole, zodat verhalen van vóór het
  // castblad hun personage houden.
  useEffect(() => {
    const uitSpec = castRefsVanSpec(spec);
    if (uitSpec.length) setCastRefs(uitSpec);
  }, [spec?.castRefs, spec?.characterUrl, spec?.characterRole]);

  // Serie: splits het onderwerp/de bron in losse afleveringen.
  async function planSeries() {
    setErr(null);
    if (!topic.trim() && !text.trim()) { setErr("Vul eerst een onderwerp of brontekst in."); return; }
    setSeriesBusy(true);
    try {
      const res = await fetch("/api/infographics/plan-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, text, language }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Serie plannen mislukt"));
      setEpisodes(Array.isArray(d.episodes) ? d.episodes : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSeriesBusy(false);
    }
  }
  // Haal de tekst van een webpagina op en zet 'm in de brontekst.
  async function fetchPageText() {
    if (!pageUrl.trim()) return;
    setErr(null);
    setPageBusy(true);
    try {
      const res = await fetch("/api/infographics/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pageUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Tekst ophalen mislukt"));
      setText(d.text as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPageBusy(false);
    }
  }

  // Kies één aflevering: vult onderwerp + brontekst zodat je 'm normaal genereert.
  function planEpisode(ep: { title: string; angle: string; brief: string }) {
    setTopic(ep.title);
    setText(`${ep.angle}\n\n${ep.brief}`);
    setEpisodes([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate() {
    setLoading(true);
    setErr(null);
    setSpec(null);
    try {
      const res = await fetch("/api/infographics/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, text, mode, format, targetSeconds, styleId, language, tone, angle, castRefs, brandColors: brandColorsPayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "Verhaal genereren mislukt"));
      setSpec(data.spec as StorySpec);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Het formaat wordt vooraf gekozen en in de generatie gebakken; de preview
  // toont altijd het formaat van de gegenereerde spec. Na genereren ligt het
  // vast (de dropdown is dan vergrendeld), zodat de beelden altijd passen.
  const aspect = storyAspectRatio(spec?.format ?? format);

  // Begin een nieuw verhaal: wist het resultaat zodat het formaat weer te kiezen
  // is (een ander formaat vereist immers een volledige hergeneratie).
  function resetStory() {
    setSpec(null);
    setExportUrl(null);
    setErr(null);
    setProjectId(null);
    setSavedAt(null);
    window.history.replaceState(null, "", "/infographics/story");
  }

  function updateScene(i: number, patch: Partial<StorySpec["scenes"][number]>) {
    setSpec((prev) =>
      prev ? { ...prev, scenes: prev.scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : prev
    );
  }

  // ── Scene-beheer (toevoegen / verwijderen / dupliceren / verplaatsen) ──
  function blankScene(): StoryScene {
    return {
      id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      voiceover: "", illustration: "", imageUrl: null,
    };
  }
  function addScene(afterIndex: number) {
    setSpec((prev) => {
      if (!prev) return prev;
      const scenes = [...prev.scenes];
      scenes.splice(afterIndex + 1, 0, blankScene());
      return { ...prev, scenes };
    });
  }
  function deleteScene(i: number) {
    setSpec((prev) => {
      if (!prev || prev.scenes.length <= 1) return prev; // altijd minstens 1 scene
      return { ...prev, scenes: prev.scenes.filter((_, idx) => idx !== i) };
    });
  }
  function duplicateScene(i: number) {
    setSpec((prev) => {
      if (!prev) return prev;
      const scenes = [...prev.scenes];
      const copy = { ...scenes[i], id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
      scenes.splice(i + 1, 0, copy);
      return { ...prev, scenes };
    });
  }
  function moveScene(i: number, dir: -1 | 1) {
    setSpec((prev) => {
      if (!prev) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.scenes.length) return prev;
      const scenes = [...prev.scenes];
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { ...prev, scenes };
    });
  }
  // Eén beurt in de beeld-chat van een scene. De server bepaalt wat het bericht
  // betekent (beeld bijwerken, opnieuw tekenen, of alleen antwoorden) en levert
  // meteen het resultaat; hier houden we alleen het verloop en het beeld bij.
  //
  // Het vorige beeld hangen we aan het antwoord (previousImageUrl), zodat elke
  // beurt los terug te draaien is zonder aparte undo-stack.
  async function sendSceneChat(i: number, text: string, file: File | null) {
    if (!spec) return;
    const s = spec.scenes[i];
    const prevImage = s.imageUrl ?? null;
    const nu = Date.now();
    setErr(null);
    setImgBusy((b) => ({ ...b, [s.id]: true }));

    // De vraag meteen tonen; het antwoord komt er zo onder te staan.
    const vraag: SceneChatMessage = { id: `m-${nu}-u`, role: "user", text, at: nu };
    const verloop = [...(s.chat ?? []), vraag];
    updateScene(i, { chat: verloop });

    try {
      // Een meegestuurde foto eerst uploaden: het beeldmodel heeft een publieke
      // URL nodig, en zo blijft de foto ook bij het bericht zichtbaar.
      let photoUrl: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/infographics/upload-scene-ref", { method: "POST", body: fd });
        const ud = await up.json();
        if (!up.ok) throw new Error(apiError(ud, "Foto uploaden mislukt"));
        photoUrl = ud.url as string;
        vraag.photoUrl = photoUrl;
        updateScene(i, { chat: [...verloop] });
      }

      const res = await fetch("/api/infographics/scene-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          photoUrl,
          illustration: s.illustration,
          sourceImageUrl: s.imageUrl ?? null,
          referencePhotoUrl: s.referencePhotoUrl ?? null,
          history: (s.chat ?? []).map((m) => ({ role: m.role, text: m.text })),
          format: spec.format,
          // Consistentie: verhaal-seed + anker (behalve voor de anker-scene zelf).
          seed: spec.seed ?? undefined,
          anchorImageUrl: spec.anchorImageUrl && spec.anchorImageUrl !== s.imageUrl ? spec.anchorImageUrl : undefined,
          styleId: spec.styleId ?? styleId,
          language: spec.language ?? language,
          // Alleen de personages die in DEZE scene staan; wie er niet in staat
          // hoort er ook niet bijgetekend te worden.
          castRefs: castRefsVoorScene(castRefs, s.castNames),
          tekstInBeeld,
          brandColors: brandColorsPayload(),
          // De cast + het castblad mee, anders tekent een regeneratie via de chat
          // weer een andere hoofdpersoon dan de rest van de video.
          mode: spec.mode,
          layout: s.layout ?? null,
          voiceover: s.voiceover,
          labels: s.labels ?? null,
          cast: spec.cast ?? null,
          castNames: s.castNames ?? null,
          castSheetUrl: spec.castSheetUrl ?? null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Beeld bijwerken mislukt"));

      const antwoord: SceneChatMessage = {
        id: `m-${Date.now()}-a`,
        role: "assistant",
        text: d.reply ?? "Klaar.",
        at: Date.now(),
        imageUrl: d.imageUrl ?? null,
        previousImageUrl: d.imageUrl ? prevImage : null,
        // Bij een zelfgetekende scene is de opbouw het herstelpunt.
        previousLayout: d.layout ? s.layout ?? null : null,
      };
      const patch: Partial<StoryScene> = { chat: [...verloop, antwoord] };
      if (d.layout) patch.layout = d.layout;
      if (d.imageUrl) {
        // Nieuw beeld → oude bewegende clip wissen, anders speelt de player de
        // verouderde video i.p.v. het nieuwe beeld (de "twee video's"-valkuil).
        patch.imageUrl = d.imageUrl;
        patch.videoUrl = null;
        setMotionSkipped((m) => ({ ...m, [s.id]: "" }));
      }
      // Bij een regeneratie herschrijft de server de briefing; die moet mee,
      // anders valt een volgende beurt terug op de oude scène.
      if (d.illustration) patch.illustration = d.illustration;
      if (Array.isArray(d.labels)) patch.labels = d.labels;
      if (d.referencePhotoUrl) patch.referencePhotoUrl = d.referencePhotoUrl;
      updateScene(i, patch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      // De vraag laten staan zou suggereren dat er iets gebeurd is; weghalen.
      updateScene(i, { chat: s.chat ?? [] });
    } finally {
      setImgBusy((b) => ({ ...b, [s.id]: false }));
    }
  }

  // Zet het beeld terug naar hoe het vóór deze chatbeurt was. De beurt zelf
  // blijft in het verloop staan (je ziet dus wat je geprobeerd hebt), maar kan
  // niet nog eens teruggedraaid worden.
  function revertSceneChat(i: number, msg: SceneChatMessage) {
    if (!spec) return;
    if (!msg.previousImageUrl && !msg.previousLayout) return;
    const s = spec.scenes[i];
    const terug: Partial<StoryScene> = {
      chat: (s.chat ?? []).map((m) =>
        m.id === msg.id ? { ...m, previousImageUrl: null, previousLayout: null, text: `${m.text} (teruggedraaid)` } : m
      ),
    };
    if (msg.previousLayout) terug.layout = msg.previousLayout;
    if (msg.previousImageUrl) { terug.imageUrl = msg.previousImageUrl; terug.videoUrl = null; }
    updateScene(i, terug);
  }

  async function genVoice() {
    if (!spec) return;
    const text = spec.scenes.map((s) => s.voiceover).filter(Boolean).join(" ").trim();
    if (!text) { setErr("Geen voice-over tekst"); return; }
    setErr(null);
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/infographics/scene-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed: voiceSpeed, language: spec.language ?? language }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Voice-over mislukt"));
      const durs = splitVoiceDurations(spec.scenes, d.duration);
      setSpec((prev) => prev ? {
        ...prev,
        voiceUrl: d.audioUrl,
        voiceDuration: d.duration,
        voice,
        voiceIsCustom: false,
        voiceFileName: null,
        scenes: prev.scenes.map((s, idx) => ({ ...s, voiceDuration: durs[idx] })),
      } : prev);
      setSyncNote(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceBusy(false);
    }
  }

  // Eigen ingesproken voice-over (mp3) gebruiken in plaats van een AI-stem. De
  // scene-lengtes worden eerst naar rato van de tekst verdeeld; met "Autosync op
  // voice" liggen ze daarna op de echte woordtiming van de opname.
  async function uploadVoice(file: File) {
    if (!spec) return;
    setErr(null);
    setVoiceUploadBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/infographics/story-voice-upload", { method: "POST", body });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Uploaden mislukt"));
      const durs = splitVoiceDurations(spec.scenes, d.duration);
      setSpec((prev) => prev ? {
        ...prev,
        voiceUrl: d.audioUrl,
        voiceDuration: d.duration,
        voiceIsCustom: true,
        voiceFileName: d.fileName ?? file.name,
        scenes: prev.scenes.map((s, idx) => ({ ...s, voiceDuration: durs[idx] })),
      } : prev);
      setSyncNote({
        tekst: "Eigen voice-over geladen. Klik op 'Autosync op voice' om de scenes op de opname te leggen.",
        waarschuwing: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceUploadBusy(false);
      // Leegmaken, anders kun je hetzelfde bestand niet nog eens kiezen.
      if (voiceFileRef.current) voiceFileRef.current.value = "";
    }
  }

  // Autosync (zoals de Creator Studio): legt de scenegrenzen op de echte
  // woordtiming in de voice-over, zodat beeld en stem gelijk lopen. Vereist een
  // gegenereerde voice-over (spec.voiceUrl).
  async function autoSync() {
    if (!spec) return;
    if (!spec.voiceUrl) { setErr("Genereer of upload eerst een voice-over voordat je autosynct."); return; }
    setErr(null);
    setSyncNote(null);
    setSyncBusy(true);
    try {
      const res = await fetch("/api/infographics/autosync-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Autosync mislukt"));
      const durs = d.durations as number[];
      setSpec((prev) => prev ? {
        ...prev,
        voiceDuration: d.audioDuration ?? prev.voiceDuration,
        scenes: prev.scenes.map((s, idx) => ({ ...s, voiceDuration: durs[idx] ?? s.voiceDuration })),
      } : prev);

      // Eerlijk laten zien hoe goed het gelukt is. Bij een eigen opname die van
      // het script afwijkt, is de verdeling een schatting — dan kun je beter zelf
      // nog even de scene-lengtes nalopen dan denken dat het perfect staat.
      const gevonden = typeof d.anchorsMatched === "number" ? d.anchorsMatched : null;
      const totaal = typeof d.anchorsTotal === "number" ? d.anchorsTotal : 0;
      if (d.fallbackUsed) {
        setSyncNote({
          tekst: "De opname wijkt te veel af van het script; de scenes zijn verdeeld naar tekstlengte. Loop ze even na.",
          waarschuwing: true,
        });
      } else if (gevonden !== null && totaal > 0 && gevonden < totaal) {
        setSyncNote({
          tekst: `${gevonden} van de ${totaal} scenegrenzen exact op de opname gelegd; de rest is geschat.`,
          waarschuwing: gevonden < totaal / 2,
        });
      } else {
        setSyncNote({ tekst: "Scenes liggen gelijk met de opname.", waarschuwing: false });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function animateScene(i: number) {
    if (!spec) return;
    const s = spec.scenes[i];
    if (!s.imageUrl) return;
    // De vuistregel ("verzin niets bij") zit in de route; hier sturen we alleen
    // de optionele bijsturing mee van wat er wél/niet moet bewegen.
    const steer = (motionInstr[s.id] ?? "").trim();
    setErr(null);
    setMotionBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const res = await fetch("/api/infographics/scene-motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Ankers voor het kritische oog: de voice-over, het bedoelde beeld en de titel.
        body: JSON.stringify({ imageUrl: s.imageUrl, steer, voiceover: s.voiceover, illustration: s.illustration, title: spec?.title, mode: spec?.mode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Animeren mislukt"));
      // Elke poging afgekeurd (er kwam iets bij) → beeld blijft staan.
      if (d.skipped) { setMotionSkipped((m) => ({ ...m, [s.id]: String(d.reason ?? "quality") })); return; }
      setMotionSkipped((m) => ({ ...m, [s.id]: "" }));
      updateScene(i, { videoUrl: d.videoUrl });
      // Terugkoppeling van de automatische controle.
      if (d.qc && typeof d.qc.attempts === "number") {
        const n = d.qc.attempts as number;
        setMotionNote((m) => ({
          ...m,
          [s.id]: d.qc.approved
            ? (n > 1 ? `✓ Beweging gecontroleerd (${n} pogingen)` : "✓ Beweging gecontroleerd")
            : `Beste van ${n} pogingen getoond`,
        }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMotionBusy((b) => ({ ...b, [s.id]: false }));
    }
  }

  // Maakt alle scenes met een beeld bewegend. Seedance Lite kost ~40s per scene,
  // dus sequentieel duurt een verhaal van 11 scenes al snel 7 minuten. We draaien
  // daarom meerdere tegelijk (begrensd, zodat we de fal-wachtrij niet overbelasten):
  // de totale tijd zakt zo van de som naar ongeveer de langste golf. Per scene
  // geldt nog steeds de eigen bijsturing.
  const MOTION_CONCURRENCY = 4;
  async function animateAll() {
    if (!spec) return;
    setAnimatingAll(true);
    setErr(null);
    try {
      const todo = spec.scenes.map((s, i) => (s.imageUrl ? i : -1)).filter((i) => i >= 0);
      let cursor = 0;
      const worker = async () => {
        while (cursor < todo.length) {
          const i = todo[cursor++];
          await animateScene(i);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MOTION_CONCURRENCY, todo.length) }, worker)
      );
    } finally {
      setAnimatingAll(false);
    }
  }

  async function exportVideo() {
    if (!spec) return;
    setExporting(true);
    setExportUrl(null);
    setErr(null);
    try {
      const res = await fetch("/api/infographics/export-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, logoUrl: logoEnabled ? logoUrl : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Export mislukt"));
      setExportUrl(d.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      {/* Huisstijl-fonts voor de preview (dezelfde families als de export-TTF's). */}
      <h1 className="text-xl font-bold text-white mb-1">Storytelling-infographic</h1>
      {tekstInBeeld && <link rel="stylesheet" href={STORY_FONTS_CSS_HREF} />}
      <p className="text-sm text-slate-400 mb-6">AI schrijft een verhaalboog en genereert per scene een illustratie die het hele beeld vult. De voice-over vertelt het verhaal; er komt geen tekst in beeld.</p>
      {loadingProject && <p className="text-sm text-blue-300 mb-4">Verhaal laden…</p>}

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 mb-8">
        <label className="block">
          <span className="block text-[11px] text-slate-400 mb-0.5">Onderwerp / titel</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="bijv. De geschiedenis van de VOC" className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
        </label>
        <div>
          <div className="flex items-center justify-between mb-0.5 gap-2 flex-wrap">
            <span className="text-[11px] text-slate-400">Brontekst / data (cijfers worden hier letterlijk uit gehaald)</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                placeholder="https://… (blog/artikel)"
                className="w-40 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white"
              />
              <button
                onClick={fetchPageText}
                disabled={pageBusy || !pageUrl.trim()}
                title="Haal de tekst van deze webpagina op als brontekst"
                className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-50 shrink-0"
              >
                {pageBusy ? "Ophalen…" : "🌐 Uit webpagina"}
              </button>
              <PdfUploadButton onExtracted={(t) => setText(t)} />
            </div>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Plak hier je bron: cijfers, feiten en kernpunten. De AI maakt er een verhaalboog van. (Of upload een PDF.)" className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
          {!spec && (
            <div className="mt-1.5">
              <button
                onClick={planSeries}
                disabled={seriesBusy || (!topic.trim() && !text.trim())}
                title="Splitst je onderwerp in meerdere losse korte video's"
                className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {seriesBusy ? "Serie bedenken…" : "🎬 Maak er een serie van"}
              </button>
              {episodes.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-slate-400">Kies een aflevering — die vult onderwerp + brontekst, daarna genereer je 'm normaal:</p>
                  {episodes.map((ep, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 bg-slate-900/40 border border-white/10 rounded px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white">{i + 1}. {ep.title}</div>
                        <div className="text-[11px] text-slate-400">{ep.angle}</div>
                      </div>
                      <button onClick={() => planEpisode(ep)} className="shrink-0 text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white">Maak deze →</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Huisstijl: kies een opgeslagen kit óf haal 'm uit een website; kleuren,
            font en logo worden overgenomen en blijven handmatig overschrijfbaar. */}
        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Huisstijl</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-0.5">Kies huisstijl</span>
              <select
                value={brandKitId}
                onChange={(e) => applyBrandKit(e.target.value)}
                title="Neemt kleuren, lettertype en logo van je huisstijl over."
                className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
              >
                <option value="">Geen huisstijl</option>
                {brandKits.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
              </select>
            </label>
            <label className="block flex-1 min-w-[240px]">
              <span className="block text-[11px] text-slate-400 mb-0.5">…of haal 'm uit je website</span>
              <div className="flex gap-2">
                <input
                  value={brandUrl}
                  onChange={(e) => setBrandUrl(e.target.value)}
                  placeholder="https://www.jouwbedrijf.nl"
                  className="flex-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                />
                <button
                  onClick={extractFromWebsite}
                  disabled={brandBusy || !brandUrl.trim()}
                  title="AI leest je website en neemt kleuren, lettertype en logo over."
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50 whitespace-nowrap"
                >
                  {brandBusy ? "Ophalen…" : "🌐 Uit website"}
                </button>
              </div>
            </label>
            <div className="flex flex-col gap-1 pb-1.5">
              <span className="block text-[11px] text-slate-400">Tekst in beeld</span>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer" title="Zet een korte kop, een accentwoord en een groot getal over de illustratie. Standaard uit: in een volledig ingetekend beeld leidt tekst vaak af.">
                <input type="checkbox" checked={tekstInBeeld} onChange={(e) => setTekstInBeeld(e.target.checked)} className="accent-blue-500" />
                Koppen en cijfers tonen
              </label>
              {tekstInBeeld && (
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="mt-1 bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white"
                  style={{ fontFamily: `${fontFamily}, system-ui, sans-serif` }}
                >
                  {STORY_FONTS.map((f) => (<option key={f.id} value={f.family}>{f.label}{f.note ? ` — ${f.note}` : ""}</option>))}
                </select>
              )}
            </div>

            <div className="flex flex-col gap-1 pb-1.5">
              <span className="block text-[11px] text-slate-400">Logo</span>
              <div className="flex items-center gap-2">
                {logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="logo" className="h-7 w-7 rounded object-contain bg-white/90 p-0.5" />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  title="Upload je eigen logo (PNG, JPG, WEBP of SVG, max 5 MB). Verschijnt rechtsboven in elke scene."
                  className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {logoBusy ? "Uploaden…" : logoUrl ? "Vervangen" : "⬆ Logo uploaden"}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => { setLogoUrl(null); setLogoEnabled(false); }}
                    title="Logo verwijderen"
                    className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-400 hover:bg-slate-800"
                  >
                    Verwijderen
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 mt-0.5" title={logoUrl ? "Toont het logo rechtsboven in elke scene" : "Upload eerst een logo"}>
                <input type="checkbox" checked={logoEnabled} disabled={!logoUrl} onChange={(e) => setLogoEnabled(e.target.checked)} className="accent-blue-500" />
                <span className="text-[11px] text-slate-400">Logo tonen{logoUrl ? "" : " (geen logo)"}</span>
              </label>
            </div>
            {/* Het castblad: iedereen die in dit verhaal terugkomt, elk met een
                eigen rol. De portretten gaan als referentie mee naar het castblad
                en naar elke scene waarin die persoon voorkomt. */}
            <div className="flex flex-col gap-1.5 pb-1.5">
              <span className="block text-[11px] text-slate-400">
                Vaste personages{castRefs.length > 0 ? ` (${castRefs.length}/${MAX_CAST_REFS})` : ""}
              </span>

              {castRefs.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {castRefs.map((ref, i) => (
                    <div key={ref.url} className="flex items-center gap-1.5 rounded border border-white/10 bg-slate-900/40 p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ref.url} alt={ref.name || `personage ${i + 1}`} className="h-9 w-9 rounded object-contain bg-white/90 p-0.5 shrink-0" />
                      <input
                        value={ref.name}
                        onChange={(e) => wijzigCastLid(i, { name: e.target.value })}
                        placeholder="Naam"
                        title="Onder deze naam komt dit personage in de briefings terug."
                        className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white w-24 placeholder:text-slate-600"
                      />
                      <input
                        value={ref.role}
                        onChange={(e) => wijzigCastLid(i, { role: e.target.value })}
                        placeholder="bijv. de monteur"
                        title="Wat deze persoon in het verhaal doet. Blijft in elke scene hetzelfde."
                        className="bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-[11px] text-white flex-1 min-w-0 placeholder:text-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => zetCast(castRefs.filter((_, k) => k !== i))}
                        title="Uit de cast halen"
                        className="text-[11px] px-1.5 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-400 hover:bg-slate-800 shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                {/* Kiezen gaat vóór uploaden: wie al personages heeft aangemaakt
                    hoeft dezelfde afbeelding niet opnieuw van schijf te zoeken. */}
                <button
                  type="button"
                  onClick={() => setKiezerOpen((o) => !o)}
                  disabled={castRefs.length >= MAX_CAST_REFS}
                  className="text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900/60"
                  title={castRefs.length >= MAX_CAST_REFS ? `Maximaal ${MAX_CAST_REFS} personages` : "Kies personages uit je bibliotheek"}
                >
                  + Uit bibliotheek
                </button>
                <label className={`text-[11px] px-2 py-1 rounded border border-white/10 bg-slate-900/60 text-slate-400 hover:bg-slate-800 cursor-pointer ${characterBusy || castRefs.length >= MAX_CAST_REFS ? "opacity-40 pointer-events-none" : ""}`} title="Of upload een eigen afbeelding (PNG, JPG of WEBP)">
                  {characterBusy ? "Uploaden…" : "⬆ Uploaden"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCharacter(f); e.currentTarget.value = ""; }} />
                </label>
              </div>

              {kiezerOpen && (
                <BibliotheekKiezer
                  gekozenUrls={castRefs.map((r) => r.url)}
                  onSluit={() => setKiezerOpen(false)}
                  onKies={(ch) => {
                    if (!ch.image_url) return;
                    // De kiezer blijft open: meestal voeg je meer dan één
                    // personage tegelijk toe. Naam en beschrijving komen uit de
                    // bibliotheek, de rol vul je zelf in.
                    voegCastLidToe({
                      url: ch.image_url,
                      name: ch.name,
                      role: "",
                      appearance: ch.description,
                    });
                  }}
                />
              )}

              <span className="text-[10px] text-slate-500">
                {castRefs.length === 0
                  ? "Optioneel. Wie je hier vastlegt, ziet er in elke scene hetzelfde uit."
                  : "Deze mensen komen in elke scene hetzelfde terug, elk in hun eigen rol."}
              </span>
            </div>
          </div>
        </div>

        {/* Tekenstijl op BEELD kiezen. "Papercut" en "Soft 3D" zeggen niets tot je
            ze ziet, en de keuze bepaalt hoe de hele video eruit komt te zien.
            Staat als eigen blok en niet tussen de selects: kaartjes hebben breedte
            nodig. Zelfde kiezer als in de dialoogmodus. */}
        {/* De overheidsmodus is zelf een tekenstijl: vlakke diagrammen met een
            vast, klein palet. De vier presets doen daar niets meer, dus tonen we
            ze niet — een kiezer die niets verandert is erger dan geen kiezer. */}
        {(spec?.mode ?? mode) === "overheid" ? (
          <div className="mb-4">
            <span className="block text-[11px] text-slate-400 mb-1.5">Stijl</span>
            <p className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              De overheidsstijl bepaalt zelf hoe de beelden eruitzien: vlakke diagrammen met iconen en panelen op een
              lichtgrijs vlak, zonder omgevingen. De tekenstijlen hieronder gelden alleen voor Verhaal en Rapport.
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <span className="block text-[11px] text-slate-400 mb-1.5">
              Stijl {spec ? "(vast)" : ""}
            </span>
            <StylePicker
              value={styleId}
              onChange={setStyleId}
              disabled={!!spec}
              hint={spec ? "De stijl ligt vast voor dit verhaal. Klik “Nieuw verhaal” voor een andere stijl." : undefined}
            />
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Modus</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as "story" | "report" | "overheid")} className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white">
              <option value="story">Verhaal</option>
              <option value="report">Rapport</option>
              {(intern || spec?.mode === "overheid") && <option value="overheid">Overheidsstijl</option>}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Taal {spec ? "(vast)" : ""}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!!spec}
              title={spec ? "De taal ligt vast voor dit verhaal. Klik 'Nieuw verhaal' voor een andere taal." : "Taal van script en voice-over"}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Toon</span>
            <select value={tone} onChange={(e) => setTone(e.target.value as "zakelijk" | "speels" | "energiek")} className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white">
              <option value="zakelijk">Zakelijk</option>
              <option value="speels">Speels</option>
              <option value="energiek">Energiek</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Invalshoek</span>
            <input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="optioneel · bijv. vanuit de klant"
              title="Optionele hoek van waaruit het verhaal verteld wordt"
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white w-48"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Formaat {spec ? "(vast)" : ""}</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "16:9" | "9:16")}
              disabled={!!spec}
              title={spec ? "Het formaat ligt vast voor dit verhaal. Klik 'Nieuw verhaal' om een ander formaat te kiezen." : undefined}
              className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="16:9">16:9 liggend</option>
              <option value="9:16">9:16 staand</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Videolengte</span>
            <select value={targetSeconds} onChange={(e) => setTargetSeconds(Number(e.target.value))} className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white">
              <option value={30}>Kort · ~30 sec (±5 scenes)</option>
              <option value={60}>~1 min (±10 scenes)</option>
              <option value={90}>~1,5 min (±15 scenes)</option>
              <option value={120}>~2 min (±20 scenes)</option>
            </select>
            <span className="block text-[10px] text-slate-500 mt-0.5">elke scene ~{SECS_PER_SCENE} sec</span>
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Hoofdkleur beeld{brandKitId ? " · uit huisstijl" : ""}</span>
            <input type="color" value={navy} onChange={(e) => { setNavy(e.target.value); setBrandKitId(""); }} className="h-9 w-14 bg-transparent border border-white/10 rounded cursor-pointer" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Accent{brandKitId ? " · uit huisstijl" : ""}</span>
            <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setBrandKitId(""); }} className="h-9 w-14 bg-transparent border border-white/10 rounded cursor-pointer" />
          </label>
          <button onClick={generate} disabled={loading || !text.trim()} title={!text.trim() ? "Vul eerst een brontekst in" : mode === "overheid"
              ? "De overheidsstijl tekent zijn scenes zelf, zonder beeldmodel: alleen het script kost credits."
              : `Script schrijven is gratis, ${CREDIT_COSTS.IMAGE_GENERATION} credit per scene-beeld. Komen er meerdere personages in voor, dan maakt de tool daar gratis een castblad bij dat ze in elke scene hetzelfde houdt.`} className="btn-primary text-sm disabled:opacity-50">
            {loading ? (mode === "overheid" ? "Genereren… (script + scenes)" : "Genereren… (script + beelden)") : "Genereer verhaal"}
            {/* In de overheidsmodus tekent de app de scenes zelf, dus er is geen
                beeldmodel en geen tarief per scene. */}
            <span className="text-white/70 ml-1">
              {mode === "overheid" ? "· zonder beeldcredits" : `· ${CREDIT_COSTS.IMAGE_GENERATION}/scene cr.`}
            </span>
          </button>
        </div>
        {err && <p className="text-red-400 text-sm break-words">{err}</p>}
      </div>

      {loading && <p className="text-slate-400 text-sm">Even geduld, de AI schrijft het script en genereert per scene een illustratie. Dit duurt ongeveer 20 tot 40 seconden.</p>}

      {spec && (
        <div className="space-y-8">
          <h2 className="text-lg font-semibold text-white">{spec.title}</h2>

          {/* Verborgen audio-element voor de stem-previews (ingebakken mp3's). */}
          <audio ref={previewRef} onEnded={() => setPreviewVoice(null)} className="hidden" />

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
            {/* Meta: lengte, formaat en opslagstatus in één rustige regel. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>
                Geschatte lengte:{" "}
                <span className="text-slate-200 font-medium">
                  ~{Math.round(spec.voiceDuration && spec.voiceDuration > 0 ? spec.voiceDuration : spec.scenes.length * SECS_PER_SCENE)} sec
                </span>{" "}
                ({spec.scenes.length} scenes{spec.voiceDuration ? "" : ` × ~${SECS_PER_SCENE}s`})
              </span>
              <span>Formaat: {spec.format}</span>
              {spec.voiceDuration ? <span className="text-emerald-400">{spec.voiceDuration.toFixed(1)}s ingesproken</span> : null}
              {savedAt && <span className="text-emerald-400/80">automatisch bewaard om {savedAt}</span>}
            </div>

            {/* Audio: stemkeuze + voice-over + sync + muziek. */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Audio</p>
              <div className="flex flex-wrap gap-2">
                {beschikbareStemmen.map((v) => {
                  const active = voice === v.id;
                  const playing = previewVoice === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`flex items-center rounded-md border overflow-hidden ${active ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-slate-900/40"}`}
                    >
                      <button onClick={() => setVoice(v.id)} title={`Kies ${v.label}`} className="pl-2.5 pr-2 py-1.5 text-xs text-white">
                        <span className={active ? "text-emerald-300" : "text-slate-500"}>{active ? "●" : "○"}</span>{" "}
                        {v.label} <span className="text-slate-400">· {v.description}</span>
                      </button>
                      <button
                        onClick={() => playPreview(v.id)}
                        title="Voorbeeld afspelen (gratis, ingebakken)"
                        className="px-2 py-1.5 text-slate-300 hover:text-white border-l border-white/10"
                      >
                        {playing ? "❚❚" : "▶"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={genVoice} disabled={voiceBusy} title={`Kost ${CREDIT_COSTS.VOICE} credits`} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md disabled:opacity-50">
                  {voiceBusy ? "Voice-over genereren…" : spec.voiceUrl ? "Voice-over opnieuw" : "Genereer voice-over"}
                  <span className="text-slate-400 ml-1">· {creditLabel(CREDIT_COSTS.VOICE)}</span>
                </button>
                <input
                  ref={voiceFileRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVoice(f); }}
                />
                <button
                  onClick={() => voiceFileRef.current?.click()}
                  disabled={voiceUploadBusy}
                  title="Gebruik je eigen ingesproken mp3 in plaats van een AI-stem. Max. 25 MB. Kost geen credits."
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md disabled:opacity-50"
                >
                  {voiceUploadBusy ? "Uploaden…" : "Eigen mp3 uploaden"}
                  <span className="text-slate-400 ml-1">· gratis</span>
                </button>
                <label className="flex items-center gap-1.5" title="Spreeksnelheid van de voice-over (0,85–1,2×)">
                  <span className="text-[11px] text-slate-400">Snelheid</span>
                  <select value={voiceSpeed} onChange={(e) => setVoiceSpeed(Number(e.target.value))} className="bg-slate-900/60 border border-white/10 rounded px-1.5 py-1 text-xs text-white">
                    <option value={0.85}>0,85×</option>
                    <option value={0.9}>0,9×</option>
                    <option value={1}>1× (normaal)</option>
                    <option value={1.1}>1,1×</option>
                    <option value={1.2}>1,2×</option>
                  </select>
                </label>
                <button
                  onClick={autoSync}
                  disabled={syncBusy || !spec.voiceUrl}
                  title="Legt de scenes precies op de gesproken voice-over (Whisper). Werkt ook op een eigen geüploade opname."
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md disabled:opacity-50"
                >
                  {syncBusy ? "Autosync…" : "Autosync op voice"}
                  <span className="text-slate-400 ml-1">· {creditLabel(CREDIT_COSTS.SYNC)}</span>
                </button>
                <span className="w-px self-stretch bg-white/10 mx-1" />
                <MusicPickerButton
                  value={spec.musicUrl}
                  onChange={(url) => setSpec((prev) => (prev ? { ...prev, musicUrl: url } : prev))}
                  videoDuration={storyWindows(spec.scenes).total}
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md"
                />
                {spec.musicUrl ? (
                  <span className="text-xs text-emerald-400">
                    {findMusicTrackByUrl(spec.musicUrl)?.title ?? "eigen muziek"} · gratis
                  </span>
                ) : null}
                <label className="flex items-center gap-2" title="Volume van het muziekbed onder de voice-over (geldt in de preview en de export)">
                  <span className="text-[11px] text-slate-400">Muziekvolume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={spec.musicVolume ?? 0.18}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSpec((prev) => (prev ? { ...prev, musicVolume: v } : prev));
                    }}
                    className="w-28 accent-blue-500"
                  />
                  <span className="text-[11px] text-slate-500 w-9 text-right tabular-nums">{Math.round((spec.musicVolume ?? 0.18) * 100)}%</span>
                </label>
              </div>
              {spec.voiceIsCustom && spec.voiceUrl ? (
                <p className="text-xs text-emerald-400">
                  Eigen voice-over: <span className="text-emerald-300">{spec.voiceFileName ?? "geüpload bestand"}</span>
                  {spec.voiceDuration ? <span className="text-slate-400"> · {Math.round(spec.voiceDuration)}s</span> : null}
                </p>
              ) : null}
              {syncNote ? (
                <p className={`text-xs ${syncNote.waarschuwing ? "text-amber-400" : "text-slate-400"}`}>
                  {syncNote.tekst}
                </p>
              ) : null}
            </div>

            {/* Beeld: alle scenes in één keer bewegend maken. */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Beeld</p>
              <button
                onClick={animateAll}
                disabled={animatingAll || !spec.scenes.some((s) => s.imageUrl)}
                className="text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-4 py-1.5 rounded-md disabled:opacity-50"
              >
                {animatingAll ? "Alles animeren… (kan enkele minuten duren)" : "Maak alles bewegend"}
                <span className="text-blue-300/70 ml-1">· {CREDIT_COSTS.VIDEO_GENERATION} cr./scene</span>
              </button>
            </div>

            {/* Exporteren + opslaan. */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
              <button onClick={exportVideo} disabled={exporting} className="btn-primary text-sm px-4 disabled:opacity-50">
                {exporting ? "Video exporteren… (kan even duren)" : "Exporteer video (MP4)"}
              </button>
              {exportUrl && (
                <a href={exportUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-400 underline">Download video</a>
              )}
              <span className="text-xs text-slate-400">
                {savedAt ? `Automatisch bewaard om ${savedAt}` : "Wordt automatisch bewaard"}
              </span>
              <button onClick={resetStory} className="text-sm text-slate-400 hover:text-white ml-auto">Nieuw verhaal (ander formaat)</button>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-white mb-3">Voorvertoning (video)</p>
            <StoryPlayer spec={{ ...spec, tekstInBeeld }} logoUrl={logoEnabled ? logoUrl : null} navy={navy} accent={accent} fontFamily={fontFamily} />
          </div>

          {/* De cast: wie komt er in dit verhaal terug, en hoe ziet die eruit. Het
              castblad gaat als referentie mee naar elke scene; hem hier tonen maakt
              zichtbaar wie het model als "dezelfde persoon" beschouwt. */}
          {(spec.cast?.length ?? 0) > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-white">Personages in dit verhaal</p>
              <div className="flex gap-4 items-start">
                {spec.castSheetUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={spec.castSheetUrl}
                    alt="castblad"
                    className="w-48 rounded-lg border border-white/10 bg-[#f3f1ec] shrink-0"
                  />
                )}
                <ul className="text-xs text-slate-300 space-y-1.5">
                  {(spec.cast ?? []).map((c) => (
                    <li key={c.name}>
                      <span className="text-white font-medium">{c.name}</span>
                      {c.role ? <span className="text-slate-400"> · {c.role}</span> : null}
                      <span className="block text-slate-500">{c.appearance}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-[10px] text-slate-500">
                Deze mensen horen in elke scene hetzelfde eruit te zien. Klopt er iets niet, dan kun je het per scene in de chat bijsturen.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Scenes bewerken</h3>
            {spec.format === "9:16" && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer" title="Toont waar TikTok/Instagram-knoppen en captions het beeld bedekken, zodat je tekst en logo vrij houdt.">
                <input type="checkbox" checked={showSafeZone} onChange={(e) => setShowSafeZone(e.target.checked)} className="accent-blue-500" />
                Veilige zone (social) tonen
              </label>
            )}
          </div>
          {spec.scenes.map((scene, i) => (
            <div key={scene.id} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#f3f1ec]" style={{ aspectRatio: aspect }}>
                {scene.layout ? (
                  <OverheidSceneView
                    layout={scene.layout}
                    format={spec.format}
                    t={99}
                    duur={scene.voiceDuration ?? 6}
                    voiceover={scene.voiceover}
                    navy={navy}
                    accent={accent}
                    logoUrl={logoEnabled ? logoUrl : null}
                  />
                ) : scene.videoUrl ? (
                  <video src={scene.videoUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-slate-400 text-xs">geen illustratie</div>
                )}
                {tekstInBeeld ? (
                  <EditableStoryScene
                    scene={scene}
                    format={spec.format}
                    navy={navy}
                    accent={accent}
                    fontFamily={fontFamily}
                    logoUrl={logoEnabled ? logoUrl : null}
                    onChange={(patch) => updateScene(i, patch)}
                  />
                ) : (
                  <SceneOverlay format={spec.format} logoUrl={logoEnabled ? logoUrl : null} />
                )}
                {spec.format === "9:16" && showSafeZone && (
                  <div className="absolute inset-0 z-20 pointer-events-none">
                    <div className="absolute inset-x-0 top-0 h-[10%] bg-red-500/10 border-b border-dashed border-red-400/50" />
                    <div className="absolute inset-x-0 bottom-0 h-[20%] bg-red-500/10 border-t border-dashed border-red-400/50" />
                    <span className="absolute bottom-[20.5%] left-1 text-[8px] text-red-100/90 bg-black/40 px-1 rounded">social-UI bedekt dit</span>
                  </div>
                )}
                {(imgBusy[scene.id] || motionBusy[scene.id]) && (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 text-white text-sm">{motionBusy[scene.id] ? "Animeren… (kan ~1 min duren)" : "Beeld bijwerken…"}</div>
                )}
              </div>
              <div className="text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Scene {i + 1}</p>
                  <div className="flex items-center gap-0.5 text-sm text-slate-400">
                    <button onClick={() => moveScene(i, -1)} disabled={i === 0} title="Scene omhoog" className="px-1.5 hover:text-white disabled:opacity-30">↑</button>
                    <button onClick={() => moveScene(i, 1)} disabled={i === spec.scenes.length - 1} title="Scene omlaag" className="px-1.5 hover:text-white disabled:opacity-30">↓</button>
                    <button onClick={() => duplicateScene(i)} title="Scene dupliceren" className="px-1.5 hover:text-white">⧉</button>
                    <button onClick={() => addScene(i)} title="Nieuwe scene hieronder" className="px-1.5 hover:text-white">＋</button>
                    <button onClick={() => deleteScene(i)} disabled={spec.scenes.length <= 1} title="Scene verwijderen" className="px-1.5 hover:text-red-300 disabled:opacity-30">🗑</button>
                  </div>
                </div>
                <label className="block">
                  <span className="block text-[11px] text-slate-400 mb-0.5">Voice-over</span>
                  <textarea value={scene.voiceover} onChange={(e) => updateScene(i, { voiceover: e.target.value })} rows={2} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-slate-200" />
                </label>
                {scene.voiceDuration ? <p className="text-[10px] text-slate-500">scene-tijd: {scene.voiceDuration.toFixed(1)}s</p> : null}

                {tekstInBeeld && (
                  <div className="pt-2 mt-1 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Tekst in beeld</p>
                      <button
                        onClick={() => updateScene(i, { hx: undefined, hy: undefined, hSize: undefined, nx: undefined, ny: undefined, nSize: undefined })}
                        title="Zet de kop en het getal terug op hun automatische plek"
                        className="text-[10px] text-slate-500 hover:text-slate-300"
                      >
                        reset positie
                      </button>
                    </div>
                    <SceneField label="Kop (in beeld)" value={scene.headline ?? ""} onChange={(v) => updateScene(i, { headline: v || null })} />
                    <SceneField label="Accentwoord" value={scene.emphasis ?? ""} onChange={(v) => updateScene(i, { emphasis: v || null })} />
                    <div className="grid grid-cols-2 gap-2">
                      <SceneField label="Groot getal" value={scene.bigNumber ?? ""} onChange={(v) => updateScene(i, { bigNumber: v || null })} />
                      <SceneField label="Label bij getal" value={scene.numberLabel ?? ""} onChange={(v) => updateScene(i, { numberLabel: v || null })} />
                    </div>
                    <p className="text-[10px] text-slate-500">Je kunt de kop en het getal in het beeld verslepen en schalen.</p>
                  </div>
                )}

                <div className="pt-2 mt-1 border-t border-white/10 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Beeld</p>
                  {/* Wat er aan tekst in dit beeld hoort te staan. Zichtbaar maken
                      scheelt zoeken: zie je in het beeld een ander of fout woord,
                      dan is de spellingcontrole eroverheen gegaan en kun je het
                      via de chat rechtzetten. */}
                  {(scene.labels?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-slate-400">
                      Tekst in beeld:{" "}
                      {(scene.labels ?? []).map((l, li) => (
                        <span key={li} className="text-slate-200">
                          {li > 0 ? " · " : ""}{l}
                        </span>
                      ))}
                    </p>
                  )}
                  <SceneChat
                    messages={scene.chat ?? []}
                    busy={!!imgBusy[scene.id]}
                    creditLabel={creditLabel(CREDIT_COSTS.IMAGE_GENERATION)}
                    gratis={!!scene.layout}
                    onSend={(text, file) => sendSceneChat(i, text, file)}
                    onRevert={(msg) => revertSceneChat(i, msg)}
                  />
                  {scene.layout ? (
                    // Een zelfgetekende scene beweegt al uit zichzelf: elementen
                    // schuiven in op het moment dat de voice-over ze noemt. Hem
                    // door Seedance halen zou precies de glitches terugbrengen
                    // waarvoor deze modus bestaat.
                    <p className="text-[10px] text-slate-500">
                      Deze scene wordt door de app zelf getekend en beweegt mee met de voice-over: elk element verschijnt op het
                      moment dat het genoemd wordt. Geen AI-animatie, dus geen vervormingen — en de tekst blijft haarscherp.
                    </p>
                  ) : (
                    <>
                  <label className="block">
                    <span className="block text-[11px] text-slate-400 mb-0.5">Beweging bijsturen (optioneel)</span>
                    <input
                      value={motionInstr[scene.id] ?? ""}
                      onChange={(e) => setMotionInstr((m) => ({ ...m, [scene.id]: e.target.value }))}
                      placeholder="bijv. alleen de mensen laten bewegen, grafiek volledig stil"
                      className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <button
                    onClick={() => animateScene(i)}
                    disabled={motionBusy[scene.id] || !scene.imageUrl}
                    className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 px-3 py-1.5 rounded-md disabled:opacity-50 w-full"
                  >
                    {motionBusy[scene.id] ? "Animeren…" : scene.videoUrl ? "Opnieuw animeren" : "Animeer beeld (proef, ~1 min)"}
                    <span className="text-blue-300/60 ml-1">· {creditLabel(CREDIT_COSTS.VIDEO_GENERATION)}</span>
                  </button>
                  {motionSkipped[scene.id] && (
                    <div className="text-[10px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-1.5 space-y-1">
                      <p>Elke poging voegde iets toe wat niet in het beeld staat (bijv. een hand of extra object) en is daarom afgekeurd. Dit beeld krijgt in de video een <b>subtiele camerabeweging</b> in plaats van een animatie — je credits zijn teruggestort.</p>
                      <button onClick={() => animateScene(i)} className="text-amber-200 underline hover:text-amber-100">Opnieuw proberen</button>
                    </div>
                  )}
                  {motionNote[scene.id] && !motionBusy[scene.id] && !motionSkipped[scene.id] && (
                    <p className="text-[10px] text-emerald-300/90">{motionNote[scene.id]}</p>
                  )}
                  <p className="text-[10px] text-slate-500">Vuistregel: het model voegt niks toe wat niet in het beeld staat, het maakt alleen het bestaande bewegend. Een kritisch oog vergelijkt elke poging met het bronbeeld; komt er iets bij (bijv. een hand), dan wordt die poging nooit getoond en volgt automatisch (gratis) een nieuwe, voorzichtiger poging. Ook beelden met tekst worden geanimeerd; verandert de tekst ook maar iets, dan wordt die poging afgekeurd.</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => addScene(spec.scenes.length - 1)}
            className="text-sm text-slate-300 hover:text-white border border-dashed border-white/15 hover:border-white/30 rounded-lg px-4 py-2.5 w-full"
          >
            ＋ Scene toevoegen
          </button>
        </div>
      )}
    </div>
  );
}
