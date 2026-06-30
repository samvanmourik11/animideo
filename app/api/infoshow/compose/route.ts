import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const maxDuration = 60;

const SYSTEM =
  `Je bent art-director + scriptschrijver voor korte animatie-infographicvideo's in de stijl van "The Infographics Show". ` +
  `Je COMPONEERT elke scene vrij door elementen op een 16:9-vlak te plaatsen (geen vaste sjablonen). ` +
  `Je schrijft in het Nederlands en antwoordt UITSLUITEND met geldige JSON {"scenes":[...]}.`;

function buildPrompt(topic: string) {
  return `Maak 6-8 scenes voor een infographic-video over: "${topic}".

Coördinaten: x en y zijn percentages 0-100 van het beeld. (0,0)=linksboven, (50,50)=midden, (100,100)=rechtsonder. Beeld is 16:9.

Een scene: {"type":"free","dur":4,"bg":"#1d2a86","swirl":true,"elements":[ ... ]}
- bg = donkere hex-achtergrondkleur. swirl=true geeft een bewegend golfpatroon (optioneel).
- elements = 2 tot 5 elementen, elk één van:
  {"kind":"text","x":50,"y":12,"text":"KORTE ZIN","size":"xl","color":"#ffffff","align":"center"}  (size: s|m|l|xl)
  {"kind":"stat","x":74,"y":42,"value":"€15.000","label":"PER JAAR","color":"#ffffff"}
  {"kind":"icon","x":26,"y":46,"emoji":"☕","size":16}  (emoji = passend bij het concept; size 8-22)
  {"kind":"shape","shape":"rect","x":50,"y":52,"w":34,"h":22,"color":"#ffffff","radius":16}  (of "circle")
  {"kind":"char","x":28,"y":60,"w":30,"h":72,"styleId":"A","expression":"blij","pose":"presenteren"}
     expression: neutraal|blij|verbaasd|denkend, pose: presenteren|zwaaien|wijzen|idle. Plaats personages onderaan (y 58-64).
  {"kind":"arrow","x1":34,"y1":50,"x2":62,"y2":40,"color":"#ffffff"}

Regels:
- Componeer als de Infographics Show: één duidelijk hoofdelement per scene + ondersteunende tekst/cijfer/icoon. Spreid de elementen, laat ze niet op elkaar liggen.
- Kies passende emoji's voor objecten/concepten (bijv. 🚀 💰 ☕ 📉 🌍). Gebruik stat voor grote getallen, text voor koppen/labels.
- Gebruik ÉÉN styleId voor personages (gebruik "A") en hergebruik die.
- Eerste scene = pakkende hook, laatste = clou. Nederlands, kort, hoofdletters voor koppen.
- dur 3-5. Zorg dat tekstkleuren leesbaar zijn op de bg.

Antwoord met alleen JSON: {"scenes":[ ... ]}.`;
}

const num = (v: unknown, d: number, lo = -1e9, hi = 1e9) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const hex = (v: unknown, d: string) => (/^#[0-9a-fA-F]{6}$/.test(str(v)) ? str(v) : d);
const pct = (v: unknown, d: number) => num(v, d, 0, 100);
const EXPR = new Set(["neutraal", "blij", "verbaasd", "denkend"]);
const POSE = new Set(["presenteren", "zwaaien", "wijzen", "idle"]);
const STYLE = new Set(["A", "B", "C", "D", "E"]);
const SIZES = new Set(["s", "m", "l", "xl"]);

function sanElement(raw: unknown): object | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  switch (str(e.kind)) {
    case "text": {
      const text = str(e.text).slice(0, 70); if (!text) return null;
      return { kind: "text", x: pct(e.x, 50), y: pct(e.y, 50), text, size: SIZES.has(str(e.size)) ? str(e.size) : "m", color: hex(e.color, "#ffffff"), align: ["left", "center", "right"].includes(str(e.align)) ? str(e.align) : "center" };
    }
    case "stat": {
      const value = str(e.value).slice(0, 24); if (!value) return null;
      return { kind: "stat", x: pct(e.x, 50), y: pct(e.y, 50), value, label: str(e.label).slice(0, 30), color: hex(e.color, "#ffffff") };
    }
    case "icon": {
      const emoji = str(e.emoji).slice(0, 8); if (!emoji) return null;
      return { kind: "icon", x: pct(e.x, 50), y: pct(e.y, 50), emoji, size: num(e.size, 12, 5, 28) };
    }
    case "shape":
      return { kind: "shape", shape: str(e.shape) === "circle" ? "circle" : "rect", x: pct(e.x, 50), y: pct(e.y, 50), w: pct(e.w, 20), h: pct(e.h, 14), color: hex(e.color, "#3b82f6"), radius: num(e.radius, 14, 0, 200) };
    case "char": {
      const cp = e as Record<string, unknown>;
      return { kind: "char", x: pct(e.x, 30), y: pct(e.y, 60), w: pct(e.w, 30), h: pct(e.h, 72), styleId: STYLE.has(str(e.styleId)) ? str(e.styleId) : "A", expression: EXPR.has(str(cp.expression)) ? str(cp.expression) : "neutraal", pose: POSE.has(str(cp.pose)) ? str(cp.pose) : "presenteren" };
    }
    case "arrow":
      return { kind: "arrow", x1: pct(e.x1, 30), y1: pct(e.y1, 50), x2: pct(e.x2, 60), y2: pct(e.y2, 50), color: hex(e.color, "#ffffff") };
    default: return null;
  }
}

function sanitize(input: unknown): object[] {
  if (!Array.isArray(input)) return [];
  const out: object[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const elements = (Array.isArray(s.elements) ? s.elements.map(sanElement).filter(Boolean) : []).slice(0, 7);
    if (!elements.length) continue;
    out.push({ type: "free", dur: num(s.dur, 4, 2, 8), bg: hex(s.bg, "#1d2a86"), swirl: s.swirl === true, elements });
  }
  return out.slice(0, 9);
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI niet geconfigureerd" }, { status: 500 });
  const { topic } = (await req.json().catch(() => ({}))) as { topic?: string };
  if (!topic || !topic.trim()) return NextResponse.json({ error: "Onderwerp vereist" }, { status: 400 });
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(topic.trim()) }],
      response_format: { type: "json_object" },
      temperature: 0.9,
      max_tokens: 2600,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    const scenes = sanitize(parsed.scenes);
    if (scenes.length < 2) return NextResponse.json({ error: "Kon geen bruikbare compositie genereren" }, { status: 502 });
    return NextResponse.json({ scenes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
