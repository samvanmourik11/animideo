// Eén keer herkansen bij een kortstondige PostgREST-hapering.
//
// "Cannot coerce the result to a single JSON object" (PGRST116) betekent dat
// .single()/.maybeSingle() 0 of meerdere rijen terugkreeg. Meestal is dat
// terecht (rij bestaat niet, of hoort bij een ander account). Maar op
// 29-09-2026 faalde het bewaren van een dialoogproject hiermee terwijl de rij
// gewoon bestond, bij de juiste gebruiker en de juiste mode stond — een
// kortstondige hapering, geen echte "niet gevonden". Één herkansing na een
// fractie van een seconde lost precies dat geval op zonder dat de gebruiker
// er iets van merkt; bestaat de rij écht niet, dan faalt de herkansing
// hetzelfde en komt de nette 404 er alsnog.
export async function metHerkansing<R extends { data: unknown; error: { code?: string; message?: string } | null }>(
  query: () => PromiseLike<R>
): Promise<R> {
  const eerste = await query();
  if (!eerste.error || eerste.error.code !== "PGRST116") return eerste;
  await new Promise((r) => setTimeout(r, 400));
  return query();
}
