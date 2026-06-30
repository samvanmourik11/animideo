"use client";

import { useState, useRef, useEffect } from "react";
import { Project, Scene, SceneRefsUsed, Character } from "@/lib/types";
import { buildOutroImage, buildCornerLogo } from "@/lib/outro-overlay";
import { createClient } from "@/lib/supabase/client";
import { normalizeBrandAssets, type NormalizedBrandAsset } from "@/lib/studio/brand-assets";
import { toBulletsScene, toNormalScene } from "@/lib/studio/scene-type";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import CharacterPicker from "@/components/studio/CharacterPicker";
import PromptEditor from "@/components/studio/PromptEditor";
import SceneEditModal from "@/components/SceneEditModal";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
  onBack: () => void;
  characters?: Character[];
}

type SceneStatus = "idle" | "running" | "done" | "error";
type OutroStatus = "idle" | "running" | "done" | "error";

export default function StudioStepImages({ project, onUpdate, onNext, onBack, characters = [] }: Props) {
  const scenes = project.scenes ?? [];
  const castRoles = project.cast_roles ?? [];
  const roleById = new Map(castRoles.map(r => [r.id, r]));
  // Match {Naam}-placeholders op character (volledige naam + voornaam).
  const charByName = new Map<string, Character>();
  for (const c of characters) {
    charByName.set(c.name.toLowerCase(), c);
    const f = c.name.toLowerCase().split(/\s*[-–]\s*|\s+/)[0];
    if (f && !charByName.has(f)) charByName.set(f, c);
  }
  // Alle {…}-voorkomens in volgorde (NIET dedupen: meerdere "selecteer personage").
  const promptTokens = (text: string) => [...text.matchAll(/\{([^}]+)\}/g)].map(m => m[1].trim());
  // Initialize once, then ONLY mutate via pushScenes. Auto-syncing from props on
  // every render would race with our synchronous pushScenes update during async
  // batch generation: a setStatus re-render could read stale props (because
  // parent setProject hadn't propagated yet) and overwrite the fresh ref.
  const scenesRef = useRef<Scene[]>(scenes);

  const [statuses, setStatuses] = useState<Record<string, SceneStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [outroStatus, setOutroStatus] = useState<OutroStatus>("idle");
  const [outroError, setOutroError] = useState("");
  const outroAppliedRef = useRef(false);
  const [editScene, setEditScene] = useState<Scene | null>(null);

  // Externe wijzigingen aan de scènes (bv. de AI-buddy past via de wizard prompts
  // of het hele script aan) in scenesRef overnemen. Zonder dit genereert
  // generateOne met een verouderde scenesRef en schiet de parent-state na het
  // genereren terug naar de oude prompts (de server echoot clientScenes terug).
  // We syncen NIET tijdens genereren: dan zou deze sync de net door pushScenes
  // gezette ref kunnen overschrijven met nog-niet-gepropageerde props — precies de
  // race die bij scenesRef hierboven beschreven staat.
  const anyRunning = batchRunning || Object.values(statuses).some(s => s === "running");
  useEffect(() => {
    if (anyRunning) return;
    scenesRef.current = scenes;
  }, [scenes, anyRunning]);

  // Beschikbare merk-assets om per scène aan/uit te klikken als referentie.
  const [brandAssets, setBrandAssets] = useState<NormalizedBrandAsset[]>([]);
  const [reconciling, setReconciling] = useState<Record<string, boolean>>({});
  const reconcileTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!project.brand_kit_id) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("brand_kits")
          .select("reference_images")
          .eq("id", project.brand_kit_id)
          .single();
        if (!cancelled && data) {
          setBrandAssets(normalizeBrandAssets(data.reference_images).filter(a => a.role !== "logo"));
        }
      } catch { /* geen assets -> picker verschijnt gewoon niet */ }
    })();
    return () => { cancelled = true; };
  }, [project.brand_kit_id]);

  const anchorCount =
    (project.style_reference_url ? 1 : 0) +
    (project.character_reference_urls?.length ?? 0);

  const outroContact = project.outro_contact ?? {};
  const hasOutroContent =
    !!project.outro_logo_url ||
    Object.values(outroContact).some(v => typeof v === "string" && v.trim().length > 0);

  // Update both the ref (synchronously) and the parent state. Critical inside
  // async batch loops where React may not re-render between iterations, so
  // relying on render-synced scenesRef would leave it stale.
  function pushScenes(newScenes: Scene[]) {
    scenesRef.current = newScenes;
    onUpdate({ scenes: newScenes });
  }

  function setScenes(newScenes: Scene[]) {
    pushScenes(newScenes);
  }

  // Per scène een merk-referentie aan/uit klikken. De prompt wordt daarna
  // automatisch afgestemd zodat de tekst niet botst met de referentiefoto.
  function toggleSceneAsset(sceneId: string, assetId: string) {
    const cur = scenesRef.current.find(s => s.id === sceneId);
    const ids = cur?.brand_asset_ids ?? [];
    const next = ids.includes(assetId) ? ids.filter(i => i !== assetId) : [...ids, assetId];
    pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, brand_asset_ids: next } : s));
    scheduleReconcile(sceneId);
  }

  function scheduleReconcile(sceneId: string) {
    clearTimeout(reconcileTimers.current[sceneId]);
    reconcileTimers.current[sceneId] = setTimeout(() => reconcilePrompt(sceneId), 700);
  }

  // Stem de image_prompt af op de geselecteerde referenties (vervangt afwijkende
  // objectomschrijvingen door "exact zoals op de referentie").
  async function reconcilePrompt(sceneId: string) {
    const scene = scenesRef.current.find(s => s.id === sceneId);
    const ids = scene?.brand_asset_ids ?? [];
    const assets = brandAssets.filter(a => ids.includes(a.id)).map(a => ({ element: a.element, description: a.description }));
    if (!scene?.image_prompt?.trim() || assets.length === 0) return;
    setReconciling(prev => ({ ...prev, [sceneId]: true }));
    try {
      const res = await fetch("/api/studio/reconcile-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scene.image_prompt, assets }),
      });
      const data = await res.json();
      if (res.ok && typeof data.prompt === "string" && data.prompt.trim()) {
        pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, image_prompt: data.prompt } : s));
      }
    } catch { /* laat de prompt staan bij een fout */ }
    finally {
      setReconciling(prev => ({ ...prev, [sceneId]: false }));
    }
  }

  // Studio-instellingen: direct opslaan (de server leest ze bij generatie uit de DB).
  async function toggleSetting(key: "logo_on_scenes" | "hq_brand_verify" | "quality", value: boolean | string) {
    onUpdate({ [key]: value } as Partial<Project>);
    try {
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, [key]: value }),
      });
    } catch {}
  }

  function setStatus(id: string, status: SceneStatus) {
    setStatuses(prev => ({ ...prev, [id]: status }));
  }

  function setSceneError(id: string, err: string) {
    setErrors(prev => ({ ...prev, [id]: err }));
  }

  function clearSceneError(id: string) {
    setErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function effectiveStatus(scene: Scene): SceneStatus {
    return statuses[scene.id] ?? (scene.image_url ? "done" : "idle");
  }

  function updatePrompt(id: string, value: string) {
    // Use the ref (always latest) instead of closure scenes to avoid race
    // when typing fast or when scenes were just updated by another action.
    setScenes(scenesRef.current.map(s => s.id === id ? { ...s, image_prompt: value } : s));
  }

  async function applyOutro(sceneId: string): Promise<boolean> {
    const scene = scenesRef.current.find(s => s.id === sceneId);
    if (!scene?.image_url) {
      setOutroError("Eerst een eindbeeld genereren");
      setOutroStatus("error");
      return false;
    }
    if (!hasOutroContent) {
      setOutroError("Geen logo of contactgegevens ingevuld");
      setOutroStatus("error");
      return false;
    }
    setOutroStatus("running");
    setOutroError("");
    try {
      const blob = await buildOutroImage({
        baseImageUrl: scene.image_url,
        logoUrl:      project.outro_logo_url,
        contact:      outroContact,
        format:       project.format,
      });
      const form = new FormData();
      form.append("projectId", project.id);
      form.append("sceneId", sceneId);
      form.append("file", blob, "outro.jpg");
      const res = await fetch("/api/studio/apply-outro", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setOutroError(data.error ?? "Outro mislukt");
        setOutroStatus("error");
        return false;
      }
      if (Array.isArray(data.scenes)) {
        pushScenes(data.scenes);
      } else {
        pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, image_url: data.imageUrl } : s));
      }
      setOutroStatus("done");
      outroAppliedRef.current = true;
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setOutroError(msg);
      setOutroStatus("error");
      return false;
    }
  }

  async function generateOne(sceneId: string): Promise<boolean> {
    // Ontworpen scènes (CTA / presentatie) krijgen geen AI-beeld maar worden
    // deterministisch in de huisstijl gerenderd tot een geanimeerde clip + poster.
    const target = scenesRef.current.find(s => s.id === sceneId);
    if (target?.designed) {
      setStatus(sceneId, "running");
      clearSceneError(sceneId);
      try {
        const res = await fetch("/api/studio/render-designed-scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, sceneId, clientScenes: scenesRef.current }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSceneError(sceneId, data.error ?? "Renderen mislukt");
          setStatus(sceneId, "error");
          return false;
        }
        if (Array.isArray(data.scenes)) pushScenes(data.scenes);
        setStatus(sceneId, "done");
        return true;
      } catch (err: unknown) {
        setSceneError(sceneId, err instanceof Error ? err.message : String(err));
        setStatus(sceneId, "error");
        return false;
      }
    }
    setStatus(sceneId, "running");
    clearSceneError(sceneId);

    try {
      // Send the FULL current scenes so server-side update preserves all
      // prior image_urls and any unsaved prompt edits in other scenes.
      const res = await fetch("/api/studio/generate-scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId:    project.id,
          sceneId,
          clientScenes: scenesRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.imageUrl) {
        setSceneError(sceneId, data.error ?? "Onbekende fout");
        setStatus(sceneId, "error");
        return false;
      }
      // Trust the canonical scenes returned by the server
      if (Array.isArray(data.scenes)) {
        pushScenes(data.scenes);
      } else {
        const fallback = scenesRef.current.map(s =>
          s.id === sceneId ? { ...s, image_url: data.imageUrl } : s
        );
        pushScenes(fallback);
      }
      setStatus(sceneId, "done");

      // Laatste scène met outro krijgt de volledige outro-overlay (incl. logo).
      // Andere scènes krijgen — als "logo op scènes" aan staat — een subtiel
      // hoek-logo, gecomposit vanaf de zojuist gegenereerde schone basis.
      const sceneList = scenesRef.current;
      const lastScene = sceneList[sceneList.length - 1];
      const getsOutro = sceneId === lastScene?.id && !lastScene?.designed && hasOutroContent;
      if (getsOutro && !outroAppliedRef.current) {
        outroAppliedRef.current = true;
        applyOutro(sceneId).catch(() => {});
      } else if (!getsOutro && data.logoOnScenes && data.logoUrl) {
        applyCornerLogo(sceneId, data.imageUrl, data.logoUrl).catch(() => {});
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSceneError(sceneId, msg);
      setStatus(sceneId, "error");
      return false;
    }
  }

  // Per-scène nabewerking: gezicht verscherpen (CodeFormer) of belichting (IC-Light).
  const [enhancing, setEnhancing] = useState<Record<string, boolean>>({});
  async function enhanceScene(sceneId: string, op: "face" | "relight") {
    if (enhancing[sceneId]) return;
    setEnhancing(prev => ({ ...prev, [sceneId]: true }));
    clearSceneError(sceneId);
    try {
      const res = await fetch("/api/studio/enhance-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, sceneId, op, clientScenes: scenesRef.current }),
      });
      const data = await res.json();
      if (res.status === 402) { setSceneError(sceneId, "Niet genoeg credits"); return; }
      if (!res.ok || !data.imageUrl) { setSceneError(sceneId, data.error ?? "Verbeteren mislukt"); return; }
      if (Array.isArray(data.scenes)) pushScenes(data.scenes);
      else pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, image_url: data.imageUrl } : s));
    } catch (e) {
      setSceneError(sceneId, e instanceof Error ? e.message : String(e));
    } finally {
      setEnhancing(prev => ({ ...prev, [sceneId]: false }));
    }
  }

  // Eigen referentiefoto('s) per scène uploaden — als extra img2img-richtlijn.
  const [uploadingRef, setUploadingRef] = useState<Record<string, boolean>>({});
  async function uploadSceneRef(sceneId: string, files: FileList) {
    if (uploadingRef[sceneId] || files.length === 0) return;
    setUploadingRef(prev => ({ ...prev, [sceneId]: true }));
    clearSceneError(sceneId);
    try {
      const supabase = createClient();
      const stamp = Date.now();
      const urls: string[] = [];
      let i = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "jpg";
        const path = `${project.user_id}/${project.id}/scene-ref/${sceneId}-${stamp}-${i}.${ext}`;
        const { error } = await supabase.storage.from("scene-assets").upload(path, file, { contentType: file.type, upsert: true });
        if (error) { setSceneError(sceneId, "Upload mislukt: " + error.message); continue; }
        urls.push(supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl);
        i++;
      }
      if (urls.length > 0) {
        pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, ref_image_urls: [...(s.ref_image_urls ?? []), ...urls] } : s));
      }
    } finally {
      setUploadingRef(prev => ({ ...prev, [sceneId]: false }));
    }
  }
  function removeSceneRef(sceneId: string, url: string) {
    pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, ref_image_urls: (s.ref_image_urls ?? []).filter(u => u !== url) } : s));
  }

  // Naam van een character (voor het meeveranderen van de prompt-tekst).
  function charName(id: string | null | undefined): string | null {
    if (!id) return null;
    return characters.find(c => c.id === id)?.name ?? null;
  }
  const firstWord = (n: string) => n.split(/\s*[-–]\s*|\s+/)[0] ?? n;
  function swapName(text: string, fromName: string, toName: string): string {
    const from = firstWord(fromName), to = firstWord(toName);
    if (!from || !to || from === to) return text;
    return text.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to);
  }

  // Een placeholder in de prompt aan een character koppelen: herschrijf HET i-de
  // {…}-voorkomen. Leeg ("") → terug naar {selecteer personage}. Zo is de placeholder
  // in de prompt zelf de plek waar je het personage kiest (achtergrond = geen token).
  function setTokenCharacter(sceneId: string, index: number, newCharId: string) {
    const c = characters.find(x => x.id === newCharId);
    const inner = c ? firstWord(c.name) : "selecteer personage";
    pushScenes(scenesRef.current.map(s => {
      if (s.id !== sceneId) return s;
      let i = -1;
      const image_prompt = s.image_prompt.replace(/\{[^}]+\}/g, (m) => { i++; return i === index ? `{${inner}}` : m; });
      return { ...s, image_prompt };
    }));
  }

  // Per-scène afwijken: welk character speelt deze rol in déze scène ("" = AI).
  // De naam in de prompt-tekst verandert mee zodat het beeld én de tekst kloppen.
  function setSceneCastOverride(sceneId: string, roleId: string, characterId: string) {
    pushScenes(scenesRef.current.map(s => {
      if (s.id !== sceneId) return s;
      const role = roleById.get(roleId);
      const curHas = !!s.cast_overrides && Object.prototype.hasOwnProperty.call(s.cast_overrides, roleId);
      const curId = curHas ? s.cast_overrides![roleId] : (role?.characterId ?? null);
      const oldName = charName(curId) ?? role?.name ?? "";
      const newName = charName(characterId || null) ?? role?.name ?? "";
      const image_prompt = oldName && newName ? swapName(s.image_prompt, oldName, newName) : s.image_prompt;
      return { ...s, image_prompt, cast_overrides: { ...(s.cast_overrides ?? {}), [roleId]: characterId || null } };
    }));
  }
  function clearSceneCastOverride(sceneId: string, roleId: string) {
    pushScenes(scenesRef.current.map(s => {
      if (s.id !== sceneId) return s;
      const role = roleById.get(roleId);
      const curHas = !!s.cast_overrides && Object.prototype.hasOwnProperty.call(s.cast_overrides, roleId);
      const oldName = charName(curHas ? s.cast_overrides![roleId] : null) ?? role?.name ?? "";
      const newName = charName(role?.characterId ?? null) ?? role?.name ?? "";
      const image_prompt = oldName && newName ? swapName(s.image_prompt, oldName, newName) : s.image_prompt;
      const ov = { ...(s.cast_overrides ?? {}) };
      delete ov[roleId];
      return { ...s, image_prompt, cast_overrides: ov };
    }));
  }

  // Wisselen tussen opsommingsscène en normale AI-scène. Expliciete overschrijf-
  // save zodat het oude beeld/video gewist blijft (langs de autosave-merge heen).
  async function convertSceneType(sceneId: string, target: "designed" | "normal") {
    const next = scenesRef.current.map(s => s.id === sceneId ? (target === "designed" ? toBulletsScene(s) : toNormalScene(s)) : s);
    pushScenes(next);
    setStatus(sceneId, "idle");
    try {
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, scenes: next }),
      });
    } catch {}
  }

  // Subtiel hoek-logo op een scène (client-side composit → apply-outro upload).
  async function applyCornerLogo(sceneId: string, baseUrl: string, logoUrl: string) {
    try {
      const blob = await buildCornerLogo({
        baseImageUrl: baseUrl,
        logoUrl,
        format: project.format === "9:16" ? "9:16" : "16:9",
      });
      const form = new FormData();
      form.append("projectId", project.id);
      form.append("sceneId", sceneId);
      form.append("file", blob, "logo.jpg");
      const res = await fetch("/api/studio/apply-outro", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok && Array.isArray(data.scenes)) pushScenes(data.scenes);
      else if (res.ok && data.imageUrl) pushScenes(scenesRef.current.map(s => s.id === sceneId ? { ...s, image_url: data.imageUrl } : s));
    } catch { /* best-effort; scène blijft gewoon zonder logo */ }
  }

  async function generateAll() {
    if (batchRunning) return;
    setBatchRunning(true);
    // Iterate ref so newly added scenes (or removed ones) are seen mid-batch.
    // Closure scenes from props would be stale after a re-render.
    const ids = scenesRef.current.map(s => s.id);
    for (const id of ids) {
      const current = scenesRef.current.find(s => s.id === id);
      if (!current) continue;
      if ((statuses[id] ?? (current.image_url ? "done" : "idle")) === "done") continue;
      await generateOne(id);
    }
    setBatchRunning(false);
  }

  function handleContinue() {
    if (allDone) onUpdate({ status: "ImagesReady" });
    onNext();
  }

  const doneCount = scenes.filter(s => effectiveStatus(s) === "done").length;
  const allDone = scenes.length > 0 && doneCount === scenes.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Beelden</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {doneCount}/{scenes.length} klaar.{" "}
            {anchorCount > 0
              ? "Elke scène gebruikt automatisch de juiste referenties — onder elk beeld zie je welke (merk-objecten, personage-ankers, stijl)."
              : "Genereer de scènes op volgorde — elke scène onthoudt de vorige voor consistente personages en stijl."}
          </p>
          <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kwaliteit &amp; merk</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer" title="Nano Banana Pro: scherpere, consistentere BEELDEN — kost evenredig meer credits. De beeldbeweging blijft altijd hetzelfde.">
              <input type="checkbox" checked={project.quality === "pro"} onChange={e => toggleSetting("quality", e.target.checked ? "pro" : "standard")} className="h-3.5 w-3.5 accent-cyan-500" />
              Pro-beelden ({CREDIT_COSTS.IMAGE_GENERATION_PRO} credits/beeld)
            </label>
            {project.brand_kit_id && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer" title="Plak een subtiel logo in een hoek van elke scène">
                  <input type="checkbox" checked={!!project.logo_on_scenes} onChange={e => toggleSetting("logo_on_scenes", e.target.checked)} className="h-3.5 w-3.5 accent-cyan-500" />
                  Logo op elke scène
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer" title="Controleert per merk-scène of het object klopt en genereert zo nodig 1× opnieuw — kost extra credits">
                  <input type="checkbox" checked={!!project.hq_brand_verify} onChange={e => toggleSetting("hq_brand_verify", e.target.checked)} className="h-3.5 w-3.5 accent-cyan-500" />
                  Merk-check (extra credits)
                </label>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={generateAll}
            disabled={batchRunning || allDone}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            {batchRunning ? "Bezig..." : allDone ? "Allemaal klaar" : doneCount > 0 ? "Genereer ontbrekende" : "Genereer alles"}
          </button>
          {!allDone && (() => {
            const pending = scenes.filter(s => !s.designed && effectiveStatus(s) !== "done").length;
            const per = project.quality === "pro" ? CREDIT_COSTS.IMAGE_GENERATION_PRO : CREDIT_COSTS.IMAGE_GENERATION;
            return pending > 0 ? <span className="text-[11px] text-slate-500">≈ {pending * per} credits</span> : null;
          })()}
        </div>
      </div>

      <div className="space-y-4">
        {scenes.map((scene, idx) => {
          const status = effectiveStatus(scene);
          const err = errors[scene.id];
          const isLast = idx === scenes.length - 1;
          const showOutroBtn = isLast && hasOutroContent;
          return (
            <div key={scene.id} className="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-400">
                    Scene #{idx + 1} ({scene.duration}s){scene.designed?.kind === "bullets" ? " · opsomming" : scene.designed?.kind === "cta" ? " · eindscène" : isLast && hasOutroContent ? " · outro" : ""}
                  </span>
                  <div className="flex gap-1.5">
                    {scene.designed?.kind !== "cta" && (
                      <button
                        onClick={() => convertSceneType(scene.id, scene.designed ? "normal" : "designed")}
                        disabled={status === "running"}
                        className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md disabled:opacity-40"
                        title={scene.designed ? "Maak er een normale AI-scène van" : "Maak er een opsommingsscène van"}
                      >
                        {scene.designed ? "→ Normaal" : "→ Opsomming"}
                      </button>
                    )}
                    {showOutroBtn && (
                      <button
                        onClick={() => applyOutro(scene.id)}
                        disabled={outroStatus === "running" || status === "running" || !scene.image_url}
                        className="text-xs bg-cyan-600/20 border border-cyan-500/40 hover:bg-cyan-600/30 text-cyan-200 px-2.5 py-1 rounded-md disabled:opacity-40"
                        title="Plak logo en contactgegevens als overlay op deze scene"
                      >
                        {outroStatus === "running" ? "Outro..." : "Outro overlay"}
                      </button>
                    )}
                    {!scene.designed && status === "done" && scene.image_url && (
                      <>
                        <button
                          onClick={() => setEditScene(scene)}
                          disabled={batchRunning || !!enhancing[scene.id]}
                          className="text-xs bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-200 px-2.5 py-1 rounded-md disabled:opacity-40"
                          title="Geef een korte instructie om dit beeld bij te sturen"
                        >
                          ✎ Bewerk
                        </button>
                        <button
                          onClick={() => enhanceScene(scene.id, "face")}
                          disabled={batchRunning || !!enhancing[scene.id]}
                          className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md disabled:opacity-40"
                          title="Herstel vervormde gezichten (CodeFormer)"
                        >
                          {enhancing[scene.id] ? "Bezig…" : "🙂 Gezicht"}
                        </button>
                        <button
                          onClick={() => enhanceScene(scene.id, "relight")}
                          disabled={batchRunning || !!enhancing[scene.id]}
                          className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md disabled:opacity-40"
                          title="Belichting bijstellen (experimenteel — kan de stijl iets verschuiven)"
                        >
                          💡 Licht
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => generateOne(scene.id)}
                      disabled={status === "running" || batchRunning}
                      className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md disabled:opacity-50"
                    >
                      {status === "running" ? "Bezig..." : status === "done" ? "Opnieuw" : "Genereer"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 italic">&quot;{scene.voiceover_text}&quot;</p>
                {scene.designed ? (
                  <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.06] p-2.5 text-xs text-cyan-200">
                    {scene.designed.kind === "cta"
                      ? "📣 Eindscène (call-to-action) — wordt in de huisstijl gemaakt met je logo en contactgegevens. Geen AI-beeld nodig."
                      : "📊 Opsommingsscène — wordt als ontworpen grafiek in de huisstijl gemaakt (geen AI-beeld). De tekst pas je aan in de Idee-stap."}
                  </div>
                ) : (
                <>
                <PromptEditor
                  value={scene.image_prompt}
                  onChange={v => updatePrompt(scene.id, v)}
                  characters={characters}
                  rows={5}
                  disabled={status === "running"}
                  onTokenPick={(i, id) => setTokenCharacter(scene.id, i, id)}
                  className="w-full bg-slate-950 border border-white/10 rounded-md px-2 py-1.5 text-sm text-white"
                />
                {characters.length > 0 && (
                  <p className="text-[10px] text-slate-500">Tip: typ <span className="text-slate-300">/</span> om een personage in te voegen als <span className="text-slate-300">{"{Naam}"}</span> — de AI gebruikt dan dat character.</p>
                )}
                {(() => {
                  // Placeholders in de prompt = de personages. Eén kiezer per token.
                  const tokens = promptTokens(scene.image_prompt);
                  if (tokens.length > 0) {
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-slate-500">Personages:</span>
                        {tokens.map((tok, i) => {
                          const c = charByName.get(tok.toLowerCase());
                          return (
                            <CharacterPicker
                              compact
                              key={i}
                              label={c?.name ?? `Personage ${i + 1}`}
                              value={c?.id ?? ""}
                              characters={characters}
                              disabled={status === "running"}
                              placeholder="selecteer personage"
                              onChange={id => setTokenCharacter(scene.id, i, id)}
                            />
                          );
                        })}
                      </div>
                    );
                  }
                  // Back-compat: oudere scènes zonder placeholders → cast-rol kiezers.
                  const roleList = (scene.cast_ids ?? []).filter(id => roleById.has(id));
                  if (roleList.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-slate-500">Personages:</span>
                      {roleList.map(rid => {
                        const role = roleById.get(rid)!;
                        const hasOv = !!scene.cast_overrides && Object.prototype.hasOwnProperty.call(scene.cast_overrides, rid);
                        const value = hasOv ? (scene.cast_overrides![rid] ?? "") : (role.characterId ?? "");
                        return (
                          <span key={rid} className="inline-flex items-center gap-1">
                            <CharacterPicker
                              compact
                              label={charName(value) ?? role.name}
                              value={value}
                              characters={characters}
                              disabled={status === "running"}
                              placeholder="🎭 AI"
                              onChange={id => setSceneCastOverride(scene.id, rid, id)}
                            />
                            {hasOv && (
                              <button type="button" onClick={() => clearSceneCastOverride(scene.id, rid)} className="text-[10px] text-cyan-300 hover:text-cyan-200" title="Terug naar standaard">↺</button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">Referenties voor deze scène:</span>
                  {brandAssets.map(a => {
                    const on = (scene.brand_asset_ids ?? []).includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleSceneAsset(scene.id, a.id)}
                        disabled={status === "running"}
                        title={`${a.element} — klik om ${on ? "uit te sluiten" : "te gebruiken"} (prompt past zich aan)`}
                        className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${on ? "bg-amber-500/25 border-amber-400 text-amber-100" : "bg-white/5 border-white/10 text-slate-400 hover:border-white/30"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt="" className="w-4 h-4 rounded object-cover" />
                        {a.element.length > 18 ? `${a.element.slice(0, 18)}…` : a.element}
                      </button>
                    );
                  })}
                  {(scene.ref_image_urls ?? []).map((url, i) => (
                    <span
                      key={`u${i}`}
                      className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border bg-emerald-500/20 border-emerald-400/50 text-emerald-100"
                      title="Eigen referentiefoto voor deze scène"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-4 h-4 rounded object-cover" />
                      eigen foto
                      <button type="button" onClick={() => removeSceneRef(scene.id, url)} className="ml-0.5 leading-none hover:text-white" title="Verwijder">×</button>
                    </span>
                  ))}
                  <label
                    className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border border-dashed border-white/25 text-slate-300 cursor-pointer hover:border-white/50 ${uploadingRef[scene.id] ? "opacity-50" : ""}`}
                    title="Upload een eigen referentiefoto om de AI bij te sturen voor deze scène"
                  >
                    {uploadingRef[scene.id] ? "Uploaden…" : "+ Eigen foto"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={!!uploadingRef[scene.id] || status === "running"}
                      onChange={e => { if (e.target.files) uploadSceneRef(scene.id, e.target.files); e.currentTarget.value = ""; }}
                    />
                  </label>
                  {reconciling[scene.id] && <span className="text-[10px] text-cyan-300">prompt afstemmen…</span>}
                </div>
                </>
                )}
                {err && <p className="text-xs text-red-400">Fout: {err}</p>}
                {isLast && outroStatus === "error" && outroError && (
                  <p className="text-xs text-red-400">Outro fout: {outroError}</p>
                )}
                {isLast && outroStatus === "done" && (
                  <p className="text-xs text-cyan-300">Outro overlay toegepast.</p>
                )}
                <RefChips refs={scene.refs_used ?? null} />
              </div>
              <div className="aspect-video md:aspect-auto md:h-[180px] rounded-md overflow-hidden border border-white/10 bg-slate-950 flex items-center justify-center relative">
                {status === "running" && (
                  <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-2" />
                    <p className="text-xs text-slate-400">Genereren...</p>
                  </div>
                )}
                {status !== "running" && scene.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.image_url} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                )}
                {status !== "running" && !scene.image_url && (
                  <p className="text-xs text-slate-600">Nog geen beeld</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">
          ← Terug
        </button>
        <button
          onClick={handleContinue}
          disabled={!allDone}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 text-white font-medium px-6 py-2.5 rounded-lg"
        >
          Naar beweging →
        </button>
      </div>

      {editScene && editScene.image_url && (
        <SceneEditModal
          open
          onClose={() => setEditScene(null)}
          projectId={project.id}
          sceneId={editScene.id}
          currentImageUrl={editScene.image_url}
          clientScenes={scenesRef.current}
          onUpdated={(newUrl, updatedScenes) => {
            // Server geeft de hele scenes-array terug (na de DB-update) —
            // pakken die zodat we niet ergens out-of-sync raken met edits
            // die de gebruiker had open staan.
            if (updatedScenes && updatedScenes.length > 0) {
              pushScenes(updatedScenes);
            } else {
              pushScenes(
                scenesRef.current.map((s) =>
                  s.id === editScene.id ? { ...s, image_url: newUrl } : s
                )
              );
            }
          }}
        />
      )}
    </div>
  );
}

// Toont per scène welke referenties bij de generatie zijn gebruikt: échte merk-
// objecten (met thumbnail + element), personage-ankers, vorige-scène-chaining en
// of de stijl-referentie meedeed. Lost "ik zie niks van ankers per afbeelding" op.
function RefChips({ refs }: { refs: SceneRefsUsed | null }) {
  if (!refs) return null;
  const has = refs.brand.length > 0 || refs.characters.length > 0 || refs.chaining.length > 0 || refs.style;
  if (!has) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {refs.brand.map((b, i) => (
        <span
          key={`b${i}`}
          title={`Merk-asset: ${b.element}`}
          className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-200 rounded px-1.5 py-0.5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.url} alt="" className="w-4 h-4 rounded object-cover" />
          {b.element.length > 24 ? `${b.element.slice(0, 24)}…` : b.element}
        </span>
      ))}
      {refs.characters.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`c${i}`} src={c.url} alt={c.name} title={`Personage: ${c.name}`} className="w-5 h-5 rounded object-cover border border-cyan-500/40" />
      ))}
      {refs.chaining.length > 0 && (
        <span className="text-[10px] bg-white/10 text-slate-300 rounded px-1.5 py-0.5" title="Vorige scène als consistentie-referentie">↺ vorige scène</span>
      )}
      {refs.style && (
        <span className="text-[10px] bg-white/10 text-slate-300 rounded px-1.5 py-0.5" title="Stijl-referentie meegegeven">stijl</span>
      )}
    </div>
  );
}
