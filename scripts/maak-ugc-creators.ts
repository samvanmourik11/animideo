// Maakt de portretten van de vaste UGC-creators (eenmalig, of opnieuw voor één creator).
//
//   npx tsx --env-file=.env.local scripts/maak-ugc-creators.ts          # wat nog ontbreekt
//   npx tsx --env-file=.env.local scripts/maak-ugc-creators.ts sanne    # één opnieuw
//
// Schrijft lib/ugc/creators.json na elk gelukt portret, dus afbreken en opnieuw starten
// kan zonder dubbel te betalen (~$0,15 per portret).

import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { CREATOR_BRONNEN, portretPrompt } from "@/lib/ugc/creators";

fal.config({ credentials: process.env.FAL_KEY });
// Sams account: dan staan deze kosten op naam in het logboek op /admin.
zetKostenContext("e5f6f9ae-1bd7-424f-adc0-037b6fe9600d", "UGC-creators maken");

const BESTAND = "lib/ugc/creators.json";
const klaar: Record<string, string> = JSON.parse(readFileSync(BESTAND, "utf8"));
const alleen = process.argv[2];

async function main() {
  for (const c of CREATOR_BRONNEN) {
    if (alleen ? c.id !== alleen : klaar[c.id]) continue;
    process.stdout.write(`${c.naam}… `);
    try {
      const r = await fal.subscribe("fal-ai/nano-banana-pro", {
        input: { prompt: portretPrompt(c.uiterlijk), aspect_ratio: "9:16", num_images: 1, output_format: "jpeg", resolution: "2K" } as never,
      });
      const url = (r.data as { images?: { url?: string }[] }).images?.[0]?.url;
      if (!url) throw new Error("geen beeld");
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const db = createServiceClient();
      const pad = `ugc-creators/${c.id}-${randomUUID().slice(0, 8)}.jpg`;
      const { error } = await db.storage.from("scene-assets").upload(pad, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(error.message);
      klaar[c.id] = db.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
      writeFileSync(BESTAND, JSON.stringify(klaar, null, 2) + "\n");
      console.log("klaar");
    } catch (e) {
      console.log("mislukt:", e instanceof Error ? e.message : e);
    }
  }
}

main();
