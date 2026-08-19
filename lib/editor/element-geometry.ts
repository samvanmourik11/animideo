// Rekenwerk rond losse elementen in beeld. Bewust apart van elements.ts: daar
// worden API-clients opgetuigd, en dit is pure wiskunde die je zonder sleutels
// en zonder netwerk moet kunnen testen.

/**
 * Afmetingen uit een PNG-header lezen (IHDR staat altijd vooraan). Nodig om de
 * gewenste breedte om te rekenen naar de schaal die de compositor gebruikt.
 */
export function pngFormaat(png: Buffer): { breedte: number; hoogte: number } | null {
  if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") return null;
  return { breedte: png.readUInt32BE(16), hoogte: png.readUInt32BE(20) };
}

/**
 * De compositor schaalt een element eerst passend in het kader (contain) en
 * vermenigvuldigt dát met `scale`. Een gewenste breedte van 15% van het beeld is
 * dus niet scale 0,15 — vandaar deze omrekening. Zonder dit kwam een appel als
 * speldenknop van 30 pixels in beeld.
 */
export function breedteNaarSchaal(
  breedteFractie: number,
  element: { breedte: number; hoogte: number },
  compositie: { width: number; height: number }
): number {
  const passend = Math.min(compositie.width / element.breedte, compositie.height / element.hoogte);
  const gewenstePixels = breedteFractie * compositie.width;
  return gewenstePixels / (element.breedte * passend);
}
