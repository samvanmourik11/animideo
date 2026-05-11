import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

type FalImageResult = { image?: { url: string }; images?: { url: string }[] };

/**
 * Verwijdert de achtergrond van een afbeelding via fal-ai/birefnet.
 * Retourneert de publieke URL van het BG-removed beeld (PNG met alpha).
 */
export async function removeBackground(imageUrl: string): Promise<string> {
  const result = await fal.subscribe("fal-ai/birefnet", {
    input: { image_url: imageUrl },
  });
  const data = result.data as FalImageResult;
  const url = data.image?.url ?? data.images?.[0]?.url;
  if (!url) throw new Error("Background removal returned no image");
  return url;
}
