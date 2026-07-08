import { openai } from "@/lib/openai";

// Zet een korte, vage bewerkingsinstructie ("selecteer alleen frankrijk, spanje
// en nederland") om naar één heldere, concrete, visuele Engelse instructie voor
// het image-edit-model. Beeld-edit-modellen volgen expliciete instructies ("houd
// X, verander Y naar Z, verwijder W") veel beter dan losse wensen. Krijgt de
// illustratie-briefing mee als context (bijv. "kaart van Europa").
//
// Fail-open: bij een fout geven we de originele instructie terug, zodat de edit
// altijd doorgaat.
export async function refineEditInstruction(instruction: string, brief?: string | null): Promise<string> {
  const raw = instruction.trim();
  if (!raw) return raw;
  try {
    const ctx = brief && brief.trim() ? `De illustratie toont: ${brief.trim()}\n` : "";
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Je herschrijft een korte, soms vage beeld-bewerkingswens naar ÉÉN heldere, concrete, visuele Engelse instructie voor een AI die een platte vector-infographic bewerkt. " +
            "Wees expliciet: benoem precies WAT hetzelfde blijft en WAT er verandert of verdwijnt, in termen van zichtbare elementen (kleuren, markers, objecten, landen, vormen). " +
            "Bij selectie/‘alleen’-wensen: zeg expliciet dat de rest neutraal/egaal wordt of verwijderd wordt. Behoud altijd de stijl, layout en het kader. " +
            "Antwoord met ALLEEN de instructie (één of twee zinnen), zonder uitleg.",
        },
        { role: "user", content: `${ctx}Bewerkingswens (mag Nederlands zijn): "${raw}"` },
      ],
    });
    const out = (resp.choices[0]?.message?.content ?? "").trim();
    return out.length > 0 ? out : raw;
  } catch (e) {
    console.error("[refine-edit] herschrijven mislukt, originele instructie gebruikt:", e);
    return raw;
  }
}
