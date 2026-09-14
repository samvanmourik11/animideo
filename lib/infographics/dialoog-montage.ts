// DE MONTAGE — hoe de clips van een dialoogvideo in elkaar overlopen.
//
// Tussen scènes stond een overvloeier van een kwart seconde, dwars over de stemmen
// heen: het laatste woord van de ene scène liep door het eerste woord van de
// volgende, en halverwege zag je twee opstellingen door elkaar, met dubbele
// spookpersonages. Zo kort oogt een overvloeier als een hapering.
//
// Nu:
//  - tussen scènes een zachte overvloeier van 0,8 seconde;
//  - daaromheen een stil moment: het laatste beeld van de scène blijft even staan
//    (de "staart") en het eerste beeld van de volgende scène begint stil (de "kop").
//    De overvloeier valt precies op die stille stukken, dus er praat nooit iemand
//    doorheen;
//  - binnen een scène gewone lassen, zoals in een film;
//  - een korte fade vanuit zwart aan het begin en naar zwart aan het eind.
//
// Pure functies, zodat de tijdsberekening te testen is zonder ffmpeg.

export const SCENE_OVERGANG = 0.8;
export const BEGIN_INFADE = 0.4;
export const EIND_UITFADE = 0.8;

export interface MontageRegel {
  /** Index van de scène: een overgang komt alleen bij een scènewissel. */
  scene: number;
  /** Hoe lang de zin (of het actiebeeld) duurt. */
  spraak: number;
}

export interface MontageSegment extends MontageRegel {
  /** Stil stilstaand begin: het eerste beeld van een nieuwe scène tijdens de overvloeier. */
  kop: number;
  /** Stil einde: het laatste beeld blijft staan tijdens de overvloeier of de uitfade. */
  staart: number;
  /** Totale lengte van het segment. */
  duur: number;
}

/** Per segment de stille kop en staart rond een scènewissel en aan het eind. */
export function montagePlan(regels: MontageRegel[]): MontageSegment[] {
  return regels.map((r, i) => {
    const vorige = regels[i - 1];
    const volgende = regels[i + 1];
    const kop = vorige && vorige.scene !== r.scene ? SCENE_OVERGANG : 0;
    const staart = !volgende ? EIND_UITFADE : volgende.scene !== r.scene ? SCENE_OVERGANG : 0;
    return { ...r, kop, staart, duur: kop + r.spraak + staart };
  });
}

/**
 * Waar elke overvloeier begint in de samengevoegde video, en hoe lang die wordt.
 *
 * Elke overgang laat twee scènes `overgang` seconden overlappen; zonder die aftrek
 * schoof elke volgende overgang verder naar achteren.
 */
export function overgangOffsets(groepDuren: number[], overgang = SCENE_OVERGANG): { offsets: number[]; totaal: number } {
  let gelopen = groepDuren[0] ?? 0;
  const offsets: number[] = [];
  for (let i = 1; i < groepDuren.length; i++) {
    const offset = Math.max(0, gelopen - overgang);
    offsets.push(offset);
    gelopen = offset + groepDuren[i];
  }
  return { offsets, totaal: gelopen };
}

const s = (n: number) => n.toFixed(3);

/**
 * Videofilter voor één segment: schalen, op de spraak afkappen en een stilstaande
 * kop en staart eraan zetten.
 *
 * `bevriesStaart`: bij een gesproken regel blijft het laatste beeld staan. Seedance
 * laat de spreker de hele clip praten, dus met het echte vervolg van de clip bewoog
 * de mond nog door tijdens de stilte. Bij een actiebeeld mag de beweging doorlopen.
 */
export function segmentVideoFilter(schaal: string, seg: Pick<MontageSegment, "spraak" | "kop" | "staart">, bevriesStaart: boolean): string {
  const delen = [schaal];
  if (bevriesStaart) delen.push(`trim=duration=${s(seg.spraak)}`, "setpts=PTS-STARTPTS");
  const pad = [
    seg.kop > 0 ? `start_mode=clone:start_duration=${s(seg.kop)}` : "",
    // Ook bij een actiebeeld: is de clip korter dan nodig, dan het laatste beeld vasthouden.
    seg.staart > 0 ? `stop_mode=clone:stop_duration=${s(seg.staart)}` : "",
  ].filter(Boolean);
  if (pad.length) delen.push(`tpad=${pad.join(":")}`);
  return delen.join(",");
}

/** Audiofilter voor een gesproken segment: stilte vóór de zin (de kop) en erna. */
export function segmentAudioFilter(seg: Pick<MontageSegment, "kop">): string {
  return [
    "aresample=44100",
    "aformat=sample_fmts=fltp:channel_layouts=stereo",
    seg.kop > 0 ? `adelay=${Math.round(seg.kop * 1000)}:all=1` : "",
    "apad",
  ].filter(Boolean).join(",");
}

/** Zachte fade vanuit zwart aan het begin en naar zwart aan het eind van de hele video. */
export function beginEindFade(totaal: number): string {
  const uit = Math.max(0, totaal - EIND_UITFADE);
  return `fade=t=in:st=0:d=${s(BEGIN_INFADE)},fade=t=out:st=${s(uit)}:d=${s(EIND_UITFADE)}`;
}
