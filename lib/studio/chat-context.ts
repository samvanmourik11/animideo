// Compacte projectcontext voor de AI-buddy + pure scène-reducers die de wijzigingen
// toepassen. Gedeeld door de route (validatie/labels) en de client-dispatcher
// (StudioWizard.applyChatAction), zodat de muteer-logica op één plek leeft.

import type { Project, Scene } from "@/lib/types";
import type { ChatAction, SceneDraft } from "@/lib/studio/chat-tools";

const MAX_FIELD = 600; // tekstvelden in de context afkappen om tokens te begrenzen

function cap(s: string | null | undefined): string {
  const t = (s ?? "").toString();
  return t.length > MAX_FIELD ? t.slice(0, MAX_FIELD) + "…" : t;
}

export interface CompactScene {
  id: string;
  number: number;
  duration: number;
  voiceover_text: string;
  image_prompt: string;
  motion_prompt: string;
  cast_ids?: string[];
  brand_asset_ids?: string[];
  designed?: boolean; // ontworpen scène (geen AI-beeld) — buddy mag dit weten
}

export interface CompactProject {
  title: string;
  goal: string | null;
  target_audience: string | null;
  language: string;
  format: string;
  visual_style: string | null;
  notes: string | null;
  cast_roles: { id: string; name: string; appearance: string }[];
  scenes: CompactScene[];
}

// Strip de zware/grote velden (image_url, canvas_json, base64, refs) zodat een
// project van 15 scènes rond de 3–4k tokens blijft.
export function buildCompactProject(project: Project): CompactProject {
  return {
    title: project.title,
    goal: project.goal,
    target_audience: project.target_audience,
    language: project.language,
    format: project.format,
    visual_style: project.visual_style,
    notes: cap(project.notes),
    cast_roles: (project.cast_roles ?? []).map(r => ({ id: r.id, name: r.name, appearance: cap(r.appearance) })),
    scenes: (project.scenes ?? []).map(s => ({
      id: s.id,
      number: s.number,
      duration: s.duration,
      voiceover_text: cap(s.voiceover_text),
      image_prompt: cap(s.image_prompt),
      motion_prompt: cap(s.motion_prompt),
      cast_ids: s.cast_ids,
      brand_asset_ids: s.brand_asset_ids,
      designed: s.designed ? true : undefined,
    })),
  };
}

// ── Pure scène-helpers ──────────────────────────────────────────────────────

export function renumber(scenes: Scene[]): Scene[] {
  return scenes.map((s, i) => ({ ...s, number: i + 1 }));
}

function clampDuration(d: number | undefined, fallback = 5): number {
  const n = Number(d);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(15, Math.round(n)));
}

let seq = 0;
function newId(): string {
  seq += 1;
  // Math.random is in een browser/Node-route prima; alleen workflow-scripts verbieden het.
  return `scene-${Date.now()}-${seq}-${Math.floor(Math.random() * 1e4)}`;
}

export function newScene(args: { voiceover_text: string; image_prompt: string; motion_prompt?: string; duration?: number }): Scene {
  return {
    id: newId(),
    number: 0, // renumber() zet dit goed
    duration: clampDuration(args.duration),
    voiceover_text: args.voiceover_text ?? "",
    image_prompt: args.image_prompt ?? "",
    motion_prompt: args.motion_prompt ?? "",
    image_url: null,
    video_url: null,
    canvas_json: null,
  };
}

// Volledige herschrijving: behoud per matchende id de gegenereerde assets en
// overschrijf alleen de tekstvelden; onbekende drafts worden nieuwe scènes.
export function mergeDraftScenes(existing: Scene[], drafts: SceneDraft[]): Scene[] {
  const byId = new Map(existing.map(s => [s.id, s]));
  const merged = drafts.map(d => {
    const prev = d.id ? byId.get(d.id) : undefined;
    if (prev) {
      return {
        ...prev,
        voiceover_text: d.voiceover_text ?? prev.voiceover_text,
        image_prompt: d.image_prompt ?? prev.image_prompt,
        motion_prompt: d.motion_prompt ?? prev.motion_prompt,
        duration: clampDuration(d.duration, prev.duration),
      };
    }
    return newScene(d);
  });
  return renumber(merged);
}

// Bereken de project-updates voor een actie. Retourneert null als de actie niet
// toepasbaar is (bv. onbekende sceneId) of als het een regenereer-actie is (die
// loopt via een API-call, niet via state). De caller mergt het resultaat in de
// project-state (met de bestaande veiligheidskleppen van updateProject).
export function computeProjectUpdate(project: Project, action: ChatAction): Partial<Project> | null {
  const scenes = [...(project.scenes ?? [])];
  const indexOf = (id: string) => scenes.findIndex(s => s.id === id);

  switch (action.type) {
    case "edit_scene_voiceover": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes[i] = { ...scenes[i], voiceover_text: action.args.voiceover_text };
      return { scenes };
    }
    case "edit_image_prompt": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes[i] = { ...scenes[i], image_prompt: action.args.image_prompt };
      return { scenes };
    }
    case "edit_motion_prompt": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes[i] = { ...scenes[i], motion_prompt: action.args.motion_prompt };
      return { scenes };
    }
    case "set_scene_duration": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes[i] = { ...scenes[i], duration: clampDuration(action.args.duration, scenes[i].duration) };
      return { scenes };
    }
    case "set_cast_for_scene": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes[i] = { ...scenes[i], cast_ids: action.args.cast_ids };
      return { scenes };
    }
    case "add_scene": {
      const at = action.args.afterSceneId ? indexOf(action.args.afterSceneId) + 1 : scenes.length;
      const insertAt = at <= 0 ? scenes.length : at;
      scenes.splice(insertAt, 0, newScene(action.args));
      return { scenes: renumber(scenes) };
    }
    case "delete_scene": {
      const i = indexOf(action.args.sceneId);
      if (i < 0) return null;
      scenes.splice(i, 1);
      return { scenes: renumber(scenes) };
    }
    case "reorder_scene": {
      const i = indexOf(action.args.sceneId);
      const j = action.args.direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= scenes.length) return null;
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { scenes: renumber(scenes) };
    }
    case "rewrite_full_script": {
      if (!Array.isArray(action.args.scenes) || action.args.scenes.length === 0) return null;
      return { scenes: mergeDraftScenes(project.scenes ?? [], action.args.scenes) };
    }
    case "update_brief": {
      const upd: Partial<Project> = {};
      for (const k of ["title", "goal", "target_audience", "notes"] as const) {
        const v = action.args[k];
        if (typeof v === "string" && v.trim()) upd[k] = v;
      }
      return Object.keys(upd).length ? upd : null;
    }
    default:
      return null; // regenerate_scene_image e.d. lopen via een API-call
  }
}
