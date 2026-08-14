// Scenegrenzen op een voice-over leggen.
//
// Losse, pure module (geen server-imports) zodat dit algoritme apart getest kan
// worden — het bepaalt of beeld en stem gelijk lopen, en dat is precies het soort
// logica dat je niet alleen in de app wilt controleren.
//
// Bij een gegenereerde stem volgt de audio het script woord voor woord. Bij een
// eigen opname niet: iemand slaat een woord over, zegt "eh", of formuleert net
// anders. Daarom ankeren we elke scenegrens opnieuw op de eerste woorden van die
// scene, in plaats van de woorden simpelweg door te tellen — anders stapelt elke
// kleine afwijking zich op en loopt het beeld richting het eind steeds verder uit.

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface AlignResult {
  /** Starttijd (seconden) per scene, altijd oplopend; de eerste is 0. */
  starts: number[];
  /** True als er op tekstlengte is verdeeld i.p.v. op de echte woordtiming. */
  fallbackUsed: boolean;
  /** Aantal scenegrenzen dat op een herkende zin ligt. */
  anchorsMatched: number;
  /** Aantal grenzen dat te ankeren viel (aantal scenes - 1). */
  anchorsTotal: number;
  /** Aantal woorden in het script, voor de terugkoppeling. */
  sceneWords: number;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}

/** Twee woorden gelijk genoeg? Whisper hoort niet altijd exact wat er staat. */
export function lijktOp(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) {
    // Zelfde stam telt mee: "subsidies" vs "subsidie", "loopt" vs "lopen".
    const n = Math.min(4, Math.min(a.length, b.length));
    return a.slice(0, n) === b.slice(0, n);
  }
  return false;
}

/**
 * Zoekt rond `verwacht` de positie waar `anker` in het transcript begint.
 * Geeft -1 als er geen overtuigende match is.
 */
export function zoekAnker(
  woorden: string[],
  anker: string[],
  verwacht: number,
  venster: number
): number {
  if (anker.length === 0 || woorden.length === 0) return -1;
  const van = Math.max(0, verwacht - venster);
  const tot = Math.min(woorden.length - 1, verwacht + venster);

  let besteIdx = -1;
  let besteScore = 0;
  let besteAfstand = Infinity;

  for (let i = van; i <= tot; i++) {
    let score = 0;
    for (let j = 0; j < anker.length && i + j < woorden.length; j++) {
      if (lijktOp(woorden[i + j], anker[j])) score++;
    }
    const afstand = Math.abs(i - verwacht);
    // Bij gelijke score wint de positie die het dichtst bij de verwachting ligt.
    if (score > besteScore || (score === besteScore && score > 0 && afstand < besteAfstand)) {
      besteScore = score;
      besteIdx = i;
      besteAfstand = afstand;
    }
  }

  // Minstens de helft van het anker moet kloppen (en altijd ≥2 woorden), anders
  // is het toeval en vertrouwen we liever op de verwachte positie.
  const drempel = Math.max(2, Math.ceil(anker.length / 2));
  return besteScore >= drempel ? besteIdx : -1;
}

/**
 * Bepaalt per scene waar hij begint in de audio.
 *
 * @param words       woord-timestamps uit Whisper
 * @param sceneTexts  de voice-overtekst per scene, in volgorde
 * @param audioDuration totale lengte van de audio in seconden
 */
export function alignScenes(
  words: WordTimestamp[],
  sceneTexts: string[],
  audioDuration: number
): AlignResult {
  const sceneTokens = sceneTexts.map((t) => tokenize(t ?? ""));
  const sceneWords = sceneTokens.reduce((a, t) => a + t.length, 0);
  const anchorsTotal = Math.max(0, sceneTexts.length - 1);

  const ratioMismatch =
    sceneWords === 0 ? 1 : Math.abs(words.length - sceneWords) / Math.max(words.length, sceneWords);

  // Wijkt het aantal getranscribeerde woorden te ver af van het script (>30%),
  // dan is de opname iets ánders dan het script en heeft op woorden matchen geen
  // zin: verdeel dan naar tekstlengte, zodat we nooit volledig de mist in gaan.
  if (ratioMismatch > 0.3 || sceneWords === 0 || words.length === 0) {
    const charLens = sceneTexts.map((t) => Math.max(1, (t ?? "").trim().length));
    const totalChars = charLens.reduce((a, n) => a + n, 0);
    let acc = 0;
    const starts = charLens.map((c) => {
      const st = (acc / totalChars) * audioDuration;
      acc += c;
      return st;
    });
    if (starts.length > 0) starts[0] = 0;
    return { starts, fallbackUsed: true, anchorsMatched: 0, anchorsTotal, sceneWords };
  }

  // Genormaliseerde vorm van elk getranscribeerd woord, op dezelfde index als
  // `words`, zodat een gevonden positie meteen zijn timestamp oplevert.
  const transcriptTokens = words.map((w) => tokenize(w.word)[0] ?? "");

  // Verhouding transcript↔script: bij een iets langzamere of snellere lezing dan
  // het script suggereert, ligt de verwachte positie evenredig verschoven.
  const schaal = words.length / sceneWords;
  const scriptCumulatief: number[] = [];
  let som = 0;
  for (const t of sceneTokens) {
    scriptCumulatief.push(som);
    som += t.length;
  }

  const starts = [0];
  let anchorsMatched = 0;
  let vorigeIdx = 0;

  for (let i = 1; i < sceneTexts.length; i++) {
    const verwacht = Math.min(words.length - 1, Math.round(scriptCumulatief[i] * schaal));
    // Zoekvenster meeschalen met de scene ervoor: bij lange scenes kan de
    // afwijking groter zijn dan bij korte.
    const venster = Math.max(20, Math.round(sceneTokens[i - 1].length * 0.6));
    const anker = sceneTokens[i].slice(0, 5);

    let idx = zoekAnker(transcriptTokens, anker, verwacht, venster);
    if (idx >= 0) anchorsMatched++;
    else idx = verwacht;

    // Scenes lopen altijd vooruit: een anker dat vóór de vorige scene valt
    // (bv. een herhaalde openingszin) mag de volgorde niet omgooien.
    if (idx <= vorigeIdx) idx = Math.min(words.length - 1, vorigeIdx + 1);
    vorigeIdx = idx;

    starts.push(words[idx]?.start ?? audioDuration);
  }

  return { starts, fallbackUsed: false, anchorsMatched, anchorsTotal, sceneWords };
}

/**
 * Van starttijden naar scene-duren. De duur van scene N is (start van N+1) −
 * (start van N), zodat stiltes meetellen en alle duren samen exact de audioduur
 * vullen: geen gaten, geen overlap.
 */
export function startsNaarDuren(starts: number[], audioDuration: number): number[] {
  return starts.map((start, i) => {
    const end = i < starts.length - 1 ? starts[i + 1] : audioDuration;
    return Math.round(Math.max(1, end - start) * 10) / 10;
  });
}
