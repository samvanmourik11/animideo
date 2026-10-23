// DE LEERRONDE — elke week bekijkt Claude een greep uit de beelden die de Regisseur maakte
// (met de opdracht erbij) en de feedback die klanten gaven, en zoekt naar fouten die STEEDS
// terugkomen. Daaruit stelt hij een paar regels voor het regieboek voor. Die gaan pas meedoen
// als Sam ze aanzet op /admin/regieboek: een slechte regel die vanzelf live gaat, maakt
// alle video's slechter (zoals de herstelaanwijzingen in de dialoogmodus, 13-09-2026).

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { BASIS } from "./regieboek";

const MODEL = "claude-opus-5-5";
const VENSTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BEELDEN = 24;
const MAX_FEEDBACK = 60;
export const CATEGORIEEN = ["beeld", "video", "verhaal", "stem", "montage"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    voorstellen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          categorie: { type: "string", enum: [...CATEGORIEEN] },
          regel: { type: "string", description: "De regel zelf, als opdracht aan de Regisseur, één of twee zinnen, Nederlands." },
          waarom: { type: "string", description: "Welke terugkerende fout je zag, en hoe vaak (voor Sam)." },
          voorbeelden: { type: "array", items: { type: "string" }, description: "Creatie-ids van beelden waar de fout in zit." },
        },
        required: ["categorie", "regel", "waarom", "voorbeelden"],
      },
    },
  },
  required: ["voorstellen"],
};

/** Korte stukjes tekst van klanten die als feedback kunnen gelden (Claude filtert verder). */
export function feedbackUit(berichten: unknown[]): string[] {
  const uit: string[] = [];
  for (const b of berichten as { role?: string; content?: unknown }[]) {
    if (b.role !== "user") continue;
    const blokken = typeof b.content === "string" ? [{ type: "text", text: b.content }] : Array.isArray(b.content) ? b.content : [];
    for (const blok of blokken as { type?: string; text?: string; content?: unknown }[]) {
      const t = blok.type === "text" ? blok.text : blok.type === "tool_result" && typeof blok.content === "string" ? blok.content : "";
      if (!t || t.startsWith("(Bijlage") || t.startsWith("Vaste taak ")) continue;
      const schoon = t.replace(/^Antwoord van de gebruiker: /, "").replace(/ \[waarde: [\s\S]*\]$/, "").trim();
      // Alleen echte reacties: geen technische resultaten, geen knopjes zonder uitleg.
      if (schoon.length < 12 || /^(Gestart|Uitgesteld|Niet uitgevoerd|Wachten kan|De gebruiker wilde)/.test(schoon)) continue;
      uit.push(schoon.slice(0, 300));
    }
  }
  return uit;
}

export async function leerronde(nu = Date.now()): Promise<{ bekeken: number; feedback: number; voorstellen: number }> {
  const db = createServiceClient();
  const sinds = new Date(nu - VENSTER_MS).toISOString();
  const { data: projecten } = await db.from("regie_projecten").select("berichten, galerij").gte("updated_at", sinds).limit(200);
  const ids = [...new Set((projecten ?? []).flatMap((p) => (p.galerij ?? []) as string[]))];
  // Feedback onder eindresultaten (met sterren) weegt het zwaarst: die gaat voorop.
  const { data: fb } = await db.from("creatie_feedback").select("sterren, tekst, creaties(maker)").gte("created_at", sinds).order("sterren").limit(MAX_FEEDBACK);
  const beoordeeld = (fb ?? []).map((f) => `${"★".repeat(f.sterren)} (${(f.creaties as { maker?: string } | null)?.maker ?? "video"}): ${f.tekst}`);
  const feedback = [...beoordeeld, ...(projecten ?? []).flatMap((p) => feedbackUit((p.berichten ?? []) as unknown[]))].slice(0, MAX_FEEDBACK);

  const { data: cs } = ids.length
    ? await db.from("creaties").select("id, url, prompt, maker, status, foutmelding").in("id", ids.slice(0, 500)).gte("created_at", sinds)
    : { data: [] };
  const klaar = (cs ?? []).filter((c) => c.status === "klaar" && c.url && c.maker === "beeld");
  // Een willekeurige greep, zodat niet steeds dezelfde klant de les bepaalt.
  const greep = klaar.sort(() => Math.random() - 0.5).slice(0, MAX_BEELDEN);
  const mislukt = (cs ?? []).filter((c) => c.status === "mislukt").map((c) => `${c.maker}: ${c.foutmelding ?? "?"}`).slice(0, 30);
  if (greep.length < 4 && feedback.length < 5) return { bekeken: greep.length, feedback: feedback.length, voorstellen: 0 };

  const { data: bestaand } = await db.from("regieboek_regels").select("regel, status");
  const actief = (bestaand ?? []).filter((r) => r.status === "actief").map((r) => `- ${r.regel}`).join("\n");
  const afgewezen = (bestaand ?? []).filter((r) => r.status !== "actief").map((r) => `- ${r.regel}`).join("\n");

  const inhoud: Anthropic.ContentBlockParam[] = [];
  for (const c of greep) {
    inhoud.push({ type: "text", text: `Beeld ${c.id} — opdracht: ${String(c.prompt ?? "").slice(0, 500)}` });
    inhoud.push({ type: "image", source: { type: "url", url: c.url! } });
  }
  inhoud.push({
    type: "text",
    text: `Feedback van klanten deze week:\n${feedback.map((f) => `- ${f}`).join("\n") || "(geen)"}\n\nMislukte opdrachten:\n${mislukt.join("\n") || "(geen)"}`,
  });

  const antwoord = await new Anthropic()
    .messages.stream({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: `Je verbetert het regieboek van de Regisseur van Animideo (een Nederlandse app die met AI beelden en video's maakt voor bedrijven). Je krijgt een willekeurige greep uit de beelden van deze week met de opdracht erbij, feedback van klanten en mislukte opdrachten.

Zoek alleen naar fouten die STEEDS terugkomen (in meerdere beelden of meerdere keren genoemd) en die je met een regel bij het schrijven van de opdracht kunt voorkomen: bijvoorbeeld rare handen bij een bepaald soort shot, tekst die fout gaat, personages die niet gelijk blijven, licht dat niet klopt, beelden die niet doen wat de opdracht vroeg. Eenmalige missers tellen niet. Geen smaakkwesties, geen regels die al in het regieboek staan, en geen regels die eerder zijn afgewezen.

Stel 0 tot 5 regels voor, elk concreet en uitvoerbaar ("Bij close-ups van handen die een product vasthouden: …"), met bij elke regel welke fout je zag en de ids van de beelden waar het in zit. Geen fouten gevonden die terugkomen? Geef dan een lege lijst; dat is een goed antwoord.

Het huidige regieboek:
${BASIS}
${actief ? `\nAl aangezette regels:\n${actief}` : ""}
${afgewezen ? `\nEerder voorgesteld (niet opnieuw voorstellen):\n${afgewezen}` : ""}`,
      messages: [{ role: "user", content: inhoud }],
    })
    .finalMessage();

  const json = antwoord.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const voorstellen = (JSON.parse(json || "{}") as { voorstellen?: { categorie: string; regel: string; waarom: string; voorbeelden: string[] }[] }).voorstellen ?? [];
  const rijen = voorstellen
    .filter((v) => CATEGORIEEN.includes(v.categorie as never) && v.regel?.trim())
    .slice(0, 5)
    .map((v) => ({
      categorie: v.categorie,
      regel: v.regel.trim().slice(0, 600),
      waarom: v.waarom?.slice(0, 800) ?? null,
      voorbeelden: (v.voorbeelden ?? []).map((id) => greep.find((c) => c.id === id)).filter(Boolean).slice(0, 6).map((c) => ({ id: c!.id, url: c!.url, prompt: String(c!.prompt ?? "").slice(0, 300) })),
      status: "voorstel",
      bron: "leerronde",
    }));
  if (rijen.length) await db.from("regieboek_regels").insert(rijen);
  return { bekeken: greep.length, feedback: feedback.length, voorstellen: rijen.length };
}
