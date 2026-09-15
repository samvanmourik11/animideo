// OP DE GROND ZETTEN MET EEN SCHETS — het zoeken en tekenen; de meetkunde staat in
// schets-vorm.ts.
//
// Een bewerking in woorden ("de deur moet tot de grond reiken") verplaatst of verlengt
// niets. Hier wordt het voorwerp als bruine vorm tot op de grond in het beeld
// geschilderd, wie ervoor staat er weer overheen gezet, en maakt het beeldmodel die
// schets af. Proef op de geheime tuin: shot 4 kreeg een echte deur op het pad en de
// meisjes bleven gelijk; shot 3 kreeg een veel grotere deur, deels achter het meisje.

import sharp from "sharp";
import { fal } from "@fal-ai/client";
import { zoekVoorwerp } from "@/lib/editor/vision";
import { maakSchetsAf } from "@/lib/image-gen";
import { grondOnder, mensenVoorVorm, schetsSvg, schetsVak, vakInPixels } from "./schets-vorm";

fal.config({ credentials: process.env.FAL_KEY });

/**
 * Het voorwerp doortrekken tot de grond. Geeft de (tijdelijke) URL van het nieuwe beeld,
 * of null als het voorwerp niet gevonden werd — dan hoort de gewone bewerking het te doen.
 */
export async function zetOpDeGrond(input: {
  bronUrl: string;
  /** Engels, kort: "the wooden door". */
  voorwerp: string;
  instructie: string;
  format?: string;
}): Promise<string | null> {
  const res = await fetch(input.bronUrl);
  if (!res.ok) return null;
  const bron = Buffer.from(await res.arrayBuffer());
  const { width: W, height: H } = await sharp(bron).metadata();
  if (!W || !H) return null;

  const [voorwerpen, gronden, mensen] = await Promise.all([
    zoekVoorwerp(input.bronUrl, input.voorwerp, W, H),
    zoekVoorwerp(input.bronUrl, "the ground", W, H),
    // "person" vond in de proef precies de drie meisjes; "the people" gaf er ook een
    // kader om de hele groep bij, en dan zou iedereen over de vorm heen geplakt worden.
    zoekVoorwerp(input.bronUrl, "person", W, H),
  ]);
  const doel = voorwerpen.map((k) => vakInPixels(k, W, H)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!doel) return null;

  const vorm = schetsVak(doel, grondOnder(doel, gronden.map((k) => vakInPixels(k, W, H)), H));
  const ervoor = mensenVoorVorm(vorm, mensen.map((k) => vakInPixels(k, W, H)), W, H);
  const uitsneden = await Promise.all(
    ervoor.map(async (m) => ({
      input: await sharp(bron).extract({ left: m.x, top: m.y, width: m.w, height: m.h }).toBuffer(),
      left: m.x,
      top: m.y,
    })),
  );
  const schets = await sharp(bron)
    .composite([{ input: Buffer.from(schetsSvg(vorm, W, H)) }, ...uitsneden])
    .jpeg({ quality: 92 })
    .toBuffer();

  const schetsUrl = await fal.storage.upload(new Blob([new Uint8Array(schets)], { type: "image/jpeg" }));
  const af = await maakSchetsAf({ schetsUrl, voorwerp: input.voorwerp, instructie: input.instructie, format: input.format });
  return af.imageUrl;
}
