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
//  - binnen een scène een korte overvloeier van 0,3 seconde. Eerst waren dat harde
//    lassen, uit de tijd dat een scène één beeld had en een dissolve bij elke zin
//    alleen geknipper gaf. Sinds elke zin een eigen storyboardbeeld heeft, staan de
//    personages per zin net anders, en dan zag een harde las eruit als geflikker
//    (Sam). Het laatste beeld van de zin blijft staan en vloeit in het volgende over;
//    de stem van de volgende zin begint gewoon op tijd, er praat niemand doorheen;
//  - een korte fade vanuit zwart aan het begin en naar zwart aan het eind.
//
// Pure functies, zodat de tijdsberekening te testen is zonder ffmpeg.

export const SCENE_OVERGANG = 0.8;
export const ZACHTE_LAS = 0.3;
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
  /**
   * Alleen beeld: zo lang blijft het laatste beeld extra staan om in de volgende zin
   * van dezelfde scène over te vloeien. Telt niet mee in `duur` — de overvloeier
   * overlapt het begin van de volgende zin, dus de tijdlijn en de stemmen schuiven niet.
   */
  las: number;
  /** Totale lengte van het segment op de tijdlijn (en van het geluid). */
  duur: number;
}

/** Per segment de stille kop en staart rond een scènewissel en aan het eind, en de zachte las erbinnen. */
export function montagePlan(regels: MontageRegel[]): MontageSegment[] {
  return regels.map((r, i) => {
    const vorige = regels[i - 1];
    const volgende = regels[i + 1];
    const kop = vorige && vorige.scene !== r.scene ? SCENE_OVERGANG : 0;
    const staart = !volgende ? EIND_UITFADE : volgende.scene !== r.scene ? SCENE_OVERGANG : 0;
    const las = volgende && volgende.scene === r.scene ? ZACHTE_LAS : 0;
    return { ...r, kop, staart, las, duur: kop + r.spraak + staart };
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
export function segmentVideoFilter(
  schaal: string,
  seg: Pick<MontageSegment, "spraak" | "kop" | "staart"> & { las?: number },
  bevriesStaart: boolean,
): string {
  const delen = [schaal];
  if (bevriesStaart) delen.push(`trim=duration=${s(seg.spraak)}`, "setpts=PTS-STARTPTS");
  // De zachte las naar de volgende zin houdt het laatste beeld net zo vast als de staart.
  const vast = seg.staart + (seg.las ?? 0);
  const pad = [
    seg.kop > 0 ? `start_mode=clone:start_duration=${s(seg.kop)}` : "",
    // Ook bij een actiebeeld: is de clip korter dan nodig, dan het laatste beeld vasthouden.
    vast > 0 ? `stop_mode=clone:stop_duration=${s(vast)}` : "",
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

/**
 * Het beeld van één scène: de segmenten met korte overvloeiers aan elkaar. `beeldDuren`
 * zijn de beeldlengtes (duur + las). Elke las overlapt precies zijn eigen extra stuk
 * stilstaand beeld, dus het resultaat is even lang als de zinnen samen en blijft
 * gelijk met het geluid, dat gewoon achter elkaar wordt geplakt. Voor twee of meer segmenten.
 */
export function zachteLassen(beeldDuren: number[], las = ZACHTE_LAS): { filter: string; label: string } {
  const { offsets } = overgangOffsets(beeldDuren, las);
  const delen: string[] = [];
  let label = "0:v";
  offsets.forEach((offset, i) => {
    const uit = `lv${i + 1}`;
    delen.push(`[${label}][${i + 1}:v]xfade=transition=fade:duration=${s(las)}:offset=${s(offset)}[${uit}]`);
    label = uit;
  });
  return { filter: delen.join(";"), label };
}

/** Zachte fade vanuit zwart aan het begin en naar zwart aan het eind van de hele video. */
export function beginEindFade(totaal: number): string {
  const uit = Math.max(0, totaal - EIND_UITFADE);
  return `fade=t=in:st=0:d=${s(BEGIN_INFADE)},fade=t=out:st=${s(uit)}:d=${s(EIND_UITFADE)}`;
}
