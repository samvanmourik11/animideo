import OpenAI from "openai";

// Gedeelde OpenAI-client voor de hele app.
//
// Node 26 in combinatie met de OpenAI-SDK (die op undici/global fetch draait)
// geeft willekeurig "Invalid response body ... Premature close" op de response:
// een hergebruikte keep-alive-socket wordt vroegtijdig gesloten. Een custom
// fetch die "Connection: close" forceert gebruikt een verse socket per call en
// omzeilt de bug. Alle OpenAI-calls horen via deze client te lopen.
const closingFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers ?? {});
  headers.set("connection", "close");
  return fetch(input, { ...init, headers, keepalive: false });
};

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: closingFetch,
});

export interface WhisperWord { word: string; start: number; end: number }
export interface WhisperResult { words: WhisperWord[]; duration: number; text: string }

// Whisper-transcriptie met word-timestamps via een RAUWE multipart-fetch.
// Reden: de OpenAI-SDK file-upload faalt op Node 26 (undici) met "Premature
// close" / "Connection error", ook met de closingFetch. Een directe fetch met
// FormData werkt wél. Gebruik deze helper overal voor audio-transcriptie.
export async function transcribeWords(
  audio: Buffer | Uint8Array,
  opts: { language?: string; model?: string } = {},
): Promise<WhisperResult> {
  const fd = new FormData();
  // Kopie naar een verse Uint8Array zodat het een geldige BlobPart is (Buffer
  // kan op een SharedArrayBuffer zitten, wat TS afkeurt).
  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);
  fd.append("file", new Blob([bytes], { type: "audio/mpeg" }), "voice.mp3");
  fd.append("model", opts.model ?? "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  if (opts.language) fd.append("language", opts.language);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Whisper HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { words?: WhisperWord[]; duration?: number; text?: string };
  return { words: j.words ?? [], duration: j.duration ?? 0, text: j.text ?? "" };
}
