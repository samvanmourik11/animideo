# Productdossier JouwAnimatieVideo A.I. — voor LinkedIn-content

Samengesteld uit de broncode, copy, config en git-historie van de repository
`~/animatie-saas/animideo` (Next.js 16 SaaS). Doel: één betrouwbare bron van
waarheid om concrete, productspecifieke LinkedIn-content te schrijven.

> **Leesinstructie:** elk belangrijk feit verwijst naar het bestand waar het
> gevonden is. Wat onbekend of onzeker is, staat expliciet gemarkeerd met
> `⚠️ ONBEKEND` of `⚠️ TE VERIFIËREN`. Er is niets verzonnen.
>
> **Belangrijkste waarschuwing vooraf:** de marketingcopy op de site noemt
> deels andere AI-modellen dan de code feitelijk gebruikt. Zie sectie 10 en 14.
> Baseer technische claims op de code, niet op de oude landingspagina-copy.

---

## 1. Kern in één zin

Een Nederlandstalige SaaS waarmee een ondernemer een idee of brontekst invoert
en de software er automatisch een korte animatievideo van maakt: script,
beelden, beweging, voice-over en montage, geëxporteerd als MP4.
*(Bron: `AFSTUDEERVERSLAG-PROJECTGESCHIEDENIS.md`; `components/LandingPage.tsx`)*

---

## 2. Input → output

**Input (afhankelijk van de modus):**
- Eén zin of idee ("Leg uit hoe ons boekhoudprogramma werkt voor kleine bedrijven"). *(`components/LandingPage.tsx`, EXAMPLES regel 7-12)*
- Of: titel + doel + doelgroep + optionele details (hook, kernboodschap, CTA, toon, hoofdpersoon, omgeving, kleuren, te vermijden zaken). *(`components/wizard/Step1Setup.tsx`)*
- Of: een PDF/brontekst als databron. *(`PdfUploadButton`, gebruikt in infographics/explainer)*
- Of: eigen geüploade foto's (foto-modus). *(`components/wizard/StepFreeImages.tsx`)*

**Output:**
- Een gemonteerde MP4-video (16:9 of 9:16), met scenes, overgangen, voice-over en optioneel achtergrondmuziek. *(`app/api/export/route.ts`)*
- Tussenproducten die de gebruiker kan bijsturen: een scene-voor-scene script, per-scene beelden, per-scene bewegende clips, en een ingesproken voice-over.

---

## 3. Workflow stap voor stap (klassieke wizard)

De hoofdflow is een wizard van 6 stappen. *(`components/wizard/ProjectWizard.tsx`, `Step1Setup.tsx` t/m `Step6Editor.tsx`)*

1. **Project instellen** — titel, doel, doelgroep, taal, formaat (16:9/9:16), visuele stijl, optionele huisstijl en geavanceerde verhaal-/beelddetails. GPT-4o genereert hieruit een scene-voor-scene script. *(`Step1Setup.tsx`)*
2. **Script Editor** — de gegenereerde scenes in een tabel (voice-overtekst, beeldprompt, motion-instructie, duur). Herorden, bewerk, voeg toe of verwijder. *(`Step2Script.tsx`)*
3. **Beelden** — per scene een illustratie genereren; aanpassen, upscalen (2×), of een deel bijwerken (inpaint). Per scene goedkeuren. *(`Step3Images.tsx`)*
4. **Beweging** — per scene een motion-instructie; het stilstaande beeld wordt een bewegende clip (image-to-video). *(`Step4Motion.tsx`)*
5. **Voice-over** — stem kiezen, snelheid/stabiliteit instellen, inspreken; of eigen audio uploaden; voice-over uitlijnen op de scene-duren. *(`Step5Voiceover.tsx`)*
6. **Editor** — tijdlijn met clips, voice-over en muziek; overgangen (cut, fade, dissolve, slide, zoom-in); render en download als MP4. *(`Step6Editor.tsx`; `app/api/export/route.ts`)*

**Doorlooptijd:** ⚠️ TE VERIFIËREN. De copy belooft "in minuten" *(`components/LandingPage.tsx`)*, maar de feitelijke gebruikerstijd door 6 stappen is niet in de repo gemeten. Per-actie wachttijden (beeld/beweging/voice) zijn er wel: beweging draait op Seedance Lite (5s-clips) en wordt asynchroon gepolld.

---

## 4. Belangrijkste features en het probleem dat ze oplossen

| Feature | Wat het doet | Probleem dat het oplost | Bron |
|---|---|---|---|
| **AI-script (GPT-4o)** | Schrijft scene-voor-scene script uit een idee/brief | Ondernemer kan niet/wil geen script schrijven | `app/api/generate-script/route.ts` |
| **AI-beeld per scene** | Genereert per scene een illustratie in gekozen stijl | Geen designer of stockbeeld nodig | `app/api/generate-image/route.ts`, `lib/image-gen.ts` |
| **Beweging (image-to-video)** | Maakt stilstaand beeld bewegend | Echte animatie laten maken is duur/traag | `app/api/generate-motion/route.ts` |
| **Voice-over (AI-stemmen)** | Spreekt het script in, meerdere talen/stemmen | Geen voice-acteur of opnameapparatuur nodig | `app/api/generate-voice/route.ts` |
| **Editor + export** | Monteert clips, stem, muziek, overgangen → MP4 | Geen videobewerkingssoftware/skills nodig | `app/api/export/route.ts` |
| **Creator Studio** | Stijl- én karakterreferentie eenmalig instellen, daarna consistent in álle scenes | Beelden zien er anders uit per scene; personage verandert steeds | `components/studio/`, `lib/image-gen.ts` |
| **Huisstijlen (brand kits)** | Kleuren, fonts, logo, tone-of-voice in alle generaties | Output sluit niet aan op de merkstijl | `app/(app)/brand/`, `lib/types.ts` (BrandKit) |
| **Personages** | Herbruikbare karakter-referenties (beeld + beschrijving) | Steeds opnieuw hetzelfde personage moeten beschrijven | `app/(app)/characters/`, `lib/character-describe.ts` |
| **Inpaint / Upscale** | Deel van een beeld bijwerken; resolutie 2× verhogen | Eén foutje betekent niet het hele beeld opnieuw | `app/api/inpaint-image/route.ts`, `app/api/upscale-image/route.ts` |
| **Foto-modus** | Eigen foto's → bewegende video | Gebruiker heeft al beeldmateriaal | `components/wizard/StepFreeImages.tsx` |
| **Text-to-Video (T2V)** | Idee → één directe videoclip | Snel één korte clip zonder storyboard | `app/api/generate-t2v/route.ts` |
| **Playground** | Vrije beeldgeneratie-canvas, varianten, "ingrediënten" pinnen, daarna monteren | Experimenteren los van de wizard | `app/(app)/playground/` |
| **Infographics** *(prototype)* | Brontekst/PDF → datavisualisatie of story-infographic met scherpe tekst/cijfers | Cijfers/teksten in AI-beeld zijn altijd verhaspeld | `lib/infographics/`, `components/infographics/` |
| **Explainer** *(prototype)* | Platte, icoon-gedreven uitlegvideo's (geen personages) | Snelle, schone B2B-uitleg zonder character-animatie | `lib/explainer/`, `components/explainer/` |

---

## 5. Wat maakt het anders

Het echte onderscheidende punt zit in twee dingen:

1. **Consistentie via referentiebeelden (Creator Studio).** Je uploadt één keer een stijl- en een karakterreferentie; die worden bij elke scene-generatie meegestuurd, zodat het personage en de look gelijk blijven door de hele video. Het beeldmodel krijgt expliciet de instructie om alléén de identiteit (gezicht, haar, bouw) over te nemen, niet de tekenstijl. *(`lib/image-gen.ts`; `components/studio/`)*

2. **Tekst nooit door het AI-beeldmodel laten zetten.** In de infographics- en explainer-modus genereert het beeldmodel alleen platte illustraties met de uitdrukkelijke instructie "geen tekst, cijfers of letters", en wordt alle typografie er daarna scherp en correct in SVG overheen gelegd. Dat omzeilt de bekende AI-zwakte van verhaspelde tekst. *(`lib/infographics/story-style.ts`; `lib/explainer/build-prompt.ts`)*

Daarnaast: een geleide flow specifiek voor niet-videomakers, volledig in het
Nederlands, met een ingebouwde cursus.

> ⚠️ Let op: claims als "uniek" niet hard maken zonder concurrentievergelijking;
> die zit niet in de repo.

---

## 6. Typisch eindresultaat voor een MKB'er

Een korte animatie-/uitlegvideo van enkele scenes, in 16:9 of 9:16, met
voice-over. Concrete voorbeeldtypes die de software zelf aanbiedt
*(`app/(app)/studio/new/CreateForm.tsx`)*:
- **Uitlegvideo** van een dienst/product
- **Productdemo** (hook → drie kernfeatures in actie)
- **Klantverhaal** (situatie voor/na)
- **Recruitmentvideo** voor een vacature

**Doorlooptijd:** ⚠️ ONBEKEND/TE VERIFIËREN — niet gemeten in de repo. Gebruik in
content liever "in een paar stappen" of vraag Sam om een eerlijk richtgetal.

---

## 7. Voor wie is het bedoeld

Expliciet benoemd: **kleine ondernemers en cursusmakers die snel een eigen
uitlegvideo willen zonder editor-skills.** *(`AFSTUDEERVERSLAG-PROJECTGESCHIEDENIS.md`, regel 36)*

Doelgroep-hints uit placeholders en voorbeelden *(`CreateForm.tsx`, `LandingPage.tsx`)*:
- ZZP'ers en ZZP-coaches ("ZZP-coaches die meer klanten willen")
- MKB-ondernemers ("een gestreste ondernemer in de 40")
- Lokale diensten (sportschool in Amsterdam), hospitality (restaurant), consumentenproducten (zonnepanelen), software (boekhoud-app)

Realistische use-cases per type:
- **Dienstverlener/ZZP:** uitlegvideo "hoe werkt mijn dienst" voor de website.
- **Productbedrijf:** productdemo voor social/sales.
- **Werkgever:** recruitmentvideo voor een vacature.
- **Cursusmaker:** lesmateriaal/uitleg.
- **B2B/logistiek:** explainer (het meegeleverde voorbeeld is "CargoView", supply-chain tracking). *(`lib/explainer/spec.ts`)*

---

## 8. De cursus ("Leren")

- **Vorm:** ingebouwde e-learning onder `/leren`: videolessen (Dailymotion-embeds), met voortgangstracking ("✓ Gezien", "X van Y lessen afgerond"). *(`app/(app)/leren/page.tsx`)*
- **Indeling:** twee categorieën — **Brand setup** ("Personages en huisstijl klaarzetten") en **Tools** ("Video's maken in de Wizard, Studio en Playground"). *(`app/(app)/leren/page.tsx`)*
- **Omvang:** git-historie vermeldt de introductie van "7 trainingsvideo's" (commit 946192c, 27 mei 2026).
- **Toegang:** zichtbaar voor ingelogde gebruikers; klanten die de cursus apart kochten kunnen de gratis e-learning verborgen krijgen (`hide_leren`). *(`supabase/migrations/026_hide_leren.sql`)*
- **Verkoop:** als los aanbod via unieke betaallink: **eerste maand €1, daarna €49/maand**. *(`app/(app)/admin/cursus-link/page.tsx`; `app/checkout/cursus/[id]/page.tsx`)*

> ⚠️ ONBEKEND: de exacte lestitels en lesinhoud staan **niet in de repo** maar in
> de Supabase-productiedatabase (tabel `lessons`). Vraag Sam om de actuele
> lessenlijst als je daar content over wilt maken.

---

## 9. Verdienmodel en prijzen

**Abonnementen** *(`components/PricingCards.tsx`; `app/(app)/pricing/page.tsx`; `lib/credits.ts`)*:

| Plan | Prijs (excl. btw) | Credits/maand | Watermerk | Export | Support |
|---|---|---|---|---|---|
| Gratis | €0 | 100 | ja | 720p | — |
| Starter | €49/m | 500 | nee | 1080p | e-mail |
| Pro (meest gekozen) | €99/m | 1.500 | nee | 1080p HD | prioriteit |
| Agency | €249/m | 5.000 | nee | 1080p HD max | dedicated |

**Credits per actie** *(`lib/credits.ts`, CREDIT_COSTS)*:
- Script genereren: **1** · Beeld: **2** · Voice-over: **4** · Upscale: **2** · Inpaint: **2** · Beweging (video): **10**

**Instapaanbiedingen (€1):** drie funnels die na de proef doorlopen naar Starter (€49/m):
- 7-dagen proef voor €1 *(`app/checkout/trial/`)*
- Webinar-aanbod: eerste maand €1 *(`app/checkout/webinar/`)*
- Cursus-aanbod: eerste maand €1 *(`app/checkout/cursus/[id]/`)*

**Jaarlijks:** "Bespaar 20% — neem contact op." *(`app/(app)/pricing/page.tsx`)*
**Betaling:** Mollie (iDEAL/SEPA), maandelijks opzegbaar, automatische incasso. *(`app/api/mollie/*`)*

> ⚠️ Het exacte jaarbedrag en het refundbeleid staan niet in de code.
> ⚠️ TE VERIFIËREN: de pricing-pagina noemt het mailadres `info@jouwanimatievideo.ai`
> (.ai), terwijl het bedrijf elders `jouwanimatievideo.nl` gebruikt. Mogelijk een
> inconsistentie.

---

## 10. Onder de motorkap (voor "AI demystificeren"-content)

**Wat de code feitelijk gebruikt** *(`app/api/**`, `lib/**`, `package.json`)*:
- **Script/tekst:** OpenAI **GPT-4o** (en GPT-4o-mini voor lichtere taken). *(`app/api/generate-script/route.ts` e.a.)*
- **Beeld (primair):** **Nano Banana** via fal.ai (`fal-ai/nano-banana` + `/edit`). *(`lib/image-gen.ts`)* In interne docs "Nano Banana Pro" genoemd. ⚠️ TE VERIFIËREN of de slug `nano-banana` of een "pro"-variant is.
- **Beweging (primair):** **Seedance Lite** image-to-video (`fal-ai/bytedance/seedance/v1/lite/image-to-video`), 5s-clips. T2V via de text-to-video-variant. *(`app/api/generate-motion/route.ts`, `app/api/generate-t2v/route.ts`)*
- **Voice:** **ElevenLabs** via fal.ai (TTS); ⚠️ exacte modelversie (`eleven-v3` vs `multilingual-v2`) in code TE VERIFIËREN. Whisper voor uitlijning. *(`app/api/generate-voice/route.ts`)*
- **Inpaint:** Flux Pro Fill. **Upscale:** Clarity Upscaler. *(`app/api/inpaint-image`, `app/api/upscale-image`)*
- **Legacy (alleen nog polling, niet meer ingezet):** Kling 1.6, Seedance Pro, Runway. *(`app/api/runway-status/route.ts`)*

**De tekst-in-beeld-zwakte, hoe opgelost:**
- Beeldmodellen krijgen expliciet "GEEN tekst/cijfers/letters/labels" mee; tekst wordt deterministisch in **SVG** over de illustratie gelegd (infographics én explainer). *(`lib/infographics/story-style.ts`, `lib/explainer/build-prompt.ts`)*
- In gewone scenes staat een "visual rules"-regel in de scriptprompt: geen tekst/borden, max 2 handen per persoon, geen extra ledematen. *(`app/api/generate-script/route.ts`)*
- Bij beweging (recent) wordt de camera vastgezet (`camera_fixed`) en een strikte "verzin niets bij"-regel meegegeven, zodat bestaande grafieken/teksten niet worden hertekend. *(`app/api/infographics/scene-motion/route.ts`, `lib/infographics/motion-prompt.ts`)*

**Rendering/export:**
- Hoofdvideo: server-side **ffmpeg** (clips trimmen → overgangen via xfade/concat → audio mixen → MP4), kwaliteit per plan. *(`app/api/export/route.ts`)*
- Infographics/explainer: **Playwright** maakt frame-voor-frame screenshots van een in-app renderpagina, daarna ffmpeg → MP4. *(`app/api/infographics/export-video/route.ts`)*

> ‼️ **Grote discrepantie tussen copy en code.** De landingspagina noemt
> "GPT-4", "Flux & Recraft" (beeld) en "Kling" (beweging). *(`components/LandingPage.tsx`)*
> De code gebruikt feitelijk **GPT-4o**, **Nano Banana** (beeld) en **Seedance
> Lite** (beweging); Flux/Recraft/Kling zijn legacy of alleen voor inpaint. Voor
> geloofwaardige "onder de motorkap"-content: ga uit van de code, niet de copy.
> Overweeg Sam te adviseren de landingspagina-copy bij te werken.

---

## 11. Beperkingen (voor eerlijke bezwaar-content)

- **Beweging is een kansspel.** Image-to-video kan soms ongewenste dingen bijverzinnen; daarom zijn er recent een "verzin niets bij"-regel, vaste camera en handmatige bijsturing per scene toegevoegd. 100% garantie is er niet. *(`lib/infographics/motion-prompt.ts`)*
- **Clips zijn kort** (Seedance Lite ~5s per scene). *(`app/api/generate-motion/route.ts`)*
- **Gratis plan:** 720p mét watermerk. *(`app/api/export/route.ts`)*
- **Infographics en Explainer zijn nog niet live.** Volledig gebouwd, maar niet gecommit/gedeployed; de bijbehorende DB-migraties (028/029) moeten nog/net op de cloud-database. *(git-historie; commit 9897a96 verwijderde voortijdige verwijzingen om de build te repareren)*
- **Premium Editor** (`/editor`) is gebouwd maar gated (allowlist). *(`supabase/migrations/027_editor_projects.sql`)*
- **Alleen Nederlands** als UI-taal; voice-over ondersteunt wel meerdere talen. ⚠️ exacte talenlijst TE VERIFIËREN in de voice-route.
- **Doorlooptijd/kwaliteitsclaims** zijn niet gemeten (zie sectie 12).

---

## 12. Echte gebruiks- of resultaatcijfers

**Geen.** In de repo staan **geen** echte gebruiks-, conversie-, render- of
tevredenheidscijfers (geen analytics, geen MAU, geen succespercentages).

Wel feitelijk aanwezig, maar dat zijn **geen prestatiecijfers**:
- Credits per actie en credits per plan (sectie 9). *(`lib/credits.ts`)*
- Geschatte API-kostprijzen als comment (bijv. "Seedance Lite 5s 720p ~$0,18") — dit zijn aannames in commentaar, geen meetdata. *(`lib/credits.ts`)*

> Gebruik dus **geen** harde resultaatcijfers in content tenzij Sam ze los
> aanlevert. Verzin niets.

---

## 13. Toon en positionering (uit de bestaande copy)

- **Aanspreekvorm:** informeel, "jij" (geen "u"). *(`components/LandingPage.tsx`)*
- **Kernbelofte:** "Maak professionele animatievideo's in minuten" + "Geen video-ervaring nodig". *(`components/LandingPage.tsx`)*
- **Terugkerende thema's:** automatisch ("AI doet de rest"), toegankelijk (geen skills nodig), snel, laagdrempelig starten ("Gratis beginnen. Geen creditcard nodig.").
- **Drie-stappen-frame in de copy:** "Beschrijf je idee → AI doet de rest → Download & deel." *(`components/LandingPage.tsx`)*
- **CTA-ladder:** "Begin gratis →", "Maak gratis een account aan →", "Upgrade nu →".
- **Positionering:** empowerment voor niet-makers; transparant credits-/kostenmodel; merkconsistentie als pro-feature.

---

## 14. Open vragen voor de oprichter (Sam)

1. **Copy vs. werkelijkheid:** de landingspagina noemt Kling/Flux/Recraft/GPT-4, maar de code gebruikt Seedance Lite/Nano Banana/GPT-4o. Welke wil je in content noemen? (Advies: code volgen, copy updaten.)
2. **Doorlooptijd:** hoe lang doet een gebruiker realistisch over één video? Geen meetdata in de repo.
3. **Echte cijfers:** zijn er gebruikers-/resultaatcijfers (aantal video's, klanten, tevredenheid) die we mogen gebruiken? Niets vindbaar in de repo.
4. **Cursusinhoud:** wat zijn de exacte lessen/titels? Die staan in de productie-DB, niet in code.
5. **Status infographics & explainer:** wel of niet noemen in content? Ze zijn gebouwd maar nog niet live.
6. **Nano Banana "Pro" vs gewoon:** welke variant draait er precies, en mag de naam (Google Gemini-beeldmodel) extern genoemd worden?
7. **Voice-modelversie en talen:** welke ElevenLabs-versie en welke talen ondersteun je officieel?
8. **Mailadres/merk:** is het `.nl` of `.ai`? De pricing-pagina gebruikt `.ai`.
9. **Concurrentiepositionering:** waartegen positioneer je (Synthesia, Pictory, Canva, een videobureau)? Niet af te leiden uit de repo.
10. **Doelgroepfocus:** is de primaire klant de losse MKB'er, of vooral cursus-/webinar-leads (gezien de €1-funnels)?

---

### Bronbestanden (kern)
- `AFSTUDEERVERSLAG-PROJECTGESCHIEDENIS.md` — projectoverzicht en doelgroep
- `components/LandingPage.tsx`, `components/PricingCards.tsx` — copy en prijzen
- `lib/credits.ts` — credits en kosten per actie
- `lib/types.ts` — datamodel, modi, specs
- `lib/image-gen.ts`, `app/api/generate-script|generate-image|generate-motion|generate-voice/route.ts` — AI-modellen
- `app/api/export/route.ts` — videomontage en kwaliteit per plan
- `lib/infographics/`, `lib/explainer/` — tekst-in-SVG-aanpak
- `app/(app)/leren/`, `supabase/migrations/024-026_*.sql` — cursus
- `app/api/mollie/*`, `app/checkout/*` — verdienmodel
- `git log` — evolutie (eerste commit 14 april 2026; ~93 commits)
