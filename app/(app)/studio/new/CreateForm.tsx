"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// localStorage-sleutel voor het lopende concept-project. Zo hergebruikt het
// idee-formulier hetzelfde project bij terug-navigeren i.p.v. een nieuw (leeg)
// project te maken — anders ben je je gegenereerde werk kwijt.
const DRAFT_KEY = "studio-draft-id";
import { createClient } from "@/lib/supabase/client";
import CharacterPicker from "@/components/studio/CharacterPicker";
import { BrandKit, Character, OutroContact, VisualStyle } from "@/lib/types";
import StylePicker from "@/components/StylePicker";

/** Lees een fetch-respons veilig als JSON, ook als de body leeg of geen JSON is. */
async function readJson(res: Response): Promise<{ idea?: string; error?: string }> {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

const FORMATS = [
  { value: "16:9", label: "Liggend (16:9) - YouTube, presentaties" },
  { value: "9:16", label: "Staand (9:16) - TikTok, Reels, Shorts" },
] as const;

const SCENE_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15] as const;

const IDEA_TEMPLATES: { label: string; emoji: string; text: string }[] = [
  {
    label: "Uitlegvideo",
    emoji: "💡",
    text: "Een korte uitlegvideo voor [bedrijfsnaam], een [type dienst]. We volgen een hoofdpersoon die het probleem herkent dat onze doelgroep heeft (bijvoorbeeld te veel tijd kwijt aan administratie). Hij ontdekt onze oplossing en we zien hoe zijn werkdag verandert: meer rust, betere resultaten. De video eindigt met een warme uitnodiging om een gratis kennismaking te plannen.",
  },
  {
    label: "Productdemo",
    emoji: "🚀",
    text: "Productdemo voor [product]. Open met een korte hook over het probleem dat het oplost. Daarna laten we de drie belangrijkste features in actie zien via concrete scenes (geen UI-screenshots maar mensen die het gebruiken). Eindig met een sterke call-to-action: probeer het nu gratis op [website].",
  },
  {
    label: "Klantverhaal",
    emoji: "⭐",
    text: "Klantverhaal van [klantnaam], een tevreden klant van [bedrijfsnaam]. We beginnen bij de situatie vóór onze samenwerking: welke uitdaging speelde er. Daarna het keerpunt waarop onze oplossing in beeld kwam, en we sluiten af met het resultaat: meer omzet, blije klanten, rust in het hoofd. Authentiek en geloofwaardig.",
  },
  {
    label: "Teamintro",
    emoji: "👋",
    text: "Maak kennis met het team van [bedrijfsnaam]. We zien drie tot vijf collega's in hun werkomgeving, elk met een korte intro: wie ze zijn, waar ze gepassioneerd over zijn, wat ze bijdragen aan onze klanten. Warm en menselijk, zodat je na het kijken het gevoel hebt het team al een beetje te kennen.",
  },
  {
    label: "Recruitment",
    emoji: "🎯",
    text: "Wervingsvideo voor [vacature] bij [bedrijfsnaam]. We laten zien wie wij zijn, hoe het is om bij ons te werken, en wat we zoeken in een nieuwe collega. Een glimp van de cultuur, het werk, de groei-mogelijkheden en de mensen. Eindigt met een directe uitnodiging om te solliciteren.",
  },
  {
    label: "Webinar/event",
    emoji: "📅",
    text: "Aankondiging voor een webinar/event van [bedrijfsnaam] op [datum]. We pakken de kijker bij de kraag met de belangrijkste belofte (wat ga je leren of meenemen?). Dan een korte preview van de inhoud, wie de spreker is en waarom dat ertoe doet. Sluit af met een duidelijke uitnodiging om aan te melden.",
  },
];

const TONES = ["Helder en zakelijk", "Warm en persoonlijk", "Energiek en speels", "Inspirerend"] as const;

async function resizeToBlob(file: File, maxDim = 1280, format: "jpeg" | "png" = "jpeg"): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  ctx.drawImage(img, 0, 0, w, h);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Blob conversie mislukt")), mime, format === "jpeg" ? 0.9 : undefined);
  });
}

type Preview = { file: File; previewUrl: string };

interface CreateFormProps {
  userId:                 string;
  brandKits:              BrandKit[];
  characters:             Character[];
  onSwitchToCharacters?:  () => void;
}

export default function CreateForm({ userId, brandKits, characters, onSwitchToCharacters }: CreateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  const [sceneCount, setSceneCount] = useState<number>(8);
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("Schilderachtig");
  const [brandKitId, setBrandKitId] = useState<string>("");
  const [mainCharacterId, setMainCharacterId] = useState<string>("");
  const [supportingCharacterId, setSupportingCharacterId] = useState<string>("");
  const [outroLogo, setOutroLogo] = useState<Preview | null>(null);
  const [outro, setOutro] = useState<OutroContact>({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  type IdeaMode = "smart" | "self" | "templates" | "wizard" | "expand" | "website" | "pdf" | "research";

  interface ResearchResult {
    company_name: string;
    tagline: string;
    idea_brief: string;
    tone_of_voice: string;
    communication_style: string;
    brand_values: string[];
    do_nots: string;
    colors: { primary?: string; secondary?: string; accent?: string; background?: string };
    fonts: { primary?: string; secondary?: string };
    environment: string;
    logo_url?: string | null;
    workPhotos: { url: string; description: string; id?: string; role?: string; element?: string }[];
    sourceUrl: string;
  }
  const [ideaMode, setIdeaMode] = useState<IdeaMode>("smart");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [ideaAudience, setIdeaAudience] = useState("");
  const [ideaMessage, setIdeaMessage] = useState("");
  const [ideaTone, setIdeaTone] = useState<string>("");
  const [ideaCharacter, setIdeaCharacter] = useState("");
  const [ideaSeed, setIdeaSeed] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [ideaLoading, setIdeaLoading] = useState<"" | "expand" | "wizard" | "website" | "smart" | "pdf" | "research">("");
  const [ideaError, setIdeaError] = useState("");

  // Diepgaand website-onderzoek (review-flow).
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [researchBrief, setResearchBrief] = useState("");
  const [researchPhotos, setResearchPhotos] = useState<string[]>([]); // geselecteerde foto-URLs
  const [applyingResearch, setApplyingResearch] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [extraKits, setExtraKits] = useState<BrandKit[]>([]);

  // Concept-project: hergebruik hetzelfde project bij terug-navigeren, en vul de
  // eerder ingevulde velden terug. "Nieuw project" (?new) start expliciet vers.
  const [draftId, setDraftId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== null) {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      // URL opschonen zodat 'terug' later het concept hervat i.p.v. opnieuw te wissen.
      window.history.replaceState(null, "", "/studio/new");
      return;
    }
    let id: string | null = null;
    try { id = localStorage.getItem(DRAFT_KEY); } catch {}
    if (!id) return;
    (async () => {
      const supabase = createClient();
      const { data: p } = await supabase
        .from("projects")
        .select("title, notes, format, visual_style, brand_kit_id, main_character_id, supporting_character_id, outro_contact, mode")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!p || p.mode !== "studio") { try { localStorage.removeItem(DRAFT_KEY); } catch {} return; }
      setDraftId(id);
      setTitle(p.title ?? "");
      setIdea(p.notes ?? "");
      if (p.format === "16:9" || p.format === "9:16") setFormat(p.format);
      if (p.visual_style) setVisualStyle(p.visual_style as VisualStyle);
      setBrandKitId(p.brand_kit_id ?? "");
      setMainCharacterId(p.main_character_id ?? "");
      setSupportingCharacterId(p.supporting_character_id ?? "");
      setOutro((p.outro_contact ?? {}) as OutroContact);
      if ((p.notes ?? "").trim()) setIdeaMode("self");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function startFresh() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    window.location.href = "/studio/new?new=1";
  }

  async function runDeepResearch() {
    const urls = ideaUrl.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (urls.length === 0) { setIdeaError("Vul een URL in"); return; }
    setIdeaError("");
    setResearch(null);
    setIdeaLoading("research");
    try {
      const res = await fetch("/api/studio/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) { setIdeaError(data.error ?? "Onderzoek mislukt"); return; }
      const r = data.research as ResearchResult;
      setResearch(r);
      setResearchBrief(r.idea_brief ?? "");
      setResearchPhotos((r.workPhotos ?? []).map(p => p.url)); // standaard alle gevonden foto's aan
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  // Eigen werkfoto's handmatig toevoegen als referentie (bijv. foto's die niet op
  // de website staan). Worden naar storage geüpload en aan de selectie toegevoegd.
  async function handleManualPhotos(files: FileList) {
    if (!research || files.length === 0) return;
    setUploadingPhotos(true);
    setIdeaError("");
    try {
      const supabase = createClient();
      const stamp = Date.now();
      const added: ResearchResult["workPhotos"] = [];
      let i = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
        const path = `${userId}/research-manual/${stamp}-${i}.${ext}`;
        const { error } = await supabase.storage.from("scene-assets").upload(path, file, { contentType: file.type, upsert: true });
        if (error) { setIdeaError(`Upload mislukt: ${error.message}`); continue; }
        const url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
        added.push({ url, description: "Eigen foto", id: `manual-${stamp}-${i}`, role: "other", element: "" });
        i++;
      }
      if (added.length > 0) {
        setResearch(prev => prev ? { ...prev, workPhotos: [...prev.workPhotos, ...added] } : prev);
        setResearchPhotos(prev => [...prev, ...added.map(a => a.url)]);
      }
    } finally {
      setUploadingPhotos(false);
    }
  }

  // Bijschrift van een eigen foto bijwerken (wordt het 'element' dat de Ai nabootst).
  function setManualCaption(url: string, text: string) {
    setResearch(prev => prev ? {
      ...prev,
      workPhotos: prev.workPhotos.map(p => p.url === url ? { ...p, element: text, description: text.trim() || "Eigen foto" } : p),
    } : prev);
  }

  async function applyResearch() {
    if (!research) return;
    setApplyingResearch(true);
    setIdeaError("");
    try {
      const photos = (research.workPhotos ?? []).filter(p => researchPhotos.includes(p.url));
      const domain = (() => { try { return new URL(research.sourceUrl).hostname.replace(/^www\./, ""); } catch { return "Huisstijl"; } })();
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: research.company_name?.trim() || domain,
          description: [research.tagline, research.communication_style ? `Communicatiestijl: ${research.communication_style}` : ""].filter(Boolean).join(" — "),
          tone_of_voice: research.tone_of_voice || null,
          brand_values: research.brand_values ?? [],
          colors: research.colors ?? {},
          fonts: research.fonts ?? {},
          environment: research.environment || null,
          do_nots: research.do_nots || null,
          logo_url: research.logo_url || null,
          reference_images: photos,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.brandKit) { setIdeaError(data.error ?? "Huisstijl aanmaken mislukt"); return; }
      const kit = data.brandKit as BrandKit;
      setExtraKits(prev => [kit, ...prev]);
      setBrandKitId(kit.id);
      setIdea(researchBrief || research.idea_brief || "");
      setIdeaMode("self");
      setResearch(null);
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingResearch(false);
    }
  }

  const [smartUrl, setSmartUrl] = useState("");
  const [smartGenre, setSmartGenre] = useState<string>("");
  const [smartSeed, setSmartSeed] = useState("");

  function applyTemplate(text: string) {
    setIdea(text);
    setIdeaError("");
    setIdeaMode("self");
  }

  async function expandIdeaWithAI() {
    if (!ideaSeed.trim()) {
      setIdeaError("Typ eerst een paar woorden om uit te werken");
      return;
    }
    setIdeaError("");
    setIdeaLoading("expand");
    try {
      const res = await fetch("/api/studio/expand-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:       "expand",
          seed:       ideaSeed,
          brandKitId: brandKitId || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.idea) {
        setIdeaError(data.error ?? "Uitwerken mislukt");
        return;
      }
      setIdea(data.idea);
      setIdeaMode("self");
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  async function buildIdeaSmart() {
    const trimmedUrl = smartUrl.trim();
    if (!trimmedUrl && !smartGenre && !smartSeed.trim()) {
      setIdeaError("Vul minstens een URL, type of korte beschrijving in");
      return;
    }
    setIdeaError("");
    setIdeaLoading("smart");
    try {
      const url = trimmedUrl ? (/^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`) : "";
      const genreTpl = IDEA_TEMPLATES.find(t => t.label === smartGenre);
      const res = await fetch("/api/studio/expand-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:       "smart",
          url,
          genre:      smartGenre,
          genreHint:  genreTpl?.text ?? "",
          seed:       smartSeed,
          brandKitId: brandKitId || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.idea) {
        setIdeaError(data.error ?? "Genereren mislukt");
        return;
      }
      setIdea(data.idea);
      setIdeaMode("self");
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  async function buildIdeaFromPdf() {
    if (!pdfFile) {
      setIdeaError("Upload eerst een PDF");
      return;
    }
    setIdeaError("");
    setIdeaLoading("pdf");
    try {
      const form = new FormData();
      form.append("file", pdfFile);
      if (brandKitId) form.append("brandKitId", brandKitId);
      const res = await fetch("/api/studio/expand-idea-pdf", { method: "POST", body: form });
      const data = await readJson(res);
      if (!res.ok || !data.idea) {
        setIdeaError(data.error ?? "PDF lezen mislukt");
        return;
      }
      setIdea(data.idea);
      setIdeaMode("self");
      setPdfFile(null);
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  async function buildIdeaFromWebsite() {
    const trimmed = ideaUrl.trim();
    if (!trimmed) {
      setIdeaError("Vul een URL in");
      return;
    }
    setIdeaError("");
    setIdeaLoading("website");
    try {
      const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const res = await fetch("/api/studio/expand-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:       "from-website",
          url,
          brandKitId: brandKitId || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.idea) {
        setIdeaError(data.error ?? "Website lezen mislukt");
        return;
      }
      setIdea(data.idea);
      setIdeaMode("self");
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  async function buildIdeaFromWizard() {
    if (!ideaAudience && !ideaMessage && !ideaTone && !ideaCharacter) {
      setIdeaError("Vul minstens 1 vraag in");
      return;
    }
    setIdeaError("");
    setIdeaLoading("wizard");
    try {
      const res = await fetch("/api/studio/expand-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:       "from-questions",
          audience:   ideaAudience,
          message:    ideaMessage,
          tone:       ideaTone,
          character:  ideaCharacter,
          brandKitId: brandKitId || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.idea) {
        setIdeaError(data.error ?? "Genereren mislukt");
        return;
      }
      setIdea(data.idea);
      setIdeaMode("self");
    } catch (err: unknown) {
      setIdeaError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdeaLoading("");
    }
  }

  function handleOutroLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOutroLogo({ file, previewUrl: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function removeOutroLogo() {
    if (outroLogo) URL.revokeObjectURL(outroLogo.previewUrl);
    setOutroLogo(null);
  }

  function setOutroField<K extends keyof OutroContact>(key: K, value: OutroContact[K]) {
    setOutro(prev => ({ ...prev, [key]: value }));
  }

  function applyBrandKit(id: string) {
    setBrandKitId(id);
    if (!id) return;
    const kit = brandKits.find(k => k.id === id);
    if (!kit) return;
    setOutroField("company_name", kit.name);
    if (kit.default_format === "9:16" || kit.default_format === "16:9") {
      setFormat(kit.default_format);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim()) {
      setError("Beschrijf eerst je idee");
      return;
    }
    setError("");
    setSubmitting(true);
    const supabase = createClient();
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    const projectTitle = title.trim() || `Studio - ${today}`;
    const cleanedOutro: OutroContact = Object.fromEntries(
      Object.entries(outro).filter(([, v]) => v && String(v).trim())
    ) as OutroContact;

    try {
      // Gedeelde velden voor zowel aanmaken als bijwerken van het concept.
      const fields = {
        title:                    projectTitle,
        language:                 "Dutch",
        format,
        visual_style:             visualStyle,
        notes:                    idea,
        mode:                     "studio",
        brand_kit_id:             brandKitId || null,
        main_character_id:        mainCharacterId || null,
        supporting_character_id:  supportingCharacterId || null,
        outro_contact:            cleanedOutro,
      };

      // Hergebruik het bestaande concept-project (terug-navigatie) i.p.v. een
      // nieuw project te maken — zo blijft al je gegenereerde werk behouden.
      let projectId: string;
      if (draftId) {
        setProgress("Project bijwerken...");
        const { error: updErr } = await supabase
          .from("projects")
          .update(fields)
          .eq("id", draftId)
          .eq("user_id", userId);
        if (updErr) throw new Error(updErr.message);
        projectId = draftId;
      } else {
        setProgress("Project aanmaken...");
        const { data: project, error: insertErr } = await supabase
          .from("projects")
          .insert({ user_id: userId, status: "Draft", ...fields })
          .select("id")
          .single();
        if (insertErr || !project) throw new Error(insertErr?.message ?? "Kon project niet aanmaken");
        projectId = project.id;
        try { localStorage.setItem(DRAFT_KEY, projectId); } catch {}
        setDraftId(projectId);
      }

      if (outroLogo) {
        setProgress("Logo uploaden...");
        const isPng = outroLogo.file.type === "image/png" || outroLogo.file.name.toLowerCase().endsWith(".png");
        const blob = await resizeToBlob(outroLogo.file, 1024, isPng ? "png" : "jpeg");
        const ext = isPng ? "png" : "jpg";
        const contentType = isPng ? "image/png" : "image/jpeg";
        const path = `${userId}/${projectId}/outro-logo.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("scene-assets")
          .upload(path, blob, { contentType, upsert: true });
        if (upErr) throw new Error(`Logo upload: ${upErr.message}`);
        const outro_logo_url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
        await supabase.from("projects").update({ outro_logo_url }).eq("id", projectId).eq("user_id", userId);
      }

      // replace (niet push): zo komt browser-terug nooit meer op deze aanmaak-
      // pagina uit (die anders een duplicaat-project zou maken). Het idee bewerk
      // je vanaf nu binnen de wizard zelf.
      router.replace(`/studio/${projectId}?scenes=${sceneCount}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setSubmitting(false);
      setProgress("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {draftId && (
        <div className="flex items-center justify-between gap-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-4 py-2.5">
          <p className="text-xs text-cyan-200">
            Je werkt verder aan een bestaand project — je idee en instellingen zijn bewaard.
          </p>
          <button type="button" onClick={startFresh} className="text-xs text-cyan-300 hover:text-white underline whitespace-nowrap">
            Nieuw project starten
          </button>
        </div>
      )}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Project titel <span className="text-slate-500 font-normal">(optioneel)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Bijv. Klant - Relatietherapeut intro video"
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Idee</label>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-1.5 mb-3 p-1 bg-slate-950/60 border border-white/10 rounded-lg">
            {([
              { id: "smart",     label: "Slim genereren",     emoji: "🎯" },
              { id: "self",      label: "Zelf typen",         emoji: "✏️" },
              { id: "templates", label: "Voorbeelden",        emoji: "📋" },
              { id: "wizard",    label: "Vragenlijst",        emoji: "❓" },
              { id: "expand",    label: "Korte zin → AI",     emoji: "✨" },
              { id: "website",   label: "Website lezen",      emoji: "🌐" },
              { id: "research",  label: "Diepgaand onderzoek", emoji: "🔍" },
              { id: "pdf",       label: "PDF lezen",          emoji: "📄" },
            ] as { id: IdeaMode; label: string; emoji: string }[]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setIdeaMode(tab.id); setIdeaError(""); }}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition ${
                  ideaMode === tab.id
                    ? "bg-cyan-600 text-white"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="mr-1">{tab.emoji}</span>{tab.label}
              </button>
            ))}
          </div>

          {ideaMode === "smart" && (
            <div className="bg-slate-950/60 border border-cyan-500/30 rounded-lg p-3 mb-2 space-y-3">
              <p className="text-xs text-slate-400">
                Combineer drie inputs voor het beste idee. Alles is optioneel — vul in wat je hebt.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  1. Website (optioneel)
                </label>
                <input
                  type="url"
                  value={smartUrl}
                  onChange={e => setSmartUrl(e.target.value)}
                  placeholder="https://www.jouwbedrijf.nl"
                  className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">AI leest de pagina en pakt het kernverhaal.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  2. Type video (optioneel)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSmartGenre("")}
                    className={`text-xs px-2 py-1 rounded-md border ${
                      smartGenre === ""
                        ? "bg-cyan-600 border-cyan-500 text-white"
                        : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    Geen voorkeur
                  </button>
                  {IDEA_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => setSmartGenre(tpl.label)}
                      className={`text-xs px-2 py-1 rounded-md border ${
                        smartGenre === tpl.label
                          ? "bg-cyan-600 border-cyan-500 text-white"
                          : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <span className="mr-1">{tpl.emoji}</span>{tpl.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Geeft richting aan de structuur.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  3. Korte beschrijving (optioneel)
                </label>
                <textarea
                  value={smartSeed}
                  onChange={e => setSmartSeed(e.target.value)}
                  rows={2}
                  placeholder="Bijv. focus op nieuwe klanten in Amsterdam, of: gericht op ZZP'ers"
                  className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={buildIdeaSmart}
                  disabled={ideaLoading !== "" || (!smartUrl.trim() && !smartGenre && !smartSeed.trim())}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-4 py-2 rounded-md"
                >
                  {ideaLoading === "smart" ? "Idee bouwen..." : "🎯 Genereer idee"}
                </button>
              </div>
            </div>
          )}

          {ideaMode === "templates" && (
            <div className="bg-slate-950/60 border border-white/10 rounded-lg p-3 mb-2 space-y-2">
              <p className="text-xs text-slate-400">
                Kies een voorbeeld als startpunt. De tekst komt in het idee-veld; daarna kun je vrij aanpassen.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {IDEA_TEMPLATES.map(tpl => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => applyTemplate(tpl.text)}
                    className="text-left text-xs bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-200 px-3 py-2 rounded-md"
                  >
                    <span className="mr-1.5">{tpl.emoji}</span>
                    <span className="font-medium">{tpl.label}</span>
                    <span className="block text-slate-500 mt-0.5 text-[11px] line-clamp-2">{tpl.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {ideaMode === "wizard" && (
            <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 mb-2 space-y-3">
              <p className="text-xs text-slate-400">
                Beantwoord wat je weet, AI maakt er een uitgewerkt idee van.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Voor wie?</label>
                  <input
                    type="text"
                    value={ideaAudience}
                    onChange={e => setIdeaAudience(e.target.value)}
                    placeholder="Bijv. ZZP-coaches die meer klanten willen"
                    className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Boodschap of CTA</label>
                  <input
                    type="text"
                    value={ideaMessage}
                    onChange={e => setIdeaMessage(e.target.value)}
                    placeholder="Bijv. plan een gratis kennismaking"
                    className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Toon</label>
                  <select
                    value={ideaTone}
                    onChange={e => setIdeaTone(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Kies een toon</option>
                    {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Hoofdpersoon (optioneel)</label>
                  <input
                    type="text"
                    value={ideaCharacter}
                    onChange={e => setIdeaCharacter(e.target.value)}
                    placeholder="Bijv. een gestreste ondernemer in de 40"
                    className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={buildIdeaFromWizard}
                  disabled={ideaLoading !== ""}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md"
                >
                  {ideaLoading === "wizard" ? "Genereren..." : "Maak idee"}
                </button>
              </div>
            </div>
          )}

          {ideaMode === "expand" && (
            <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 mb-2 space-y-2">
              <p className="text-xs text-slate-400">
                Typ een paar woorden of een zin, AI werkt het uit tot een volledige briefing.
              </p>
              <textarea
                value={ideaSeed}
                onChange={e => setIdeaSeed(e.target.value)}
                rows={2}
                placeholder="Bijv. video voor relatietherapeut die nieuwe klanten wil"
                className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={expandIdeaWithAI}
                  disabled={ideaLoading !== "" || !ideaSeed.trim()}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md"
                >
                  {ideaLoading === "expand" ? "Uitwerken..." : "✨ Werk uit met AI"}
                </button>
              </div>
            </div>
          )}

          {ideaMode === "pdf" && (
            <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 mb-2 space-y-2">
              <p className="text-xs text-slate-400">
                Upload een PDF (offerte, brochure, whitepaper). AI extract de kernpunten en
                maakt er een explainer-idee van.
              </p>
              {pdfFile ? (
                <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/60 border border-white/10 rounded-md px-3 py-2">
                  <span>📄</span>
                  <span className="truncate flex-1">{pdfFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setPdfFile(null)}
                    className="text-slate-500 hover:text-slate-200"
                  >×</button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setPdfFile(f); e.target.value = ""; }}
                  className="block w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-cyan-600 file:text-white"
                />
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={buildIdeaFromPdf}
                  disabled={ideaLoading !== "" || !pdfFile}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md"
                >
                  {ideaLoading === "pdf" ? "Lezen..." : "📄 Lees PDF"}
                </button>
              </div>
            </div>
          )}

          {ideaMode === "website" && (
            <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 mb-2 space-y-2">
              <p className="text-xs text-slate-400">
                Geef een URL op. AI leest de pagina en maakt er een explainer-idee van.
              </p>
              <input
                type="url"
                value={ideaUrl}
                onChange={e => setIdeaUrl(e.target.value)}
                placeholder="https://www.jouwbedrijf.nl"
                className="w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={buildIdeaFromWebsite}
                  disabled={ideaLoading !== "" || !ideaUrl.trim()}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md"
                >
                  {ideaLoading === "website" ? "Lezen..." : "🌐 Lees website"}
                </button>
              </div>
            </div>
          )}

          {ideaMode === "research" && (
            <div className="bg-slate-950/60 border border-cyan-500/20 rounded-lg p-3 mb-2 space-y-3">
              <p className="text-xs text-slate-400">
                AI onderzoekt de héle website: kernverhaal, tone of voice, communicatiestijl,
                huisstijlkleuren, het logo én echte werkfoto&apos;s. Maakt automatisch een huisstijl aan en
                gebruikt de foto&apos;s als referentie, zodat het meteen jouw bedrijf is. (3 credits)
                <br />
                <span className="text-slate-500">Tip: zet er extra pagina&apos;s bij (één URL per regel) — bijv. een
                galerij- of werk-pagina — zodat ook foto&apos;s die niet op de homepage staan worden meegenomen.</span>
              </p>
              <div className="flex gap-2 items-start">
                <textarea
                  value={ideaUrl}
                  onChange={e => setIdeaUrl(e.target.value)}
                  rows={2}
                  placeholder={"https://www.jouwbedrijf.nl\nhttps://www.jouwbedrijf.nl/galerij"}
                  className="flex-1 bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder:text-slate-500 resize-y"
                />
                <button
                  type="button"
                  onClick={runDeepResearch}
                  disabled={ideaLoading !== "" || !ideaUrl.trim()}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md whitespace-nowrap"
                >
                  {ideaLoading === "research" ? "Onderzoeken…" : "🔍 Onderzoek"}
                </button>
              </div>

              {research && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{research.company_name || "Onderzoeksresultaat"}</p>
                    {research.tagline && <p className="text-xs text-slate-400">{research.tagline}</p>}
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Brief</span>
                    <textarea
                      value={researchBrief}
                      onChange={e => setResearchBrief(e.target.value)}
                      rows={4}
                      className="mt-1 w-full bg-slate-900/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Kleuren</span>
                      <div className="flex gap-1.5 mt-1">
                        {(["primary", "secondary", "accent", "background"] as const).map(k => {
                          const c = research.colors?.[k];
                          return c ? (
                            <div key={k} title={`${k}: ${c}`} className="w-6 h-6 rounded border border-white/20" style={{ background: c }} />
                          ) : null;
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tone of voice</span>
                      <p className="text-slate-300 mt-1">{research.tone_of_voice || "—"}</p>
                    </div>
                  </div>

                  {research.brand_values?.length > 0 && (
                    <p className="text-xs text-slate-400"><span className="text-slate-500">Waarden:</span> {research.brand_values.join(", ")}</p>
                  )}
                  {research.do_nots && (
                    <p className="text-xs text-slate-400"><span className="text-slate-500">Do-nots:</span> {research.do_nots}</p>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Werkfoto&apos;s ({researchPhotos.length} geselecteerd als referentie)
                      </span>
                      <label className={`text-[11px] px-2 py-1 rounded-md border border-cyan-500/40 text-cyan-200 cursor-pointer ${uploadingPhotos ? "opacity-50" : "hover:bg-cyan-600/20"}`}>
                        {uploadingPhotos ? "Uploaden…" : "+ Eigen foto's"}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingPhotos}
                          onChange={e => { if (e.target.files) handleManualPhotos(e.target.files); e.currentTarget.value = ""; }}
                        />
                      </label>
                    </div>
                    {research.workPhotos.length === 0 ? (
                      <p className="text-[11px] text-slate-500 mt-1.5">Nog geen foto&apos;s gevonden — voeg hierboven je eigen werkfoto&apos;s toe.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {research.workPhotos.map(p => {
                          const on = researchPhotos.includes(p.url);
                          const manual = (p.id ?? "").startsWith("manual-");
                          return (
                            <div key={p.url} className="w-20">
                              <button
                                type="button"
                                onClick={() => setResearchPhotos(prev => on ? prev.filter(u => u !== p.url) : [...prev, p.url])}
                                className={`relative w-20 h-14 rounded overflow-hidden border-2 ${on ? "border-cyan-400" : "border-transparent opacity-50"}`}
                                title={on ? "Klik om uit te sluiten" : "Klik om te gebruiken"}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.url} alt="werkfoto" className="w-full h-full object-cover" />
                                {on && <span className="absolute top-0.5 right-0.5 bg-cyan-400 text-black text-[9px] px-1 rounded">✓</span>}
                              </button>
                              {manual && (
                                <input
                                  type="text"
                                  value={p.element ?? ""}
                                  onChange={e => setManualCaption(p.url, e.target.value)}
                                  placeholder="wat staat erop?"
                                  className="w-20 mt-1 bg-slate-900/60 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white placeholder:text-slate-600"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={() => setResearch(null)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5">
                      Verwerpen
                    </button>
                    <button
                      type="button"
                      onClick={applyResearch}
                      disabled={applyingResearch}
                      className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-md"
                    >
                      {applyingResearch ? "Toepassen…" : "Toepassen → huisstijl + brief"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            rows={6}
            placeholder="Beschrijf het verhaal of de boodschap. Of kies hierboven een andere manier."
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            required
          />
          {ideaError && (
            <p className="text-xs text-red-400 mt-1">{ideaError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Formaat</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as "16:9" | "9:16")}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Aantal scenes</label>
            <select
              value={sceneCount}
              onChange={e => setSceneCount(Number(e.target.value))}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {SCENE_COUNTS.map(n => <option key={n} value={n}>{n} scenes</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <StylePicker value={visualStyle} onChange={setVisualStyle} label="Visuele stijl" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Huisstijl <span className="text-slate-500 font-normal">(optioneel)</span>
            </label>
            <select
              value={brandKitId}
              onChange={e => applyBrandKit(e.target.value)}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Geen huisstijl</option>
              {[...extraKits, ...brandKits].map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              {brandKits.length === 0
                ? "Beheer huisstijlen via Brand Kits"
                : "Stuurt tone of voice, kleuren en do-nots mee naar het script"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Karakters</h2>
            <p className="text-xs text-slate-400">
              Kies wie er in beeld komt. Laat een rol leeg en AI verzint zelf een
              passende persoon — die contrasteert dan automatisch met de wel ingevulde rol.
            </p>
          </div>
          {onSwitchToCharacters && (
            <button
              type="button"
              onClick={onSwitchToCharacters}
              className="text-xs bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 text-cyan-200 px-2.5 py-1 rounded-md whitespace-nowrap"
            >
              + Nieuw karakter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <CharacterPicker
            label="Hoofdpersoon"
            value={mainCharacterId}
            characters={characters}
            excludeId={supportingCharacterId}
            onChange={setMainCharacterId}
            placeholder="AI verzint hoofdpersoon"
          />
          <CharacterPicker
            label="Bijpersoon"
            value={supportingCharacterId}
            characters={characters}
            excludeId={mainCharacterId}
            onChange={setSupportingCharacterId}
            placeholder="AI verzint bijpersoon"
          />
        </div>

      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Eindscene</h2>
          <p className="text-xs text-slate-400">
            Optioneel. Logo en contactgegevens worden gebruikt voor de afsluitende scene
            (typische call-to-action zoals je in elke explainer ziet).
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Logo {outroLogo ? "(1)" : "(optioneel)"}
          </label>
          {outroLogo ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={outroLogo.previewUrl} alt="logo" className="w-32 h-32 object-contain bg-white/5 rounded-md border border-white/10 p-2" />
              <button
                type="button"
                onClick={removeOutroLogo}
                disabled={submitting}
                className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
              >
                x
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={handleOutroLogoFile}
              disabled={submitting}
              className="block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-cyan-600 file:text-white hover:file:bg-cyan-700"
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Bedrijfsnaam</label>
            <input
              type="text"
              value={outro.company_name ?? ""}
              onChange={e => setOutroField("company_name", e.target.value)}
              placeholder="Jouw Animatievideo"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Tagline</label>
            <input
              type="text"
              value={outro.tagline ?? ""}
              onChange={e => setOutroField("tagline", e.target.value)}
              placeholder="Plan een gratis kennismaking"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Website</label>
            <input
              type="text"
              value={outro.website ?? ""}
              onChange={e => setOutroField("website", e.target.value)}
              placeholder="www.jouwanimatievideo.nl"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail</label>
            <input
              type="text"
              value={outro.email ?? ""}
              onChange={e => setOutroField("email", e.target.value)}
              placeholder="hallo@jouwanimatievideo.nl"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Telefoon</label>
            <input
              type="text"
              value={outro.phone ?? ""}
              onChange={e => setOutroField("phone", e.target.value)}
              placeholder="06 - 12 34 56 78"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Socials</label>
            <input
              type="text"
              value={outro.socials ?? ""}
              onChange={e => setOutroField("socials", e.target.value)}
              placeholder="@jouwanimatievideo"
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !idea.trim()}
        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
      >
        {submitting ? (progress || "Bezig...") : "Naar wizard"}
      </button>

      {error && (
        <div className="bg-red-950/50 border border-red-700/50 text-red-200 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </form>
  );
}
