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


/**
 * Rekent een punt op het frame om naar een punt op de compositie.
 *
 * De monteur kijkt naar een frame met de verhouding van de bron, maar plaatst
 * in de verhouding van de video. Staat er een vierkant beeld in een 16:9-video,
 * dan zit er zwart (of achtergrond) naast, en is "0,75 naar rechts op het frame"
 * niet hetzelfde als "0,75 naar rechts in beeld". Zonder deze omrekening landt
 * een afdekking naast het bordje.
 *
 * De compositor schaalt media passend in het kader (contain); die zelfde
 * rekensom staat hier.
 */
export function frameNaarCompositie(
  punt: { x: number; y: number },
  frame: { breedte: number; hoogte: number },
  compositie: { width: number; height: number }
): { x: number; y: number } {
  const passend = Math.min(compositie.width / frame.breedte, compositie.height / frame.hoogte);
  const zichtbareBreedte = (frame.breedte * passend) / compositie.width;
  const zichtbareHoogte = (frame.hoogte * passend) / compositie.height;
  return {
    x: 0.5 + (punt.x - 0.5) * zichtbareBreedte,
    y: 0.5 + (punt.y - 0.5) * zichtbareHoogte,
  };
}

/** Een breedte op het frame omgerekend naar een breedte op de compositie. */
export function breedteNaarCompositie(
  breedteOpFrame: number,
  frame: { breedte: number; hoogte: number },
  compositie: { width: number; height: number }
): number {
  const passend = Math.min(compositie.width / frame.breedte, compositie.height / frame.hoogte);
  return (breedteOpFrame * frame.breedte * passend) / compositie.width;
}


/** Hoe licht is deze kleur? 0 = zwart, 1 = wit. */
export function helderheid(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Gewogen naar hoe het oog licht ervaart.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Zwarte of witte letters, afhankelijk van waar ze op komen te liggen. */
export function leesbareLetterkleur(achtergrond: string): string {
  return helderheid(achtergrond) > 0.6 ? "#111111" : "#ffffff";
}

/**
 * De meest voorkomende kleur uit een handvol monsters.
 *
 * Eén monster naast een tekstvlak is een gok: net te ver en je zit op de muur
 * naast het bordje in plaats van op het bordje (dat gebeurde: een witte balk
 * over een groen bord). Meerdere monsters rondom, en dan de kleur die het
 * vaakst voorkomt, is een stuk betrouwbaarder.
 */
export function vaakstVoorkomend(kleuren: (string | null)[]): string | null {
  const geldig = kleuren.filter((k): k is string => !!k);
  if (geldig.length === 0) return null;
  const tellen = new Map<string, number>();
  for (const k of geldig) {
    // Afronden op 16 stappen per kanaal: bijna-gelijke kleuren tellen samen.
    const m = /^#?([0-9a-f]{6})$/i.exec(k);
    const sleutel = m
      ? m[1].toLowerCase().split("").map((c, i) => (i % 2 === 0 ? c : "0")).join("")
      : k;
    tellen.set(sleutel, (tellen.get(sleutel) ?? 0) + 1);
  }
  let besteSleutel = "";
  let besteAantal = 0;
  for (const [sleutel, aantal] of tellen) {
    if (aantal > besteAantal) { besteAantal = aantal; besteSleutel = sleutel; }
  }
  // Geef een echte kleur uit de groep terug, niet de afgeronde sleutel.
  return geldig.find((k) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(k);
    const sleutel = m ? m[1].toLowerCase().split("").map((c, i) => (i % 2 === 0 ? c : "0")).join("") : k;
    return sleutel === besteSleutel;
  }) ?? geldig[0];
}
