import { openai } from "@/lib/openai";

// Detecteert of een scene-illustratie leesbare tekst/cijfers bevat. Gebruikt om
// animatie (image-to-video) te blokkeren voor zulke beelden: video-modellen
// hertekenen elk frame en laten tekst/cijfers steevast vervormen en wegvliegen.
// Een beeld met tekst blijft daarom een still (met Ken Burns-camerabeweging in
// preview/export) i.p.v. te worden geanimeerd.
//
// Fail-open: bij een fout (of onbereikbaar model) geven we `false` terug, zodat
// een tijdelijke storing de animatie-knop niet blokkeert.
export async function imageHasText(imageUrl: string): Promise<boolean> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 3,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Bevat deze afbeelding leesbare tekst, cijfers, jaartallen of labels (bijvoorbeeld op een kalender, in een tekstballon, op een grafiek, bordje of logo)? Antwoord met exact één woord: JA of NEE.",
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
    });
    const a = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase();
    return a.startsWith("ja");
  } catch (e) {
    console.error("[detect-text] check mislukt, animatie toegestaan:", e);
    return false;
  }
}
