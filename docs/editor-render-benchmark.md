# Rendertijd van de editor — meting (fase 0)

Waarom deze meting: de export van de editor rendert **één screenshot per frame**
(`lib/editor/render-server.ts`) en draait in een Vercel-functie met een harde
limiet van 300 seconden (`app/api/editor/render/route.ts`, `maxDuration: 300`).
Een video van 60s bij 30fps is 1.800 screenshots. Voordat we infrastructuur
verbouwen willen we weten waar de grens ligt: moeten renders naar een aparte
worker, en heeft v1 een lengteplafond nodig?

## Methode

`scripts/bench-editor-render.test.ts` bouwt een realistische tijdlijn en roept
`renderTimeline()` rechtstreeks aan (dus zonder auth/HTTP-laag):

- scènes van 5 seconden, elk met een **andere `trimIn`** in dezelfde bronvideo,
  zodat de browser echt moet seeken — dat is het dure deel, niet het tekenen;
- een tekstclip over de eerste 3 seconden;
- een muziekbed over de hele lengte (audio wordt door ffmpeg gemixt, niet
  per frame gerenderd);
- 16:9 op 1920×1080, 30fps.

Draaien (dev-server moet op :3000 staan):

```
npx vitest run --config vitest.bench.config.mts
```

Met `BENCH_LENGTHS="15,30,60,120"` stel je de gemeten lengtes in, met
`BENCH_APP_URL` het adres van de compositor-pagina.

## Resultaten — lokaal (19-8-2026)

MacBook, volledige Playwright met systeem-Chrome, dev-server op :3000.

| Videolengte | Frames | Rendertijd | Verhouding | Bestand |
|---|---|---|---|---|
| 15s | 450 | 58,3s | 3,9× realtime | 2,1 MB |
| 30s | 900 | 95,8s | 3,2× realtime | 4,2 MB |
| 60s | 1.800 | 194,8s | 3,2× realtime | 8,4 MB |

De 15s-meting is relatief duur door een vaste opstart van ~12s (browser starten,
compositor laden, media inlezen). Daarna is het lineair: **~3,05 seconde render
per seconde video**, ofwel ~0,10s per frame.

Vuistregel: `rendertijd ≈ 12 + 3,05 × videolengte` (lokaal).

## Resultaten — productie (Vercel), 19-8-2026

Zelfde renderer, maar op Vercel: `playwright-core` + `@sparticuz/chromium` in
een serverless functie met `maxDuration: 300`. Gemeten met een echt
klantproject uit de editor (`822d4ec6…`, 28,7s, 5 videoclips, 1920×1080@30) via
de exportknop in de UI.

| Wat | Uitkomst |
|---|---|
| Voortgang na enkele seconden | 3% |
| Na 300s (functielimiet) | nog steeds bezig |
| Na 370s | geen bestand; project bleef op status `rendering` staan |
| Melding aan de gebruiker | **geen** — de knop viel terug op "Exporteren" |

Ter vergelijking: hetzelfde formaat duurde lokaal ~96 seconden. Vercel is dus
**minstens 3× langzamer** — te verwachten, want daar draait een uitgeklede
Chromium op zwakkere CPU.

## Conclusie

1. **Het huidige plafond ligt rond de 25 seconden video.** Met de vuistregel
   hierboven en een factor 3 komt 300s functietijd overeen met ~90s render per
   30s video… en dat haalde het net niet. Alles daarboven wordt afgekapt.
2. **De afkap is stil.** De functie wordt gedood, dus de `catch` die de status
   op `error` zet draait nooit. Het project blijft op `rendering` hangen en de
   gebruiker ziet geen foutmelding. Dat is een bug in de huidige editor, los van
   de AI-plannen: exporteren van een normale Studio-video van 30s mislukt nu
   zonder uitleg.
3. **Renderen moet van Vercel af.** Niet vanwege de AI-editor, maar omdat de
   editor vandaag al over de limiet gaat. Een langlopende worker (Trigger.dev of
   een eigen container op Fly/Railway) heeft geen harde tijdslimiet, kan
   parallel chunken en houdt de voortgang in de database bij.
4. **Tot dat is opgelost:** v1 begrenzen op ~20 seconden export, én de UI
   eerlijk laten falen (time-out afvangen, status op `error`, melding tonen).

Volgende stap: dit meten met een worker-opzet en dan vergelijken. De meting is
herhaalbaar met het script hierboven, dus na elke ingreep opnieuw te draaien.
