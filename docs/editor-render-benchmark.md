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

## Reparatie 1 — frames als JPEG in plaats van PNG (19-8-2026)

De renderlus maakte per frame een PNG. Dat is verliesloos comprimeren, en dat
kost méér tijd dan het tekenen van het frame zelf — terwijl de frames daarna
sowieso door H.264 gaan, dat óók lossy is. Die verliesloze tussenstap leverde
dus niets op. Nu: JPEG kwaliteit 92.

| Videolengte | PNG (was) | JPEG (nu) | Winst |
|---|---|---|---|
| 15s | 58,3s | 45,1s | 1,3× |
| 30s | 95,8s | 48,2s | 2,0× |
| 60s | 194,8s | 95,9s | 2,0× |

Van ~3,05 naar **~1,55 seconde render per seconde video**; per frame van 100 naar
53 ms. Visueel gecontroleerd op een frame met tekst en vlakke kleuren (het
gevoeligste geval voor JPEG-artefacten): geen zichtbaar verschil.

### Dezelfde ingreep op de andere renderers

Vier andere routes renderden ook frame voor frame naar PNG, en die zitten in
tools die klanten wél gebruiken (de editor zelf staat achter een allowlist van
drie interne accounts):

| Route | Gebruikt door |
|---|---|
| `app/api/studio/render-designed-scene` | Creator Studio, ontworpen scènes — 67 projecten, laatste van vandaag |
| `app/api/infographics/export-video` | Infographic-tool (nu nog intern) |
| `app/api/explainer/export` | Explainer-tool (nu nog intern) |
| `app/api/explainer/export-to-editor` | Explainer → editor |

Allemaal omgezet naar JPEG-frames. Uitzondering: de **poster** van een ontworpen
scène blijft PNG. Dat stilstaande beeld wordt opgeslagen en later hergebruikt,
en bij vlakke vormen met tekst is verliesloos dat waard — het kost één extra
screenshot.

Gecontroleerd op de zwaarste route (`render-designed-scene`, echte scène met
witte tekst op zwart en een lijntekening-logo): 200 OK in 11,8s, en tegen de
vorige PNG-render gemeten op **PSNR 39,0 dB luma / 40,7 dB gemiddeld** — daarin
zit ook nog het verschil van twee keer H.264 coderen. Visueel geen verschil te
zien. De andere drie routes zijn dezelfde eenregelige wijziging; die zijn niet
apart end-to-end gedraaid (wel de jpg-sequentie → ffmpeg-stap los getest).

## Reparatie 2 — eerlijk falen in plaats van stil afkappen

De renderlus krijgt nu een eigen tijdbudget (240s, ruim onder de functielimiet
van 300s) en meet na 45 frames hoe snel de machine is. Past de video niet binnen
het budget, dan stopt hij binnen ~10 seconden met een bruikbare melding:

> Deze video van 60 seconden is te lang om hier te exporteren. Op deze server
> past ongeveer 24 seconden binnen de beschikbare tijd. Kort de video in, of
> exporteer hem in delen.

Daarmee draait de foutafhandeling in de route wél (status wordt `error`, de
gebruiker ziet de melding) in plaats van dat de functie halverwege wordt gedood.
De rekensom staat los in `budgetAdvies()` en is getest.

## Meting op productie ná de reparatie (19-8-2026)

Zelfde project van 28,7s, nu op de nieuwe build:

- Na **40 seconden** stopte de export met een melding in beeld. Geen stille dood
  meer na zes minuten — het vangnet werkt.
- Gemeten voortgang: ~12% na 40s rendertijd → **~0,34 seconde per frame**. Dat is
  ruwweg **6,5× langzamer dan lokaal** (0,053 s/frame). De uitgeklede Chromium op
  een kleine serverless-CPU is duurder dan verwacht.

Die eerste meting legde meteen een fout in de kalibratie bloot: die keek naar de
eerste 45 frames, en juist daar komen de videodecoders op gang. Daardoor schatte
hij ~0,73 s/frame en meldde "ongeveer 11 seconden past" terwijl het er ~23
waren — video's die het wél zouden halen werden geweigerd. Nu wordt er pas ná 30
opwarmframes gemeten, en daarna elke 150 frames opnieuw (zodat een render die
halverwege trager wordt alsnog op tijd stopt).

**Het echte plafond op Vercel is daarmee ~23 seconden video** binnen het budget
van 240s.

## Conclusie

1. **Vóór deze ingrepen lag het plafond rond de 25 seconden video.** Met de vuistregel
   hierboven en een factor 3 komt 300s functietijd overeen met ~90s render per
   30s video… en dat haalde het net niet. Alles daarboven wordt afgekapt.
2. **De afkap is stil.** De functie wordt gedood, dus de `catch` die de status
   op `error` zet draait nooit. Het project blijft op `rendering` hangen en de
   gebruiker ziet geen foutmelding. Dat is een bug in de huidige editor, los van
   de AI-plannen: exporteren van een normale Studio-video van 30s mislukt nu
   zonder uitleg.
3. **Het plafond op Vercel ligt op ~23 seconden video** — gemeten, niet geschat.
   De JPEG-winst is er wel degelijk (de renders zijn twee keer sneller), maar de
   machine is zo veel trager dan een laptop dat een minuut video er niet in past.
4. **De goedkoopste volgende stap is `maxDuration` verhogen.** Vercel staat met
   Fluid Compute tot 800s toe; dat is één regel in `vercel.json` en zou het
   plafond naar ~70 seconden brengen. Uitzoeken of het abonnement dat toestaat.
   Lukt dat niet, dan moet renderen naar een eigen worker (Trigger.dev, Fly) —
   daar is geen harde limiet en kun je bovendien parallel chunken.
5. **Ondertussen faalt het in elk geval eerlijk**, wat het verschil is tussen
   "de knop doet niets" en "je video is te lang, kort hem in".

De meting is herhaalbaar met het script hierboven — na elke ingreep opnieuw
draaien, en op productie verifiëren.
