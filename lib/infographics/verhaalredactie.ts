import { VERTELLER_ID, type DialogueCastMember, type DialogueScene } from "./dialogue-schema";
import { kaalTekst, type VerhaalDeel } from "./verhaallijn";
import { lijktEngels, isCastBeschrijving } from "./momentcontrole";

// Wat de verhaalredactie van het eigen verhaal wel en niet mag. De redacteur is een
// taalmodel; alles wat hier staat is de rekenkundige controle achteraf, zodat een
// redactie die toch aan het verhaal van de gebruiker komt, niet wordt overgenomen.

export interface VasteZin {
  deel: number;
  /** Cast-id, of "verteller". */
  characterId: string;
  tekst: string;
}

/** De zinnen uit het verhaal van de gebruiker: vertellerzinnen en letterlijke citaten. */
export function vasteZinnen(lijn: VerhaalDeel[] | null | undefined, cast: DialogueCastMember[]): VasteZin[] {
  const uit: VasteZin[] = [];
  (lijn ?? []).forEach((d, i) => {
    const deel = i + 1;
    if (d.verteller?.trim()) uit.push({ deel, characterId: VERTELLER_ID, tekst: d.verteller.trim() });
    for (const c of d.citaten ?? []) {
      const lid = cast.find((x) => x.characterId === c.wie);
      if (lid && c.tekst.trim()) uit.push({ deel, characterId: lid.id, tekst: c.tekst.trim() });
    }
  });
  return uit;
}

/**
 * Mag de herschreven scène de oude vervangen? Null = ja, anders de reden.
 *
 * Alleen de vaste zinnen die al in déze scène stonden tellen: die heeft de pijplijn
 * daar neergezet, en daar horen ze te blijven — letterlijk, bij dezelfde persoon, in
 * dezelfde volgorde.
 */
export function redactieFout(
  oud: DialogueScene,
  nieuw: DialogueScene,
  vast: VasteZin[],
  castTeksten: string[],
  taal: string,
): string | null {
  const oudeRegels = oud.lines.map((l) => ({ wie: l.characterId, tekst: kaalTekst(l.text) }));
  const nieuweRegels = nieuw.lines.map((l) => ({ wie: l.characterId, tekst: kaalTekst(l.text) }));

  const hier = vast
    .map((v) => ({ v, plek: oudeRegels.findIndex((o) => o.wie === v.characterId && o.tekst === kaalTekst(v.tekst)) }))
    .filter((x) => x.plek >= 0)
    .sort((a, b) => a.plek - b.plek);
  let vanaf = 0;
  for (const { v } of hier) {
    const k = kaalTekst(v.tekst);
    const plek = nieuweRegels.findIndex((n, i) => i >= vanaf && n.wie === v.characterId && n.tekst === k);
    if (plek < 0) return `vaste zin weg, veranderd of verplaatst: "${v.tekst}"`;
    vanaf = plek + 1;
  }

  if (nieuw.lines.length > oud.lines.length + 3) return "meer dan drie regels erbij";
  if (nieuw.lines.length < oud.lines.length - 1) return "meer dan één regel eraf";

  const engels = /^(engels|english)$/i.test(taal.trim());
  for (const l of nieuw.lines) {
    if (!engels && lijktEngels(l.text ?? "")) return `Engelse zin: "${l.text}"`;
    if (isCastBeschrijving(l.text ?? "", castTeksten)) return `personagebeschrijving als zin: "${l.text}"`;
  }
  return null;
}
