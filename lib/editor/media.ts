"use client";

import { createClient } from "@/lib/supabase/client";
import type { Clip } from "./timeline";

export interface MediaMeta {
  width: number;
  height: number;
  duration?: number; // alleen video
}

/** Lees afmetingen (en lengte voor video) uit een bron-URL. */
export function probeMedia(url: string, kind: "video" | "image"): Promise<MediaMeta> {
  return new Promise((resolve, reject) => {
    if (kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Kon afbeelding niet laden"));
      img.src = url;
    } else {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
      v.onerror = () => reject(new Error("Kon video niet laden"));
      v.src = url;
    }
  });
}

function probeAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => resolve(isFinite(a.duration) && a.duration > 0 ? a.duration : 5);
    a.onerror = () => resolve(5);
    a.src = url;
  });
}

/** Bepaal het mediatype op MIME, met terugval op de bestandsextensie. */
function detectKind(file: File): "video" | "image" | "audio" | null {
  const mime = file.type;
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac"].includes(ext)) return "audio";
  return null;
}

/**
 * Upload een lokaal bestand direct naar Supabase storage (scene-assets) en geef
 * een kant-en-klare clip terug. Client-direct, zodat grote clips niet door een
 * Next-route hoeven (geen body-limiet).
 */
export async function uploadEditorMedia(
  file: File,
  projectId: string,
  userId: string
): Promise<Clip> {
  const kind = detectKind(file);
  if (!kind) throw new Error(`Niet-ondersteund bestandstype: ${file.name}`);

  const supabase = createClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/editor/${projectId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("scene-assets")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error("Upload mislukt: " + error.message);

  const { data } = supabase.storage.from("scene-assets").getPublicUrl(path);
  const url = data.publicUrl;

  if (kind === "audio") {
    const dur = await probeAudioDuration(url);
    return {
      id: crypto.randomUUID(),
      type: "audio",
      src: url,
      start: 0,
      duration: dur,
      trimIn: 0,
      volume: 1,
    };
  }

  const meta = await probeMedia(url, kind);
  if (kind === "video") {
    const dur = meta.duration && isFinite(meta.duration) ? meta.duration : 5;
    return {
      id: crypto.randomUUID(),
      type: "video",
      src: url,
      start: 0,
      duration: dur,
      trimIn: 0,
      naturalDuration: dur,
      volume: 1,
      speed: 1,
    };
  }
  return {
    id: crypto.randomUUID(),
    type: "image",
    src: url,
    start: 0,
    duration: 4,
  };
}
