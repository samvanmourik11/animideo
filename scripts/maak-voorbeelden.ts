// Maakt de voorbeeldbeelden voor de tegels van de effecten en apps (eenmalig, of opnieuw
// voor één recept). Draait elk recept met precies dezelfde verborgen opdracht als bij een
// klant, op een paar door AI bedachte voorbeeldfoto's — zo laat de tegel eerlijk zien wat
// je krijgt, en staat er geen echt bestaand persoon op.
//
//   npx tsx --env-file=.env.local scripts/maak-voorbeelden.ts            # wat nog ontbreekt
//   npx tsx --env-file=.env.local scripts/maak-voorbeelden.ts vermeer    # één opnieuw
//
// Schrijft lib/creaties/voorbeelden.json na elk gelukt recept, dus afbreken en opnieuw
// starten kan zonder dubbel te betalen.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { RECEPTEN } from "@/lib/creaties/recepten";
import { receptOpdracht } from "@/lib/creaties/recepten-opdrachten";
import { resultaatUrl } from "@/lib/creaties/makers";

fal.config({ credentials: process.env.FAL_KEY });
// Sams account: dan staan deze kosten op naam in het logboek op /admin.
zetKostenContext("e5f6f9ae-1bd7-424f-adc0-037b6fe9600d", "Voorbeeldbeelden nieuwe app");

const BESTAND = "lib/creaties/voorbeelden.json";
type Voorbeeld = { invoer: string; resultaat: string; soort: "beeld" | "video" };
const klaar: Record<string, Voorbeeld> = existsSync(BESTAND) ? JSON.parse(readFileSync(BESTAND, "utf8")) : {};
const bewaarJson = () => writeFileSync(BESTAND, JSON.stringify(klaar, null, 2) + "\n");

// De voorbeeldfoto's worden door meerdere recepten gedeeld. Eén keer gemaakt, daarna
// altijd dezelfde: anders past het "voor" op de tegel niet meer bij het "na" (dat ging
// mis toen één recept opnieuw gemaakt werd en de gedeelde foto overschreef).
const BRONBESTAND = "scripts/voorbeelden-bronnen.json";
const bronUrls: Record<string, string> = existsSync(BRONBESTAND) ? JSON.parse(readFileSync(BRONBESTAND, "utf8")) : {};

// De voorbeeldfoto's: telefoonfoto-achtig, zodat het "voor" herkenbaar is als wat een
// klant zelf zou uploaden.
const BRONNEN: Record<string, { prompt: string; formaat: string }> = {
  vrouw: {
    prompt: "Casual smartphone photo, head and shoulders portrait of a friendly Dutch woman in her early thirties with shoulder-length wavy blond hair, light freckles, wearing a denim jacket, smiling, soft daylight, plain light wall behind her. Natural, unedited.",
    formaat: "1:1",
  },
  man: {
    prompt: "Casual smartphone selfie-style photo, head and shoulders of a friendly Dutch man around 40 with short dark-brown hair and a trimmed beard, wearing a grey sweater, neutral expression, indoor daylight. Natural, unedited.",
    formaat: "1:1",
  },
  volledig: {
    prompt: "Smartphone photo of a young Dutch woman standing on a sunny street in Utrecht, full body visible from head to toe, wearing a yellow raincoat, jeans and white sneakers, canal houses and bicycles behind her. Natural street photo.",
    formaat: "9:16",
  },
  product: {
    prompt: "Simple smartphone photo of a matte dark-green ceramic coffee mug with a small white leaf logo, standing on a slightly messy kitchen counter, ordinary indoor light. Unedited product snapshot.",
    formaat: "1:1",
  },
  hond: {
    prompt: "Smartphone photo of a happy golden retriever sitting on grass in a Dutch park, looking at the camera, tongue out, sunny afternoon.",
    formaat: "1:1",
  },
  advertentie: {
    prompt: "A clean modern advertising poster for a Dutch bakery: big headline text 'VERSE STROOPWAFELS' and smaller text 'Bakkerij De Zoete Zwaan', a stack of golden stroopwafels on a warm orange background, simple flat graphic design.",
    formaat: "9:16",
  },
};

// Welke voorbeeldfoto bij welk recept, en wat er in het tekstveld staat.
const KOPPELING: Record<string, { bron: string; tekst?: string }> = {
  smelten: { bron: "volledig" },
  verdwijnen: { bron: "volledig" },
  "bullet-time": { bron: "volledig" },
  "uitzoomen-ruimte": { bron: "volledig" },
  confetti: { bron: "vrouw" },
  "tot-leven": { bron: "@vermeer" },
  "product-draai": { bron: "product" },
  productfoto: { bron: "product" },
  "product-sfeer": { bron: "product", tekst: "op een ontbijttafel in een lichte Scandinavische keuken" },
  billboard: { bron: "advertentie" },
  abri: { bron: "advertentie" },
  profielfoto: { bron: "man" },
  vermeer: { bron: "vrouw" },
  rembrandt: { bron: "man" },
  "van-gogh": { bron: "volledig" },
  "delfts-blauw": { bron: "hond" },
  koningsdag: { bron: "vrouw" },
  elfstedentocht: { bron: "man" },
  pakjesavond: { bron: "vrouw" },
  actiefiguur: { bron: "man", tekst: "laptop, koffiebeker, fiets" },
  knuffel: { bron: "hond" },
  game: { bron: "volledig" },
  tekenfilm: { bron: "man" },
  outfit: { bron: "volledig", tekst: "een elegant donkerrood pak met witte sneakers" },
  "jaren-80": { bron: "vrouw" },
  "huisdier-mens": { bron: "hond" },
};

async function bewaar(tijdelijk: string, naam: string): Promise<string> {
  const res = await fetch(tijdelijk);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  const ext = mime.includes("png") ? "png" : mime.includes("mp4") ? "mp4" : mime.includes("webp") ? "webp" : "jpg";
  const db = createServiceClient();
  const pad = `voorbeelden/${naam}.${ext}`;
  const { error } = await db.storage
    .from("scene-assets")
    .upload(pad, Buffer.from(await res.arrayBuffer()), { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  // Met een versie erachter, zodat een opnieuw gemaakt voorbeeld niet uit de cache komt.
  return `${db.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl}?v=${Date.now()}`;
}

async function bron(naam: string): Promise<string> {
  if (bronUrls[naam]) return bronUrls[naam];
  const b = BRONNEN[naam];
  const r = await fal.subscribe("fal-ai/nano-banana-pro", {
    input: { prompt: b.prompt, aspect_ratio: b.formaat, num_images: 1, output_format: "jpeg" } as never,
  });
  const url = resultaatUrl("beeld", r.data);
  if (!url) throw new Error(`geen bronbeeld ${naam}`);
  bronUrls[naam] = await bewaar(url, `bron-${naam}-${Date.now()}`);
  writeFileSync(BRONBESTAND, JSON.stringify(bronUrls, null, 2) + "\n");
  console.log(`  bron ${naam} klaar`);
  return bronUrls[naam];
}

async function maak(id: string) {
  const k = KOPPELING[id];
  const r = RECEPTEN.find((x) => x.id === id)!;
  const fotoUrl = k.bron.startsWith("@") ? klaar[k.bron.slice(1)]?.resultaat : await bron(k.bron);
  if (!fotoUrl) throw new Error(`${id}: eerst ${k.bron.slice(1)} nodig`);
  const formaat = k.bron.startsWith("@") ? "9:16" : BRONNEN[k.bron].formaat;
  const o = receptOpdracht({ receptId: id, fotoUrl, tekst: k.tekst ?? "", toestemming: true, formaat });
  const res = await fal.subscribe(o.endpoint, { input: o.falInvoer as never });
  const url = resultaatUrl(o.soort, res.data);
  if (!url) throw new Error(`${id}: geen resultaat`);
  klaar[id] = { invoer: fotoUrl, resultaat: await bewaar(url, id), soort: r.soort };
  bewaarJson();
  console.log(`✓ ${id}`);
}

async function main() {
  const gevraagd = process.argv.slice(2);
  const ids = (gevraagd.length ? gevraagd : RECEPTEN.map((r) => r.id).filter((id) => !klaar[id]))
    .filter((id) => KOPPELING[id]);
  // tot-leven bouwt op het Vermeer-resultaat, dus die als laatste.
  const eerst = ids.filter((id) => id !== "tot-leven");
  console.log(`Te maken: ${ids.join(", ") || "niets"}`);

  // Eerst de bronnen na elkaar (ze worden door meerdere recepten gedeeld), dan alles tegelijk.
  for (const naam of new Set(eerst.map((id) => KOPPELING[id].bron).filter((b) => !b.startsWith("@")))) await bron(naam);
  const uitslag = await Promise.allSettled(eerst.map(maak));
  if (ids.includes("tot-leven")) uitslag.push(...(await Promise.allSettled([maak("tot-leven")])));
  for (const u of uitslag) if (u.status === "rejected") console.error("✗", u.reason?.message ?? u.reason);
  console.log(`Klaar: ${Object.keys(klaar).length}/${RECEPTEN.length}`);
}

main();
