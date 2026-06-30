import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export const maxDuration = 60;

const SYSTEM =
  `Je bent een scriptschrijver voor korte animatie-infographicvideo's in de stijl van "The Infographics Show". ` +
  `Je schrijft puntig en in het Nederlands. Je antwoordt UITSLUITEND met geldige JSON in de vorm {"scenes":[...]}.`;

function buildPrompt(topic: string) {
  return `Maak een script van 6 tot 8 scenes voor een korte infographic-video over dit onderwerp:
"${topic}"

Elke scene is één van deze types met EXACT deze velden:

1. {"type":"statement","dur":3,"text":"KORTE HOOFDLETTER-ZIN","sub":"optionele subtekst"}
   - krachtige uitspraak, max ~6 woorden, HOOFDLETTERS.
2. {"type":"gauge","dur":5,"headline":"KORTE KOP","title":"LABEL","from":<getal>,"to":<getal>,"unit":"€"}
   - een meter die van 'from' naar 'to' loopt. unit mag "€", "%" of "" zijn.
3. {"type":"triptych","dur":4.5,"panels":["WOORD1","WOORD2","WOORD3"]}
   - precies 3 korte panelen (1-3 woorden elk).
4. {"type":"map","dur":4}
   - een reis/route-concept (geen extra velden).
5. {"type":"chart","dur":4.5,"pct":<0-100>,"label":"KORTE LABEL","sub":"KORT WOORD"}
   - een donut die naar pct% groeit.
6. {"type":"character","dur":4.5,"styleId":"A","bg":"#2b3a59","bubble":"korte gesproken zin","charProps":{"expression":"neutraal","pose":"presenteren"}}
   - expression: neutraal | blij | verbaasd | denkend. pose: presenteren | zwaaien | wijzen | idle.

Regels:
- Begin met een pakkende 'statement'-hook en eindig met een 'statement'-clou.
- Gebruik gauge/chart/triptych/map om cijfers of concepten te visualiseren; verzin plausibele, illustratieve cijfers als dat helpt.
- Kies ÉÉN character-styleId (gebruik "A") en hergebruik die bij elke character-scene voor consistentie.
- Wissel scènetypes af, niet twee keer hetzelfde type achter elkaar.
- dur tussen 3 en 5. Nederlands. Kort en visueel.

Antwoord met alleen JSON: {"scenes":[ ... ]}.`;
}

type Scene = Record<string, unknown> & { type: string; dur: number };

const TYPES = new Set(["statement", "gauge", "triptych", "map", "chart", "character"]);
const EXPR = new Set(["neutraal", "blij", "verbaasd", "denkend"]);
const POSE = new Set(["presenteren", "zwaaien", "wijzen", "idle"]);
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function sanitize(input: unknown): Scene[] {
  if (!Array.isArray(input)) return [];
  const out: Scene[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const type = str(s.type);
    if (!TYPES.has(type)) continue;
    const dur = Math.min(8, Math.max(2, num(s.dur, 4)));
    if (type === "statement") {
      if (!str(s.text)) continue;
      out.push({ type, dur, text: str(s.text).slice(0, 60), ...(s.sub ? { sub: str(s.sub).slice(0, 80) } : {}) });
    } else if (type === "gauge") {
      out.push({ type, dur, headline: str(s.headline, "ZO LOOPT HET OP").slice(0, 50), title: str(s.title, "WAARDE").slice(0, 40), from: num(s.from, 0), to: num(s.to, 100), unit: ["€", "%", ""].includes(str(s.unit)) ? str(s.unit) : "" });
    } else if (type === "triptych") {
      const panels = Array.isArray(s.panels) ? s.panels.map((p) => str(p).slice(0, 24)).filter(Boolean).slice(0, 3) : [];
      while (panels.length < 3) panels.push("…");
      out.push({ type, dur, panels });
    } else if (type === "map") {
      out.push({ type, dur });
    } else if (type === "chart") {
      out.push({ type, dur, pct: Math.min(100, Math.max(0, Math.round(num(s.pct, 50)))), label: str(s.label, "RESULTAAT").slice(0, 40), sub: str(s.sub, "TOTAAL").slice(0, 16) });
    } else if (type === "character") {
      const cp = (s.charProps && typeof s.charProps === "object" ? s.charProps : {}) as Record<string, unknown>;
      out.push({
        type, dur,
        styleId: ["A", "B", "C", "D", "E"].includes(str(s.styleId)) ? str(s.styleId) : "A",
        bg: /^#[0-9a-fA-F]{6}$/.test(str(s.bg)) ? str(s.bg) : "#2b3a59",
        ...(s.bubble ? { bubble: str(s.bubble).slice(0, 90) } : {}),
        charProps: {
          expression: EXPR.has(str(cp.expression)) ? str(cp.expression) : "neutraal",
          pose: POSE.has(str(cp.pose)) ? str(cp.pose) : "presenteren",
        },
      });
    }
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
      temperature: 0.85,
      max_tokens: 1500,
    });
    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw);
    const scenes = sanitize(parsed.scenes);
    if (scenes.length < 2) return NextResponse.json({ error: "Kon geen bruikbaar script genereren" }, { status: 502 });
    return NextResponse.json({ scenes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
