"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, PlaygroundNode, TransitionType, Character } from "@/lib/types";
import StoryboardPanel from "@/components/playground/StoryboardPanel";
import { createClient } from "@/lib/supabase/client";

const VARIATION_INSTRUCTION =
  "Genereer een nieuwe variatie van dit beeld: behoud het onderwerp, de compositie en de stijl, maar varieer subtiel in details, belichting en sfeer.";

const toolBtn =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 " +
  "hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

type Action = "" | "edit" | "vary" | "upscale" | "pin" | "shot";

export default function PlaygroundCanvas({
  project,
  initialNodes,
  characters,
}: {
  project: Project;
  initialNodes: PlaygroundNode[];
  characters: Character[];
}) {
  const router = useRouter();
  const [proj, setProj] = useState<Project>(project);
  const [nodes, setNodes] = useState<PlaygroundNode[]>(initialNodes);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [focusId, setFocusId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [action, setAction] = useState<Action>("");
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [regisseurBusy, setRegisseurBusy] = useState(false);
  const [musicMoodHint, setMusicMoodHint] = useState("");
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [animatingShots, setAnimatingShots] = useState<Set<string>>(() => new Set());
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [autosyncBusy, setAutosyncBusy] = useState(false);
  const [autosyncMsg, setAutosyncMsg] = useState("");
  const [autosyncError, setAutosyncError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeIngredients, setActiveIngredients] = useState<Set<string>>(
    () => new Set(initialNodes.filter((n) => n.meta?.is_ingredient === true).map((n) => n.id))
  );

  // Hoofdpersoon: ID van een opgeslagen character die bij elke generatie
  // automatisch meegestuurd wordt als ingredient. Wordt afgeleid uit
  // project.character_reference_urls (eerste slot) zodat de keuze bewaard
  // blijft per project.
  const initialCharacterId =
    project.character_reference_urls && project.character_reference_urls.length > 0
      ? characters.find((c) => c.image_url === project.character_reference_urls[0])?.id ?? ""
      : "";
  const [mainCharacterId, setMainCharacterId] = useState<string>(initialCharacterId);
  const mainCharacter = mainCharacterId
    ? characters.find((c) => c.id === mainCharacterId) ?? null
    : null;

  const shotsInVideo = useMemo(() => nodes.filter((n) => n.in_video), [nodes]);
  const focusedInVideo = !!(focusId && nodes.find((n) => n.id === focusId)?.in_video);

  const aspectClass = proj.format === "9:16" ? "aspect-[9/16]" : "aspect-video";

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const focused = focusId ? byId.get(focusId) ?? null : null;
  const focusedPinned = focused?.meta?.is_ingredient === true;

  const ingredients = useMemo(
    () => nodes.filter((n) => n.meta?.is_ingredient === true && n.image_url),
    [nodes]
  );

  // Keten van voorouders (root eerst) van de gefocuste node.
  const ancestors = useMemo(() => {
    if (!focused) return [] as PlaygroundNode[];
    const chain: PlaygroundNode[] = [];
    let cur = focused.parent_id;
    while (cur) {
      const n = byId.get(cur);
      if (!n) break;
      chain.unshift(n);
      cur = n.parent_id;
    }
    return chain;
  }, [focused, byId]);

  const children = useMemo(
    () => (focused ? nodes.filter((n) => n.parent_id === focused.id) : []),
    [focused, nodes]
  );

  function addNode(node: PlaygroundNode, focusIt = true) {
    setNodes((prev) => [...prev, node]);
    if (focusIt) {
      setFocusId(node.id);
      setInstruction("");
    }
  }

  function errText(data: { error?: string }, fallback: string) {
    if (data.error === "insufficient_credits") return "Je hebt geen credits meer.";
    return data.error ?? fallback;
  }

  async function chooseMainCharacter(id: string) {
    setMainCharacterId(id);
    const url = id ? characters.find((c) => c.id === id)?.image_url ?? "" : "";
    try {
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proj.id,
          character_reference_urls: url ? [url] : [],
        }),
      });
      setProj((prev) => ({ ...prev, character_reference_urls: url ? [url] : [] }));
    } catch {
      // Niet kritisch: keuze is lokaal al actief, persist mag opnieuw bij volgende keuze.
    }
  }

  function ingredientUrlsWithMainCharacter(extra: (string | null)[] = []): string[] {
    const urls = ingredients
      .filter((n) => activeIngredients.has(n.id))
      .map((n) => n.image_url)
      .concat(extra)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    if (mainCharacter?.image_url) urls.unshift(mainCharacter.image_url);
    // Dedup behoud volgorde, max 8 — die kapping doet de server ook nog.
    return Array.from(new Set(urls)).slice(0, 8);
  }

  async function generate() {
    const p = prompt.trim();
    if (p.length < 2 || generating) return;
    setError("");
    setGenerating(true);
    try {
      const ingredientUrls = ingredientUrlsWithMainCharacter();
      const res = await fetch("/api/playground/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proj.id,
          prompt: p,
          format: proj.format,
          ingredientUrls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Genereren mislukt."));
        return;
      }
      setPrompt("");
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadReference(file: File) {
    if (uploading || generating) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Alleen afbeeldingen kunnen geüpload worden.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Bestand is groter dan 15 MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        setError("Sessie ongeldig, log opnieuw in.");
        return;
      }

      const assetId = crypto.randomUUID();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const fileName = `${userId}/${proj.id}/playground/${assetId}-upload.${ext || "jpg"}`;
      const { error: uploadErr } = await supabase.storage
        .from("scene-assets")
        .upload(fileName, file, { contentType: file.type, upsert: false });
      if (uploadErr) {
        setError("Upload mislukt: " + uploadErr.message);
        return;
      }

      const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

      const res = await fetch("/api/playground/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id, imageUrl: urlData.publicUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Opslaan van referentiebeeld mislukt."));
        return;
      }
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runEdit(instructionText: string, label?: string, kind: Action = "edit") {
    if (!focused || action) return;
    setError("");
    setAction(kind);
    try {
      const res = await fetch("/api/playground/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proj.id,
          parentNodeId: focused.id,
          instruction: instructionText,
          label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Bewerken mislukt."));
        return;
      }
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  async function applyEdit() {
    const ins = instruction.trim();
    if (ins.length < 2) return;
    await runEdit(ins);
  }

  async function upscale() {
    if (!focused || action) return;
    setError("");
    setAction("upscale");
    try {
      const res = await fetch("/api/playground/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id, nodeId: focused.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Upscalen mislukt."));
        return;
      }
      addNode(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  async function togglePin() {
    if (!focused || action) return;
    const next = !focusedPinned;
    setError("");
    setAction("pin");
    try {
      const res = await fetch("/api/playground/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id, nodeId: focused.id, pinned: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Opslaan mislukt."));
        return;
      }
      setNodes((prev) => prev.map((n) => (n.id === data.node.id ? data.node : n)));
      setActiveIngredients((prev) => {
        const s = new Set(prev);
        if (next) s.add(data.node.id);
        else s.delete(data.node.id);
        return s;
      });
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  // Nieuwste bovenaan op het canvas.
  const canvasNodes = useMemo(() => [...nodes].reverse(), [nodes]);

  function applyNodeUpdate(updated: PlaygroundNode) {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }
  function applyNodesReplace(next: PlaygroundNode[]) {
    setNodes(next);
  }

  async function toggleInVideo() {
    if (!focused || action) return;
    setError("");
    setAction("shot");
    try {
      const wasInVideo = focused.in_video;
      const res = await fetch("/api/playground/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: wasInVideo ? "remove" : "add",
          projectId: proj.id,
          nodeId: focused.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "Bijwerken mislukt."));
        return;
      }
      applyNodeUpdate(data.node);
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAction("");
    }
  }

  async function updateShot(
    nodeId: string,
    patch: { voiceover_text?: string | null; duration_sec?: number | null; transition_out?: TransitionType | null }
  ) {
    try {
      const res = await fetch("/api/playground/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", projectId: proj.id, nodeId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.node) applyNodeUpdate(data.node);
    } catch {}
  }

  async function removeShot(nodeId: string) {
    try {
      const res = await fetch("/api/playground/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", projectId: proj.id, nodeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.node) applyNodeUpdate(data.node);
    } catch {}
  }

  async function reorderShots(ids: string[]) {
    // Optimistische update: kort vooruit lopen op de server zodat het slepen
    // direct zichtbaar is.
    setNodes((prev) =>
      prev.map((n) => {
        const idx = ids.indexOf(n.id);
        if (idx === -1) return n;
        return { ...n, sort_order: idx, in_video: true };
      })
    );
    try {
      const res = await fetch("/api/playground/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", projectId: proj.id, nodeIds: ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.nodes)) applyNodesReplace(data.nodes);
    } catch {}
  }

  async function updateProjectStoryboard(
    patch: { selected_voice?: string | null; bg_music_url?: string | null; outro_text?: string | null }
  ) {
    try {
      const res = await fetch("/api/playground/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.project) setProj(data.project);
    } catch {}
  }

  async function runRegisseur() {
    if (regisseurBusy) return;
    setError("");
    setRegisseurBusy(true);
    try {
      const res = await fetch("/api/playground/regisseur/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errText(data, "De regisseur kon geen voorstel maken."));
        return;
      }
      if (Array.isArray(data.nodes)) setNodes(data.nodes);
      if (data.project) setProj(data.project);
      setMusicMoodHint(typeof data.music_mood === "string" ? data.music_mood : "");
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setRegisseurBusy(false);
    }
  }

  async function animateShot(nodeId: string, regenerate = false, motionPrompt?: string) {
    if (animatingShots.has(nodeId)) return;
    setFinishError("");
    setAnimatingShots((prev) => new Set(prev).add(nodeId));
    try {
      const submitRes = await fetch("/api/playground/motion/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id, nodeId, regenerate, motionPrompt }),
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        setError(errText(submitData, "Animeren mislukt."));
        return;
      }
      if (submitData.alreadyHasVideo && submitData.videoUrl) {
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, video_url: submitData.videoUrl } : n))
        );
        return;
      }
      // Optimistisch alvast video_url leegmaken bij regenerate zodat de UI
      // niet stiekem de oude clip blijft tonen tijdens het wachten.
      if (regenerate) {
        setNodes((prev) =>
          prev.map((n) => (n.id === nodeId ? { ...n, video_url: null } : n))
        );
      }

      const taskId: string = submitData.taskId;
      if (!taskId) {
        setError("Geen taskId van Seedance");
        return;
      }

      // Poll elke 3s, harde stop na 5 minuten.
      const startedAt = Date.now();
      const MAX_MS = 5 * 60 * 1000;
      while (Date.now() - startedAt < MAX_MS) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(
          `/api/playground/motion/status?taskId=${taskId}&projectId=${proj.id}&nodeId=${nodeId}`
        );
        const statusData = await statusRes.json().catch(() => ({}));
        if (statusData.status === "SUCCEEDED" && statusData.videoUrl) {
          setNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, video_url: statusData.videoUrl } : n))
          );
          return;
        }
        if (statusData.status === "FAILED") {
          setError(statusData.error ?? "Seedance generatie mislukt");
          return;
        }
      }
      setError("Animeren duurt te lang, probeer het opnieuw");
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAnimatingShots((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  }

  async function generateVoiceOver() {
    if (voiceBusy) return;
    if (shotsInVideo.length === 0) return;
    setVoiceError("");
    setVoiceBusy(true);
    try {
      // Voor voice-over moet project.scenes gevuld zijn — finalize zorgt voor
      // de mapping zodat /api/generate-voice de juiste tekst leest.
      const finRes = await fetch("/api/playground/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id }),
      });
      const finData = await finRes.json().catch(() => ({}));
      if (!finRes.ok) {
        setVoiceError(errText(finData, "Voorbereiden mislukt."));
        return;
      }
      if (finData.project) setProj(finData.project);

      const res = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proj.id,
          voice: proj.selected_voice ?? "Charlotte",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVoiceError(errText(data, "Voice-over genereren mislukt."));
        return;
      }
      setProj((prev) => ({
        ...prev,
        voice_audio_url: data.audioUrl,
        selected_voice: data.voice,
        status: "VoiceReady",
      }));
    } catch {
      setVoiceError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function autoSyncDurations() {
    if (autosyncBusy) return;
    setAutosyncError("");
    setAutosyncMsg("");
    if (!proj.voice_audio_url) {
      setAutosyncError("Genereer eerst de voice-over.");
      return;
    }
    setAutosyncBusy(true);
    try {
      const res = await fetch("/api/playground/autosync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAutosyncError(errText(data, "Autosync mislukt."));
        return;
      }
      if (Array.isArray(data.nodes)) setNodes(data.nodes);
      const total = typeof data.audioDuration === "number" ? Math.round(data.audioDuration) : null;
      setAutosyncMsg(
        data.fallbackUsed
          ? "Synced (op tekstlengte; transcriptie matchte niet goed)"
          : total
          ? `Synced op voice-over van ${total} seconden`
          : "Synced"
      );
    } catch {
      setAutosyncError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setAutosyncBusy(false);
    }
  }

  async function finishProject() {
    if (finishBusy) return;
    setFinishError("");
    setFinishBusy(true);
    try {
      const res = await fetch("/api/playground/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: proj.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFinishError(errText(data, "Naar editor gaan mislukt."));
        return;
      }
      router.push(`/playground/${proj.id}/finish`);
    } catch {
      setFinishError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setFinishBusy(false);
    }
  }

  return (
    <div className="pb-40">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Playground</h1>
            <span className="text-xs bg-white/[0.06] text-slate-400 border border-white/10 px-2 py-0.5 rounded-full">
              {proj.format}
            </span>
          </div>
          {proj.notes && (
            <p className="text-sm text-slate-500 mt-1">
              <span className="text-slate-600">Brief:</span> {proj.notes}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowStoryboard(true)}
          className="shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg border border-white/10 text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center gap-2"
        >
          🎬 Video opbouwen
          {shotsInVideo.length > 0 && (
            <span className="text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5 leading-none">
              {shotsInVideo.length}
            </span>
          )}
        </button>
      </div>

      {/* Hoofdpersoon — wordt automatisch als ingredient meegestuurd bij elke
          generatie zodat dezelfde figuur door alle beelden heen herkenbaar blijft. */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
        <span className="text-xs text-slate-500 shrink-0">Hoofdpersoon</span>
        {mainCharacter?.image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mainCharacter.image_url}
            alt={mainCharacter.name}
            className="w-7 h-7 object-cover rounded-md border border-white/10 shrink-0"
          />
        )}
        <select
          value={mainCharacterId}
          onChange={(e) => chooseMainCharacter(e.target.value)}
          className="input text-xs py-1 px-2 flex-1 min-w-0"
        >
          <option value="">— Geen vaste hoofdpersoon —</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.gender ? ` (${c.gender})` : ""}
            </option>
          ))}
        </select>
        {characters.length === 0 ? (
          <a
            href="/characters"
            className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
          >
            Aanmaken →
          </a>
        ) : (
          <a
            href="/characters"
            className="text-xs text-slate-500 hover:text-slate-300 shrink-0"
            title="Beheer al je personages"
          >
            Beheren
          </a>
        )}
      </div>

      {/* Canvas */}
      {canvasNodes.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-slate-300 font-medium">Begin met een prompt</p>
          <p className="text-slate-500 text-sm mt-1">
            Typ hieronder wat je wilt zien. Daarna klik je op een beeld om het bij te sturen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {canvasNodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                setFocusId(n.id);
                setInstruction("");
              }}
              className={`group relative ${aspectClass} rounded-xl overflow-hidden border transition-colors ${
                n.meta?.is_ingredient === true
                  ? "border-amber-500/40 hover:border-amber-400/60"
                  : "border-white/10 hover:border-blue-500/40"
              }`}
            >
              {n.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={n.image_url}
                  alt={n.prompt ?? "beeld"}
                  className="w-full h-full object-cover"
                />
              )}
              {n.parent_id && (
                <span className="absolute top-1.5 left-1.5 text-[10px] bg-black/60 text-blue-300 px-1.5 py-0.5 rounded-full">
                  bewerking
                </span>
              )}
              {n.meta?.is_ingredient === true && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/60 text-amber-300 px-1.5 py-0.5 rounded-full">
                  ingrediënt
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 p-2 text-[11px] text-white/90 bg-gradient-to-t from-black/80 to-transparent text-left opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">
                {n.prompt}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Prompt-balk */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#060d1f]/95 backdrop-blur border-t border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          {/* Ingrediënten-strip */}
          {ingredients.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-slate-500 mb-1">
                Ingrediënten, meegenomen bij genereren. Klik om aan of uit te zetten.
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {ingredients.map((n) => {
                  const on = activeIngredients.has(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() =>
                        setActiveIngredients((prev) => {
                          const s = new Set(prev);
                          if (on) s.delete(n.id);
                          else s.add(n.id);
                          return s;
                        })
                      }
                      className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                        on ? "border-amber-400 opacity-100" : "border-white/10 opacity-40"
                      }`}
                      title={n.prompt ?? "ingrediënt"}
                    >
                      {n.image_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={n.image_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 mb-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              className="input flex-1 min-h-[44px] max-h-32 resize-none py-2.5"
              placeholder="Beschrijf een beeld dat je wilt maken…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate();
                }
              }}
              rows={1}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadReference(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || generating}
              className="shrink-0 px-3 h-[44px] rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Upload een eigen foto als referentie"
            >
              {uploading ? (
                <span className="text-xs">Uploaden…</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span className="text-xs hidden sm:inline">Upload foto</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={generating || prompt.trim().length < 2}
              className="btn-primary shrink-0"
            >
              {generating ? "Genereren…" : "Genereer"}
            </button>
          </div>
        </div>
      </div>

      {/* Storyboard-paneel (z-40, focus-overlay z-50 komt erbovenop) */}
      <StoryboardPanel
        open={showStoryboard}
        onClose={() => setShowStoryboard(false)}
        project={proj}
        shots={shotsInVideo}
        onShotChange={updateShot}
        onShotRemove={removeShot}
        onReorder={reorderShots}
        onProjectChange={updateProjectStoryboard}
        onRunRegisseur={runRegisseur}
        regisseurBusy={regisseurBusy}
        musicMoodHint={musicMoodHint}
        onFinish={finishProject}
        finishBusy={finishBusy}
        finishError={finishError}
        onAnimateShot={animateShot}
        animatingShots={animatingShots}
        onGenerateVoice={generateVoiceOver}
        voiceBusy={voiceBusy}
        voiceError={voiceError}
        onAutoSync={autoSyncDurations}
        autosyncBusy={autosyncBusy}
        autosyncMsg={autosyncMsg}
        autosyncError={autosyncError}
      />

      {/* Focus-overlay: groot beeld + gereedschap + geschiedenis */}
      {focused && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-white/10">
            <span className="text-sm text-slate-400">Beeld bijsturen</span>
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className="text-slate-400 hover:text-white text-sm"
            >
              Sluiten ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Beeld + gereedschap + instructie */}
            <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                {focused.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={focused.image_url}
                    alt={focused.prompt ?? "beeld"}
                    className="max-h-full max-w-full object-contain rounded-xl"
                  />
                )}
              </div>

              {/* Gereedschap */}
              <div className="shrink-0 flex flex-wrap gap-2">
                <button type="button" onClick={() => runEdit(VARIATION_INSTRUCTION, "Variatie", "vary")} disabled={!!action} className={toolBtn}>
                  {action === "vary" ? "Variant maken…" : "✦ Variant"}
                </button>
                <button type="button" onClick={upscale} disabled={!!action} className={toolBtn}>
                  {action === "upscale" ? "Upscalen…" : "⤢ Upscale 2x"}
                </button>
                <button
                  type="button"
                  onClick={togglePin}
                  disabled={!!action}
                  className={
                    focusedPinned
                      ? toolBtn + " border-amber-500/40 text-amber-300"
                      : toolBtn
                  }
                >
                  {action === "pin"
                    ? "Bezig…"
                    : focusedPinned
                    ? "★ Ingrediënt, losmaken"
                    : "☆ Pin als ingrediënt"}
                </button>
                <button
                  type="button"
                  onClick={toggleInVideo}
                  disabled={!!action}
                  className={
                    focusedInVideo
                      ? toolBtn + " border-blue-500/40 text-blue-300"
                      : toolBtn
                  }
                >
                  {action === "shot"
                    ? "Bezig…"
                    : focusedInVideo
                    ? "✓ In video, uithalen"
                    : "+ Voeg toe aan video"}
                </button>
              </div>

              {/* Instructie */}
              <div className="shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    className="input flex-1 min-h-[44px] max-h-28 resize-none py-2.5"
                    placeholder="Wat wil je veranderen? Bijv. maak het paard wit"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        applyEdit();
                      }
                    }}
                    rows={1}
                  />
                  <button
                    type="button"
                    onClick={applyEdit}
                    disabled={!!action || instruction.trim().length < 2}
                    className="btn-primary shrink-0"
                  >
                    {action === "edit" ? "Bezig…" : "Pas aan"}
                  </button>
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {focused.image_url && (
                    <a
                      href={focused.image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Download
                    </a>
                  )}
                  {focused.prompt && (
                    <span className="text-xs text-slate-600 truncate">{focused.prompt}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Geschiedenis-rail */}
            <div className="md:w-56 shrink-0 border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Geschiedenis
              </p>
              <div className="space-y-1.5">
                {[...ancestors, focused].map((n, i) => (
                  <HistoryThumb
                    key={n.id}
                    node={n}
                    active={n.id === focused.id}
                    label={i === 0 && !n.parent_id ? "start" : undefined}
                    onClick={() => {
                      setFocusId(n.id);
                      setInstruction("");
                    }}
                  />
                ))}
              </div>

              {children.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">
                    Varianten hieruit
                  </p>
                  <div className="space-y-1.5">
                    {children.map((n) => (
                      <HistoryThumb
                        key={n.id}
                        node={n}
                        active={false}
                        onClick={() => {
                          setFocusId(n.id);
                          setInstruction("");
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryThumb({
  node,
  active,
  label,
  onClick,
}: {
  node: PlaygroundNode;
  active: boolean;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex gap-2 w-full text-left rounded-lg p-1.5 border transition-colors ${
        active
          ? "bg-blue-500/10 border-blue-500/30"
          : "border-transparent hover:bg-white/[0.04]"
      }`}
    >
      {node.image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={node.image_url}
          alt=""
          className="w-12 h-12 object-cover rounded-md shrink-0"
        />
      )}
      <span className="text-[11px] text-slate-400 line-clamp-3 leading-tight">
        {label ? <span className="text-slate-600">{label}: </span> : null}
        {node.prompt}
      </span>
    </button>
  );
}
