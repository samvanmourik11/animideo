// Verkleint en comprimeert een foto in de browser vóór upload.
//
// Vercel serverless functions weigeren elke request-body groter dan ~4,5 MB
// met een platte-tekst "Request Entity Too Large" (HTTP 413). Een moderne
// telefoonfoto is vaak 5-12 MB, dus die loopt er zonder compressie tegenaan.
// Door client-side te schalen naar max 1536px en als JPEG op te slaan blijft
// elke foto ruim onder de limiet, met behoud van voldoende kwaliteit voor
// karaktergeneratie.

const MAX_DIMENSION = 1536;
const JPEG_QUALITY = 0.85;

export async function compressImage(file: File): Promise<File> {
  // Alleen rasterafbeeldingen comprimeren; laat bv. SVG of onbekende types met rust.
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Kan het beeld niet decoderen (bv. niet-ondersteund formaat); origineel teruggeven.
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) return file;

  // Als compressie het bestand niet kleiner maakt, het origineel houden.
  if (blob.size >= file.size) return file;

  const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
