"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import EditableStoryScene from "@/components/infographics/render/EditableStoryScene";
import StoryPlayer from "@/components/infographics/render/StoryPlayer";
import PdfUploadButton from "@/components/infographics/PdfUploadButton";
import { splitVoiceDurations, storyWindows } from "@/lib/infographics/story-layout";
import { storyAspectRatio } from "@/lib/infographics/canvas-size";
import { createClient } from "@/lib/supabase/client";
import type { StorySpec } from "@/lib/infographics/story-schema";
import { STORY_VOICES, DEFAULT_VOICE, voicePreviewUrl } from "@/lib/infographics/story-voices";
import { STORY_FONTS, DEFAULT_STORY_FONT, nearestStoryFont, STORY_FONTS_CSS_HREF } from "@/lib/infographics/story-fonts";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import type { BrandKit } from "@/lib/types";
import type { StoryScene } from "@/lib/infographics/story-schema";

// Storytelling-infographic generator: onderwerp + brontekst in, AI schrijft een
// verhaalboog en genereert per scene een platte illustratie; de typografie ligt
// er in SVG overheen.

// ~6 seconden per scene (praktijk: 5-7s). Gebruikt voor de live lengteschatting.
const SECS_PER_SCENE = 6;

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
  const [mode, setMode] = useState<"story" | "report">("story");
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  // Gewenste videolengte in seconden; bepaalt hoeveel scenes de AI maakt.
  const [targetSeconds, setTargetSeconds] = useState(90);
  const [navy, setNavy] = useState("#16243f");
  const [accent, setAccent] = useState("#e8643c");
  // Huisstijl-typografie (uit de brand kit; met keuze/override) en het logo, dat
  // de gebruiker zelf uploadt (niet uit de website of brand kit).
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_STORY_FONT);
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
  const [imgHistory, setImgHistory] = useState<Record<string, string[]>>({});
  const [editInstr, setEditInstr] = useState<Record<string, string>>({});
  const [motionInstr, setMotionInstr] = useState<Record<string, string>>({});
  const [voiceBusy, setVoiceBusy] = useState(false);
  // Gekozen stem voor de voice-over + de stem die nu (als preview) speelt.
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  // Spreeksnelheid van de voice-over (ElevenLabs); 1 = normaal.
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("rustige, lichte corporate explainer-muziek");
  const [motionBusy, setMotionBusy] = useState<Record<string, boolean>>({});
  // Scenes waarvan de animatie is overgeslagen omdat het beeld tekst bevat (blijft
  // een still om vervorming te voorkomen; de gebruiker kan toch forceren).
  const [motionSkipped, setMotionSkipped] = useState<Record<string, boolean>>({});
  const [animatingAll, setAnimatingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Persistentie: het verhaal hangt aan een project (mode 'story'). projectId is
  // null tot de eerste opslag; daarna richten autosaves zich op dat project.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  // Bewaar het verhaal. Kleuren reizen mee in de spec zodat een herladen verhaal
  // er identiek uitziet. Geeft het (eventueel nieuwe) project-id terug.
  const save = useCallback(
    async (silent = false): Promise<string | null> => {
      if (!spec) return null;
      if (!silent) setSaving(true);
      try {
        const specToSave: StorySpec = { ...spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled };
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
        if (!silent) setSaving(false);
      }
    },
    [spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled, projectId, topic]
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
        if (loaded.accent) setAccent(loaded.accent);
        if (loaded.voice) setVoice(loaded.voice);
        if (loaded.voiceSpeed) setVoiceSpeed(loaded.voiceSpeed);
        if (loaded.fontFamily) setFontFamily(loaded.fontFamily);
        if (loaded.logoUrl) setLogoUrl(loaded.logoUrl);
        if (typeof loaded.logoEnabled === "boolean") setLogoEnabled(loaded.logoEnabled);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingProject(false);
      }
    })();
  }, []);

  // Debounced autosave: zodra er een opgeslagen project is, bewaren we wijzigingen
  // aan de spec automatisch (stil, ~1,5s na de laatste verandering).
  const firstSpec = useRef(true);
  useEffect(() => {
    if (!projectId || !spec) return;
    if (firstSpec.current) { firstSpec.current = false; return; }
    const t = setTimeout(() => { void save(true); }, 1500);
    return () => clearTimeout(t);
  }, [spec, navy, accent, voice, voiceSpeed, fontFamily, logoUrl, logoEnabled, projectId, save]);

  // Huisstijlen van de gebruiker ophalen (voor de stem-/kleurkeuze in stap 1).
  useEffect(() => {
    fetch("/api/brand-kits")
      .then((r) => (r.ok ? r.json() : { brandKits: [] }))
      .then((d) => setBrandKits((d.brandKits ?? []) as BrandKit[]))
      .catch(() => {});
  }, []);

  // Past een brand kit toe: tekstkleur ← primair (val terug op secundair),
  // accent ← accent, font ← dichtstbijzijnde gebundelde keuze. Alles blijft daarna
  // handmatig overschrijfbaar. Het logo komt NIET uit de kit maar uploadt de
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

  async function generate() {
    setLoading(true);
    setErr(null);
    setSpec(null);
    try {
      const res = await fetch("/api/infographics/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, text, mode, format, targetSeconds, brandColors: brandColorsPayload() }),
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
    firstSpec.current = true;
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
      voiceover: "", headline: "", emphasis: null, bigNumber: null, numberLabel: null,
      illustration: "", imageUrl: null,
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
  // Zet het vorige beeld van een scene terug (undo van een regeneratie/bewerking).
  function revertImage(i: number) {
    if (!spec) return;
    const s = spec.scenes[i];
    const hist = imgHistory[s.id];
    if (!hist || hist.length === 0) return;
    const prevUrl = hist[hist.length - 1];
    setImgHistory((h) => ({ ...h, [s.id]: hist.slice(0, -1) }));
    updateScene(i, { imageUrl: prevUrl });
  }

  async function sceneImage(i: number, payload: Record<string, unknown>) {
    if (!spec) return;
    const s = spec.scenes[i];
    const prevImage = s.imageUrl ?? null;
    setErr(null);
    setImgBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const res = await fetch("/api/infographics/scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: spec.format,
          // Consistentie: verhaal-seed + anker (behalve voor de anker-scene zelf).
          seed: spec.seed ?? undefined,
          anchorImageUrl: spec.anchorImageUrl && spec.anchorImageUrl !== s.imageUrl ? spec.anchorImageUrl : undefined,
          ...payload,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Beeld bijwerken mislukt"));
      // Beeldhistorie: het vorige beeld bewaren zodat je terug kunt (undo).
      if (prevImage) setImgHistory((h) => ({ ...h, [s.id]: [...(h[s.id] ?? []), prevImage].slice(-10) }));
      updateScene(i, { imageUrl: d.imageUrl });
      // Nieuw beeld → tekst-status kan gewijzigd zijn; skip-melding wissen.
      setMotionSkipped((m) => ({ ...m, [s.id]: false }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImgBusy((b) => ({ ...b, [s.id]: false }));
    }
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
        body: JSON.stringify({ text, voice, speed: voiceSpeed }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Voice-over mislukt"));
      const durs = splitVoiceDurations(spec.scenes, d.duration);
      setSpec((prev) => prev ? {
        ...prev,
        voiceUrl: d.audioUrl,
        voiceDuration: d.duration,
        voice,
        scenes: prev.scenes.map((s, idx) => ({ ...s, voiceDuration: durs[idx] })),
      } : prev);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceBusy(false);
    }
  }

  // Genereert een instrumentaal achtergrond-muziekbed (CassetteAI) voor de hele
  // videolengte en hangt het aan de spec. Wordt zacht onder de voice gemixt.
  async function genMusic() {
    if (!spec) return;
    setErr(null);
    setMusicBusy(true);
    try {
      const total = storyWindows(spec.scenes).total;
      const res = await fetch("/api/infographics/story-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: musicPrompt, duration: Math.ceil(total) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Muziekbed mislukt"));
      setSpec((prev) => prev ? { ...prev, musicUrl: d.musicUrl, musicPrompt } : prev);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMusicBusy(false);
    }
  }

  // Autosync (zoals de Creator Studio): legt de scenegrenzen op de echte
  // woordtiming in de voice-over, zodat beeld en stem gelijk lopen. Vereist een
  // gegenereerde voice-over (spec.voiceUrl).
  async function autoSync() {
    if (!spec) return;
    if (!spec.voiceUrl) { setErr("Genereer eerst de voice-over voordat je autosynct."); return; }
    setErr(null);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function animateScene(i: number, force = false) {
    if (!spec) return;
    const s = spec.scenes[i];
    if (!s.imageUrl) return;
    // De vuistregel ("verzin niets bij") zit in de route; hier sturen we alleen
    // de optionele bijsturing mee van wat er wél/niet moet bewegen. force=true
    // negeert de tekst-check (animeren ondanks tekst in beeld).
    const steer = (motionInstr[s.id] ?? "").trim();
    setErr(null);
    setMotionBusy((b) => ({ ...b, [s.id]: true }));
    try {
      const res = await fetch("/api/infographics/scene-motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: s.imageUrl, steer, force }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(apiError(d, "Animeren mislukt"));
      // Beeld bevat tekst → route sloeg animatie over; als still houden.
      if (d.skipped) { setMotionSkipped((m) => ({ ...m, [s.id]: true })); return; }
      setMotionSkipped((m) => ({ ...m, [s.id]: false }));
      updateScene(i, { videoUrl: d.videoUrl });
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
        body: JSON.stringify({ spec, navy, accent, fontFamily, logoUrl: logoEnabled ? logoUrl : null }),
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
      <link rel="stylesheet" href={STORY_FONTS_CSS_HREF} />
      <h1 className="text-xl font-bold text-white mb-1">Storytelling-infographic</h1>
      <p className="text-sm text-slate-400 mb-6">AI schrijft een verhaalboog en genereert per scene een platte illustratie. Tekst ligt er in SVG overheen.</p>
      {loadingProject && <p className="text-sm text-blue-300 mb-4">Verhaal laden…</p>}

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 mb-8">
        <label className="block">
          <span className="block text-[11px] text-slate-400 mb-0.5">Onderwerp / titel</span>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="bijv. De geschiedenis van de VOC" className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
        </label>
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[11px] text-slate-400">Brontekst / data (cijfers worden hier letterlijk uit gehaald)</span>
            <PdfUploadButton onExtracted={(t) => setText(t)} />
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Plak hier je bron: cijfers, feiten en kernpunten. De AI maakt er een verhaalboog van. (Of upload een PDF.)" className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white" />
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
            <label className="block">
              <span className="block text-[11px] text-slate-400 mb-0.5">Lettertype</span>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                style={{ fontFamily: `${fontFamily}, system-ui, sans-serif` }}
              >
                {STORY_FONTS.map((f) => (<option key={f.id} value={f.family}>{f.label}{f.note ? ` — ${f.note}` : ""}</option>))}
              </select>
            </label>
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
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Modus</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as "story" | "report")} className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-sm text-white">
              <option value="story">Verhaal</option>
              <option value="report">Rapport</option>
            </select>
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
            <span className="block text-[11px] text-slate-400 mb-0.5">Tekstkleur{brandKitId ? " · uit huisstijl" : ""}</span>
            <input type="color" value={navy} onChange={(e) => { setNavy(e.target.value); setBrandKitId(""); }} className="h-9 w-14 bg-transparent border border-white/10 rounded cursor-pointer" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-slate-400 mb-0.5">Accent{brandKitId ? " · uit huisstijl" : ""}</span>
            <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setBrandKitId(""); }} className="h-9 w-14 bg-transparent border border-white/10 rounded cursor-pointer" />
          </label>
          <button onClick={generate} disabled={loading || !text.trim()} title={!text.trim() ? "Vul eerst een brontekst in" : `${CREDIT_COSTS.SCRIPT_GENERATION} credit script + ${CREDIT_COSTS.IMAGE_GENERATION} per scene`} className="btn-primary text-sm disabled:opacity-50">
            {loading ? "Genereren… (script + beelden)" : "Genereer verhaal"}
            <span className="text-white/70 ml-1">· {CREDIT_COSTS.SCRIPT_GENERATION}+{CREDIT_COSTS.IMAGE_GENERATION}/scene cr.</span>
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
              {savedAt && !saving && <span>bewaard om {savedAt}</span>}
            </div>

            {/* Audio: stemkeuze + voice-over + sync + muziek. */}
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Audio</p>
              <div className="flex flex-wrap gap-2">
                {STORY_VOICES.map((v) => {
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
                  <span className="text-slate-400 ml-1">· {CREDIT_COSTS.VOICE} cr.</span>
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
                  title="Legt de scenes precies op de gesproken voice-over (Whisper)."
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md disabled:opacity-50"
                >
                  {syncBusy ? "Autosync…" : "Autosync op voice"}
                  <span className="text-slate-400 ml-1">· {CREDIT_COSTS.SYNC} cr.</span>
                </button>
                <span className="w-px self-stretch bg-white/10 mx-1" />
                <input
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="muziekstijl"
                  title="Stijl van het achtergrond-muziekbed"
                  className="bg-slate-900/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white w-48"
                />
                <button
                  onClick={genMusic}
                  disabled={musicBusy}
                  title="Genereert een zacht instrumentaal muziekbed (CassetteAI) onder de voice-over."
                  className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-1.5 rounded-md disabled:opacity-50"
                >
                  {musicBusy ? "Muziek…" : spec.musicUrl ? "Muziek opnieuw" : "Genereer muziekbed"}
                  <span className="text-slate-400 ml-1">· {CREDIT_COSTS.MUSIC} cr.</span>
                </button>
                {spec.musicUrl ? <span className="text-xs text-emerald-400">muziekbed klaar</span> : null}
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
              <button onClick={() => save()} disabled={saving} className="text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 px-4 py-1.5 rounded-md disabled:opacity-50">
                {saving ? "Opslaan…" : projectId ? "Opslaan" : "Bewaar verhaal"}
              </button>
              <button onClick={resetStory} className="text-sm text-slate-400 hover:text-white ml-auto">Nieuw verhaal (ander formaat)</button>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-white mb-3">Voorvertoning (video)</p>
            <StoryPlayer spec={spec} navy={navy} accent={accent} fontFamily={fontFamily} logoUrl={logoEnabled ? logoUrl : null} />
          </div>

          <h3 className="text-sm font-semibold text-slate-300">Scenes bewerken</h3>
          {spec.scenes.map((scene, i) => (
            <div key={scene.id} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#f3f1ec]" style={{ aspectRatio: aspect }}>
                {scene.videoUrl ? (
                  <video src={scene.videoUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                ) : scene.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-slate-400 text-xs">geen illustratie</div>
                )}
                <EditableStoryScene scene={scene} format={spec.format} navy={navy} accent={accent} fontFamily={fontFamily} logoUrl={logoEnabled ? logoUrl : null} onChange={(patch) => updateScene(i, patch)} />
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
                    <button
                      onClick={() => updateScene(i, { hx: undefined, hy: undefined, hSize: undefined, nx: undefined, ny: undefined, nSize: undefined })}
                      className="text-[10px] text-slate-500 hover:text-slate-300 ml-1"
                    >
                      reset positie
                    </button>
                  </div>
                </div>
                <SceneField label="Kop (in beeld)" value={scene.headline} onChange={(v) => updateScene(i, { headline: v })} />
                <SceneField label="Accentwoord" value={scene.emphasis ?? ""} onChange={(v) => updateScene(i, { emphasis: v || null })} />
                <div className="grid grid-cols-2 gap-2">
                  <SceneField label="Groot getal" value={scene.bigNumber ?? ""} onChange={(v) => updateScene(i, { bigNumber: v || null })} />
                  <SceneField label="Label bij getal" value={scene.numberLabel ?? ""} onChange={(v) => updateScene(i, { numberLabel: v || null })} />
                </div>
                <label className="block">
                  <span className="block text-[11px] text-slate-400 mb-0.5">Voice-over</span>
                  <textarea value={scene.voiceover} onChange={(e) => updateScene(i, { voiceover: e.target.value })} rows={2} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-slate-200" />
                </label>
                {scene.voiceDuration ? <p className="text-[10px] text-slate-500">scene-tijd: {scene.voiceDuration.toFixed(1)}s</p> : null}

                <div className="pt-2 mt-1 border-t border-white/10 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Beeld</p>
                  <label className="block">
                    <span className="block text-[11px] text-slate-400 mb-0.5">Illustratie-briefing (Engels)</span>
                    <textarea value={scene.illustration} onChange={(e) => updateScene(i, { illustration: e.target.value })} rows={3} className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-slate-200" />
                  </label>
                  <button
                    onClick={() => sceneImage(i, { mode: "generate", illustration: scene.illustration, brandColors: brandColorsPayload() })}
                    disabled={imgBusy[scene.id]}
                    title={`Kost ${CREDIT_COSTS.IMAGE_GENERATION} credit`}
                    className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50 w-full"
                  >
                    Regenereer beeld <span className="text-slate-400">· {CREDIT_COSTS.IMAGE_GENERATION} cr.</span>
                  </button>
                  {(imgHistory[scene.id]?.length ?? 0) > 0 && (
                    <button onClick={() => revertImage(i)} title="Zet het vorige beeld terug" className="text-[11px] text-slate-400 hover:text-white underline">
                      ↩ vorige versie terugzetten
                    </button>
                  )}
                  <label className="block">
                    <span className="block text-[11px] text-slate-400 mb-0.5">Of pas iets aan in dit beeld</span>
                    <input
                      value={editInstr[scene.id] ?? ""}
                      onChange={(e) => setEditInstr((m) => ({ ...m, [scene.id]: e.target.value }))}
                      placeholder="bijv. verwijder het prijskaartje"
                      className="w-full bg-slate-900/60 border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <button
                    onClick={() => sceneImage(i, { mode: "edit", sourceImageUrl: scene.imageUrl, instruction: editInstr[scene.id] ?? "", illustration: scene.illustration })}
                    disabled={imgBusy[scene.id] || !scene.imageUrl || !(editInstr[scene.id] ?? "").trim()}
                    title={`Kost ${CREDIT_COSTS.IMAGE_GENERATION} credit`}
                    className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50 w-full"
                  >
                    Pas beeld aan <span className="text-slate-400">· {CREDIT_COSTS.IMAGE_GENERATION} cr.</span>
                  </button>
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
                    <span className="text-blue-300/60 ml-1">· {CREDIT_COSTS.VIDEO_GENERATION} cr.</span>
                  </button>
                  {motionSkipped[scene.id] && (
                    <div className="text-[10px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded px-2 py-1.5 space-y-1">
                      <p>Dit beeld bevat tekst/cijfers en is als <b>stilstaand beeld</b> gehouden — zo vervormt de tekst niet. In de video beweegt de camera er subtiel overheen.</p>
                      <button onClick={() => animateScene(i, true)} className="text-amber-200 underline hover:text-amber-100">Toch animeren (tekst kan vervormen)</button>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">Vuistregel: het model voegt niks toe wat niet in het beeld staat, het maakt alleen het bestaande bewegend. Beelden met tekst blijven automatisch stil.</p>
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
