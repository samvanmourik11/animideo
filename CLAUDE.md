# Animideo (JouwAnimatieVideo A.I.)

Next.js-app waarmee klanten AI-animatievideo's maken. Meerdere tools naast elkaar
(Creator Studio, Storytelling, Infographic, Explainer, Foto, T2V, Playground),
een creditsysteem en maandabonnementen via Mollie. Supabase voor database,
auth en opslag. Draait op Vercel.

Stack: Next.js 16 (App Router, Turbopack), React 18, TypeScript, Tailwind 3,
Supabase, Node 26. Padalias: `@/` = projectroot.

## Werkafspraken

Zonder overleg doen:
- committen in git (nooit direct op de hoofdbranch — eerst een branch)
- pakketten installeren als een taak dat nodig maakt
- de dev-server starten, in de browser testen, screenshots maken

Altijd éérst vragen:
- **pushen / live zetten** — dat merken klanten meteen
- migraties draaien of data aanpassen
- iets aanpassen aan betalingen, abonnementen of credits van echte klanten
- een duurder AI-model inzetten dan er nu gebruikt wordt

Meld bij oplevering eerlijk wat wél en niet getest is. "Typecheck is schoon" is
iets anders dan "ik heb het zien werken".

## Waar het snel misgaat

**OpenAI: altijd via `lib/openai.ts`.** Node 26 + de OpenAI-SDK geeft willekeurig
"Premature close". De gedeelde client omzeilt dat met `Connection: close`. Audio
transcriberen gaat via `transcribeWords()` uit datzelfde bestand — de SDK-upload
faalt daar sowieso op.

**Credits loggen kan alleen met de service-client.** `credit_transactions` heeft
geen INSERT-policy voor gewone gebruikers; vanuit een gebruikerssessie mislukt
het stil. Dat heeft maandenlang alle afschrijvingen laten verdwijnen. Gebruik
`createServiceClient()` uit `lib/supabase/service.ts`.

**Migraties draai je met de hand.** Er is geen Supabase CLI in dit project. Nieuw
genummerd bestand in `supabase/migrations/`, en de SQL daarna zelf plakken in de
Supabase SQL-editor. Schrijf ze zo dat ze opnieuw gedraaid kunnen worden
(`IF NOT EXISTS`, `DROP POLICY IF EXISTS`).

**Mollie loopt via `lib/mollie.ts`.** De sleutel staat in `.env.local` (kopie in
`~/.mollie_key`). Sinds 18-08-2026 is dat de echte sleutel; stond daar nog de
oude placeholder `live_xxx...`, dan weigert `lib/mollie.ts` hem en krijg je
"MOLLIE_API_KEY ontbreekt of is een placeholder" op `/admin`. Het is een **live**
sleutel: nooit testen tegen echte klanten. Wat er in het
Mollie-dashboard gebeurt (opzeggingen!) synchroniseert niet vanzelf naar
`profiles.subscription_status` — controleer bij twijfel Mollie zelf.

**Credits kosten geld.** Tarieven staan in `lib/credit-costs.ts`, met de echte
providerkosten per call in het commentaar. Modellen rond ~$2,40 per clip zijn
bewust afgeserveerd. Nieuwe of duurdere calls eerst overleggen.

**Gegenereerde video's krijgen altijd een publieke URL** die te openen is, niet
alleen een pad in de opslag.

**Welke tool wie ziet, staat in `lib/studio/access.ts`.** `canUseStudio` is de
soft-launch-gate (kan met één knop voor iedereen open), `isAdminAccount` is
alleen intern. Verwar ze niet: aan de verkeerde hangen zet per ongeluk een tool
voor alle klanten open.

**Bestaande klantprojecten blijven bereikbaar.** Een tool uit het menu halen is
prima; de pagina's van al bestaande projecten dichtzetten niet — dan raken
klanten hun eigen werk kwijt.

## Controleren

- `npx tsc --noEmit` — de echte controle
- `npm test` — vitest (+ fast-check voor property-based tests). Dekt de pure
  logica onder de editor: het Timeline Document en straks EditorCore. Alles wat
  het document muteert hoort een test te hebben — daar gaat de AI-editor op los.
- `npm run dev` — dev-server op :3000
- `npm run lint` werkt **niet**: er is geen ESLint-config in dit project
- de rest (UI, Pixi-compositor, render) test je in de app zelf; meld bij
  oplevering eerlijk wat je wél en niet hebt zien werken

## Stijl

Nederlands, in de schermteksten én in het commentaar. Commentaar legt uit
*waarom* iets zo is (welke bug of afweging erachter zit), niet wat de regel doet.
Sluit aan bij de bestaande code in het bestand waar je in werkt.

## Handige plekken

| Wat | Waar |
|---|---|
| Betaalwebhook (abonnementen, credits, terugboekingen) | `app/api/mollie/webhook/route.ts` |
| Terugboekingen afhandelen | `lib/chargeback.ts` |
| Credits: saldo, afschrijven, plannen | `lib/credits.ts`, `lib/credit-costs.ts` |
| Toolzichtbaarheid | `lib/studio/access.ts` |
| Menu "Nieuw project" | `components/NewProjectButton.tsx` |
| Databaseschema (in volgorde) | `supabase/migrations/` |
| Supabase-clients (browser / server / service) | `lib/supabase/` |
