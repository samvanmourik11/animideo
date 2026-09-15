// Tellen in plaats van zoeken.
//
// Bij de Waterkant stond Lilly er twee keer in: vier mensen waar er drie hoorden.
// De beeldcontrole kreeg de vraag "staat er iemand dubbel of extra in?" en zag het
// niet — zo'n open zoekvraag mist een visie-model makkelijk. "Hoeveel mensen zie
// je?" beantwoordt het veel betrouwbaarder, en dat getal vergelijken met de cast
// is dan gewone rekenkunde.

/**
 * De fout die bij een telling hoort, of null als de telling klopt.
 *
 * Te veel is altijd fout. Te weinig alleen als iedereen zichtbaar hoort te zijn:
 * bij een close-up valt de rest er met opzet buiten.
 */
export function telFout(gezien: unknown, verwacht: number, iedereenZichtbaar: boolean): string | null {
  if (typeof gezien !== "number" || !Number.isFinite(gezien) || gezien < 0 || verwacht < 1) return null;
  const aantal = Math.round(gezien);
  if (aantal > verwacht) return `extra persoon: ${aantal} mensen in beeld, ${verwacht} verwacht`;
  if (iedereenZichtbaar && aantal < verwacht) return `iemand ontbreekt: ${aantal} mensen in beeld, ${verwacht} verwacht`;
  return null;
}
