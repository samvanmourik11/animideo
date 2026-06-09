# JouwAnimatieVideo A.I. — Projectgeschiedenis

**Bewijsstuk afstudeerverslag**
Auteur: Sam van Mourik
Domeinnaam: jouwanimatievideo.nl
Projectmap: `~/animatie-saas/animideo`
Datum opgesteld: 24 mei 2026

Dit document beschrijft de volledige ontwikkelgeschiedenis van het softwareproduct **JouwAnimatieVideo A.I.** (oorspronkelijk Animideo), vanaf het eerste idee tot en met de actuele versie. De chronologie is opgebouwd uit het Git versiebeheer van het project (70 commits) en de bijbehorende Supabase database-migraties (19 stuks). Alle data en tijdstippen zijn afkomstig uit Git en zijn dus controleerbaar via `git log` in de projectmap.

---

## 1. Wat is JouwAnimatieVideo A.I.?

JouwAnimatieVideo A.I. is een SaaS webapplicatie waarmee gebruikers via een geleide flow korte animatievideo's kunnen genereren met behulp van generatieve A.I.. De gebruiker voert een idee in, het systeem genereert automatisch een script, beelden, voice-over en bewegende clips, en exporteert het geheel als MP4.

**Drie hoofdmodi:**
1. **Wizard (6 stappen):** Setup → Script → Beelden → Beweging → Audio → Editor.
2. **Foto-modus:** Eigen foto's worden via A.I. stylisch getransformeerd en geanimeerd.
3. **Creator Studio:** Geavanceerde modus waarin een stijl- en karakter-referentie eenmalig wordt geüpload en bij elke scène wordt meegestuurd, zodat het beeld door de hele video consistent blijft.

**Technische stack:**
- Front- en backend: Next.js 16 (App Router), TypeScript, Tailwind CSS.
- Authenticatie en database: Supabase (Postgres + Storage).
- Generatieve A.I.: GPT-4o voor scripts, DALL·E 3, Flux Schnell/Pro Ultra, Recraft v3, Seedream, Nano Banana Pro voor beelden, Kling 1.6 Pro en Runway Gen-3 Alpha voor video, ElevenLabs (via fal.ai) voor stem.
- Canvas-editor: Fabric.js v7.
- Audio-waveform: wavesurfer.js v7.
- MP4-export in browser: @ffmpeg/ffmpeg v0.12 (vereist COOP/COEP headers).
- Betalingen: Mollie (Ideal, SEPA, abonnementen).
- Hosting: Vercel.

---

## 2. Ideefase, vóór 14 april 2026

In de week voorafgaand aan de eerste commit is het idee geconcretiseerd. De aanleiding was dat bestaande animatievideo-tools (zoals Synthesia, InVideo, Pictory) voor de Nederlandse markt te generiek, te duur en niet creatief genoeg waren. De doelgroep, kleine ondernemers en cursusmakers, wil snel een eigen uitlegvideo zonder editor-skills. Het concept "voer een idee in, krijg een complete animatievideo terug" werd uitgewerkt tot een 5-staps wizard. De domeinnaam **jouwanimatievideo.nl** was reeds in bezit, de werknaam voor de software werd **Animideo** (later hernoemd naar JouwAnimatieVideo A.I.).

De Mac-projectmap `~/animatie-saas/animideo` is aangemaakt op **13 april 2026, 19:21 uur** (volgens `stat` op de map). De daadwerkelijke ontwikkeling begint één dag later met de eerste commit.

---

## 3. Chronologisch overzicht per fase

Iedere regel hieronder verwijst naar een echte commit in het versiebeheer. Het korte hash-nummer staat tussen haakjes, zodat de commit op te zoeken is met `git show <hash>`.

### Fase 1, MVP-fundering, 14 april 2026

**14 april 2026, 16:18 (913d095) — Initial commit.**
Eerste versie van het project. Next.js 16 skeleton, Supabase auth en database, basis 6-staps wizard, Tailwind styling, basis project-CRUD.

**14 april 2026, 21:50 (599f41a, 96906e4) — Creditsysteem en Mollie betalingen.**
Toevoeging van een creditsmodel (1 credit = 1 actie), een prijzenpagina, en integratie met Mollie voor losse betalingen en abonnementen (Free, Starter, Pro).

**14 april 2026, 22:02 (210c954) — Dark navy redesign.**
Volledige UI-herziening naar een premium 2026-stijl: donkere navy achtergrond, sterke contrast-accenten.

**14 april 2026, 22:31 (930a6e6) — Zes bugfixes in één pass.**
Donkere script-editor, automatische credits-refresh, juiste email redirect-URL, 100 gratis startcredits, automatische outro-scene en watermerk-overlay voor het Free plan.

**14 april 2026, 22:39 (9044ffb) — Mollie SEPA webhook fix.**
Bij SEPA-betalingen kwam het mandaat niet altijd op de payment terug. Oplossing: mandaat ophalen via de klant.

**14 april 2026, 23:44 (a32f0c4) — Wachtwoord zichtbaarheid en email-redirect.**
Toggle voor wachtwoord-veld op login en signup, redirect-URL na bevestiging gecorrigeerd.

**14 april 2026, 23:45 (938c953) — Mollie omschrijving uitgebreid.**
"maandelijks abonnement" toegevoegd aan Mollie betaalomschrijving voor herkenbaarheid op bankafschrift.

**14 april 2026, 23:55 (29c1fb5) — Auto-recovery Mollie klant-modus.**
Mollie keys voor test en live geven verschillende klanten. Bij wisseling werd een fresh customer aangemaakt om de fout op te lossen.

### Fase 2, Betalingen polijsten en landingspagina, 15 april 2026

**15 april 2026, 00:25 (cc36a1c) — Abonnement upgrade flow.**
Bij plan-wissel wordt eerst het bestaande abonnement geannuleerd voor de nieuwe wordt aangemaakt.

**15 april 2026, 00:28 (a8c217c) — Meerdere actieve abonnementen blokkeren.**
Alle actieve Mollie-abonnementen worden geannuleerd vóór een nieuwe wordt aangemaakt.

**15 april 2026, 00:38 (f5d2865) — Prijzenpagina UX.**
Pro plan als "uitgelicht", slimme upgrade- en downgrade-labels, instant credits-refresh.

**15 april 2026, 00:42 (f0b9a73) — Downgrade-flow zonder checkout.**
Downgrade gebruikt het bestaande mandaat. Free plan-knop kreeg het juiste label.

**15 april 2026, 00:51 (4f0ced1) — Credits-beleid bij plan-wissel.**
Bij downgrade blijven credits behouden. Alleen bij upgrade of verlenging worden nieuwe credits toegekend.

**15 april 2026, 01:11 (b57965f) — GPT-4o max_tokens.**
Te kort token-limiet veroorzaakte afgebroken JSON in script-generatie. Limiet verhoogd.

**15 april 2026, 01:34 (deeaf04) — Watermerk en xfade-transities.**
Watermerk gecentreerd en hernoemd naar jouwanimatievideo.nl, fluweelzachte crossfades tussen scènes in de MP4-export.

**15 april 2026, 01:42 (610fe0c) — Landingspagina met conversie-focus.**
Idea-input-balk op de homepage; gebruiker typt zijn idee, A.I. genereert een voorbeeld-script en haalt deze door naar de signup.

**15 april 2026, 01:54 (be4c681) — Aparte HTML voor jouwanimatievideo.nl.**
Statische landingspagina, met URL-parameter waarmee het idee bij signup direct meegestuurd wordt.

**15 april 2026, 02:11 (5a6229c) — /try demo-pagina.**
Probeer-versie zonder account, met CTA naar signup.

**15 april 2026, 02:35 (0065f79) — Interne accounts unlimited + mobiele landing.**
Eigen accounts kregen onbeperkte credits voor demo-doeleinden. Landing-page volledig mobiel responsive.

**15 april 2026, 02:48 (0cdb24e) — Pay-first guest checkout.**
Gebruikers konden eerst betalen, daarna pas een account aanmaken.

**15 april 2026, 02:53 (395740f) — Webhook fix.**
Volgorde van Supabase-declaratie gecorrigeerd in webhook-route.

**15 april 2026, 03:00 (4010efc) — SharedArrayBuffer fix.**
COOP/COEP headers toegevoegd via `vercel.json` zodat de in-browser ffmpeg export werkt. Vriendelijke foutmelding voor iOS (waar SharedArrayBuffer beperkt is).

**15 april 2026, 03:15 (71445db) — Mobiele navigatie.**
Hamburger-menu, full-screen overlay, mobile padding op checkout.

**15 april 2026, 03:26 (e0511b0) — Watermerk op alle gratis previews.**
Canvas-based watermerk gegarandeerd zichtbaar in elke preview voor Free-gebruikers.

### Fase 3, Grote feature-uitbouw, 16 en 17 april 2026

**16 april 2026, 13:39 (467dc9e) — Grote release.**
Flux Schnell als nieuw beeldmodel via fal.ai, Runway integratie voor video, brand kits (logo, kleuren, lettertype), Free Mode, een palet aan visuele stijlen, geavanceerde scriptopties.

**16 april 2026, 14:01 (5e4062b) — Proxy-route.**
Eerste oplossing voor Unauthorized-fout bij beeldgeneratie.

**16 april 2026, 14:09 (d924971) — Bearer-token meesturen vanaf client.**
Echte oplossing voor de Unauthorized-fout.

**16 april 2026, 15:29 (45529e8) — Duidelijkere foutmelding.**
Onderscheid tussen auth-fouten en fal-fouten in de melding.

**16 april 2026, 16:40 (a59b0de) — Runway-fout duidelijker.**
Echte foutreden van Runway in plaats van generieke melding.

**16 april 2026, 16:48 (4f7bca6) — Runway base64 i.p.v. Supabase URL.**
Tijdelijke fix voor Runway authenticatie-issues.

**16 april 2026, 17:11 (9fe6164) — Runway signed URL + prompt-truncation + bearer-token.**
Definitieve oplossing: signed URLs naar Supabase Storage, prompt wordt afgekapt op limiet.

**16 april 2026, 22:26 (4310edb) — Foto-animatie feature.**
Compleet nieuwe wizard: eigen foto uploaden → A.I. stijltransformatie → motion. Compleet apart spoor naast de script-wizard.

**16 april 2026, 23:16 (0cab833) — Foto-wizard fixes.**
Transform-resultaten worden gepersisteerd, scènes worden doorgegeven aan motion-stap.

**16 april 2026, 23:20 (6f365fd) — Slimmere motion-prompts.**
A.I. genereert nu scène-bewuste motion-prompts in plaats van generieke. Gebruiker kan ze in stap 2 nog aanpassen.

**16 april 2026, 23:30 (97c657e) — Drie beeldmodellen kiesbaar.**
Flux Schnell, Flux Pro Ultra, DALL·E 3 als opties.

**16 april 2026, 23:36 (c307916) — Beeldmodel-selectie ook in foto-wizard.**

**16 april 2026, 23:41 (5c9154c) — Switch naar Kling 1.6 Pro.**
Runway vervangen door Kling 1.6 Pro voor betere kwaliteit en lagere kosten per clip.

**16 april 2026, 23:50 (4ac536e) — Compositie-regels en bewerkbare transform-prompt.**

**16 april 2026, 23:53 (6a8657c) — Cache-busting na retransform.**

**16 april 2026, 23:57 (af58bdd) — Audio-stap met keuze.**
Automatische voice-over verwijderd, nieuwe aparte audio-stap waarin gebruiker kiest tussen voice-over en muziek.

**17 april 2026, 00:08 (e974021) — ControlNet als vierde transform-model.**

**17 april 2026, 00:16 (b6e14c9) — Recraft v3 als vijfde beeldmodel.**

**17 april 2026, 00:25 (c9aaf02) — Video-model-selector.**
In motion-stap kan gebruiker kiezen tussen beschikbare video-modellen.

**17 april 2026, 00:28 (7c0e7f1) — Editor preview vult de ruimte.**

**17 april 2026, 00:32 (f174c02) — Eerste videoframe in editor preview.**

**17 april 2026, 00:34 (037ebb4) — Video-opacity fix.**

**17 april 2026, 00:37 (6c83407) — Muted via DOM ref.**
Forceert autoplay van preview-video's in Chrome en Safari.

### Fase 4, Fine-tuning sprint, 20 april 2026

**20 april 2026, 21:21 (fc39b21) — Grote sprint-release.**
Vier features tegelijk: inpainting (masker tekenen + prompt voor dat gebied via Flux Fill), upscale (Clarity Upscaler 2× via fal.ai), de t2v wizard (puur tekst-naar-video flow), account-pagina's voor profiel- en abonnementbeheer, en alle stijlen ook beschikbaar in de foto-wizard.

### Fase 5, Cursus-integratie, 23 april en 6 mei 2026

**23 april 2026, 10:25 (1a98518) — Mollie checkout-omschrijving.**
Toont weer "Animideo" in plaats van "JouwAnimatieVideo" voor herkenbaarheid op bankafschrift.

**6 mei 2026, 12:00 (0c0de75) — Cursus-betaallink.**
Speciale flow: eerste maand €1, daarna €49 per maand. Bedoeld voor cursus-aanmelders.

### Fase 6, Karakter Studio (later Creator Studio), 8 mei 2026

**8 mei 2026, 12:01 (7079648) — Karakter Studio (admin-only beta).**
Volledig nieuwe studio-modus, geïntegreerd met Nano Banana Pro via fal.ai. Gebruiker uploadt eenmalig een stijl-referentie en karakter-referentie. Deze worden bij elke scène-generatie meegestuurd, waardoor karakters en stijl door de hele video consistent blijven. Migratie 015_studio_mode.sql.

**8 mei 2026, 12:23 (67717a4) — Voice-over via fal.ai.**
Alle wizards (klassiek en studio) gebruiken nu fal.ai voor voice-over, geen aparte ElevenLabs-account meer nodig.

**8 mei 2026, 12:29 (f180fce) — Upgrade naar ElevenLabs v3.**
Hoogste kwaliteit Nederlandse stem.

**8 mei 2026, 12:39 (fe8927b) — Audio storage policies.**
UPDATE en DELETE policies toegevoegd aan de audio-bucket in Supabase. Migratie 016.

**8 mei 2026, 13:18 (768ed65) — Persistentie en polling fixes.**
Beelden bleven niet altijd staan na navigeren tussen stappen. Motion-polling fouten worden correct afgehandeld.

**8 mei 2026, 13:36 (be18d34) — scenesRef race-condition.**
Bij batch-generatie van scènes ontstond een race op de scènes-referentie. Tegelijk: meer variatie per scène afgedwongen in de prompts.

**8 mei 2026, 13:47 (14c4aa3) — App-brede auto-save.**
Alle wizards en de studio krijgen automatische opslag van projectstatus als veiligheidsnet.

**8 mei 2026, 14:29 (f2f7acf) — scenesRef race fix #3.**
Derde patch op dezelfde race-condition in StudioStepImages.

**8 mei 2026, 14:44 (27a42dc) — Audit-pass.**
Grondige doorlichting: meerdere race-conditions en silent failures geadresseerd in één commit.

### Fase 7, Brand kit in script en rebrand, 11 mei 2026

**11 mei 2026, 21:14 (8ea17db) — Brand kit en karakters in script-generatie.**
Brand kit (logo, kleuren, tone of voice) en karakters worden direct meegenomen in het GPT-4o script-prompt. Maximum aantal scènes verhoogd naar 15. PDF-upload toegevoegd als bronmateriaal (pdf-parse).

**11 mei 2026, 21:19 (9f8a74c) — Hernoeming naar Creator Studio.**
"Karakter Studio" wordt "Creator Studio", het beta-label is verwijderd.

**11 mei 2026, 23:17 (4ead7f1) — Rebrand Animideo → JouwAnimatieVideo A.I..**
Op de hele applicatie. De projectmap behoudt de oude naam `animideo` voor de continuïteit van het Git-history.

**11 mei 2026, 23:18 (99b9c69) — Migraties 017 outro en 018 characters in Git.**

### Fase 8, Openzetten voor publiek, 14 en 19 mei 2026

**14 mei 2026, 15:21 (e2f047c) — Creator Studio openzetten.**
Creator Studio niet langer admin-only, beschikbaar voor alle gebruikers.

**19 mei 2026, 19:02 (55777be) — Publieke webinar checkout-link.**
Speciale link, eerste maand €1, daarna €49/m, voor webinar-aanmelders.

**19 mei 2026, 21:28 (05b7074) — Characters API open.**
Het `/api/characters` endpoint was nog admin-only, waardoor de karakter-feature in de studio effectief alleen voor admins werkte. Vanaf nu beschikbaar voor alle ingelogde gebruikers.

### Fase 9, Onboarding-polish en Playground, 21 mei 2026

**21 mei 2026, 21:40 (d4ece11) — Signup verbeterd.**
Detecteert al bestaande accounts en biedt een "verstuur bevestigingsmail opnieuw"-knop.

**21 mei 2026, 21:57 (db89a83) — Support-formulier.**
Ingelogde klanten kunnen direct vanuit de app een supportvraag versturen.

**21 mei 2026, 23:08 (4a04284) — Playground fase 1.**
Vrije Flow-lus voor beelden, gebruiker kan los van de wizard beelden genereren en op elkaar voortborduren. Migratie 019_playground.sql.

**21 mei 2026, 23:28 (8f58625) — Playground fase 2.**
Gereedschap per beeld (inpaint, upscale, motion), "ingrediënten"-systeem voor referenties.

---

## 4. Database-migraties

Het database-schema is iteratief opgebouwd. Iedere migratie is een SQL-bestand in `supabase/migrations/`. De volgorde reflecteert het ontwikkelpad:

| Nr | Bestand | Functie |
|----|---------|---------|
| 001 | `001_projects.sql` | Project-tabel met scènes en eigenaar |
| 002 | `002_storage.sql` | Supabase Storage buckets (beelden, video, audio) |
| 003 | `003_rebuild.sql` | Schema-herbouw na MVP-leerpunten |
| 004 | `004_credits_and_billing.sql` | Creditsmodel, abonnementen, Mollie koppeling |
| 005 | `005_pending_checkouts.sql` | Pay-first guest checkout-flow |
| 006 | `006_free_mode.sql` | Watermerk en Free-plan beperkingen |
| 007 | `007_brand_kits.sql` | Brand kits (logo, kleuren, lettertypes) |
| 008 | `008_visual_styles.sql` | Voorgedefinieerde visuele stijlen |
| 009 | `009_photo_mode.sql` | Foto-wizard kolommen |
| 010 | `010_image_model.sql` | Selectie tussen beeldmodellen |
| 011 | `011_profile_name.sql` | Profielnaam-veld |
| 012 | `012_video_model.sql` | Selectie tussen videomodellen |
| 013 | `013_mode_t2v.sql` | Tekst-naar-video modus |
| 014 | `014_cursus_admin.sql` | Cursus-betaallink en admin-vlag |
| 015 | `015_studio_mode.sql` | Creator Studio velden (style ref, character refs) |
| 016 | `016_audio_update_policy.sql` | Audio bucket UPDATE/DELETE policies |
| 017 | `017_studio_outro.sql` | Outro-scène in studio |
| 018 | `018_characters.sql` | Karakters-tabel voor herbruikbare personages |
| 019 | `019_playground.sql` | Playground-modus, los van wizard |

---

## 5. Eindstand op 24 mei 2026

**Functionaliteit:**
- 5 projectmodi: Wizard (6 stappen), Free, Photo, Tekst-naar-video, Creator Studio, plus de losse Playground.
- 5 beeldmodellen, 3 videomodellen, ElevenLabs v3 voice-over.
- Inpainting met masker-tekenen, 2× upscale.
- Karakters en stijl-referenties voor consistente video's.
- Brand kits met logo, kleuren, lettertype, tone of voice.
- PDF-upload als bronmateriaal voor script-generatie.
- Mollie betalingen: losse credits, abonnementen, cursus-flow, webinar-flow.
- MP4-export volledig in de browser via ffmpeg, met xfade-transities en watermerk voor Free-plan.
- Mobiel responsive, met dedicated mobile-nav.

**Codebase:**
- 70 commits over een periode van iets meer dan vijf weken (14 april 2026 t/m 21 mei 2026).
- 19 database-migraties.
- Stack: Next.js 16, TypeScript, Tailwind, Supabase, Vercel, Mollie, fal.ai, OpenAI, ElevenLabs, Fabric.js, ffmpeg.

---

## 6. Reflectie

Het project is in een hoog tempo opgebouwd. De combinatie van Next.js, Supabase en fal.ai maakte het mogelijk om in vijf weken van eerste commit naar een product te komen dat meerdere modi, meerdere beeld- en videomodellen, een eigen editor, een eigen exporteur en een werkend betalingsmodel bevat. De grootste leerpunten waren:

1. **Race-conditions bij batch-generatie.** Drie aparte commits waren nodig om de scènes-referentie-race volledig op te lossen. Hieruit volgt het principe dat React state alleen niet voldoende is voor parallelle externe calls; refs met locking zijn nodig.
2. **Voice-over via fal.ai in plaats van directe ElevenLabs.** Een aparte ElevenLabs Pro-account bleek niet nodig dankzij fal.ai's routing, wat zowel de complexiteit als de kosten verlaagde.
3. **Karakter- en stijlconsistentie was de meest gevraagde feature.** Het hebben van een aparte Creator Studio-modus, los van de klassieke wizard, bleek nodig omdat één-pass script-generatie inherent geen visuele consistentie kan garanderen.
4. **Itereren met betaaldynamiek.** De Mollie-integratie vroeg veel iteraties (downgrade-flow, customer-mode mismatch, mandaat-ophaling) en is een goed voorbeeld van waarom abstractie van een externe partij nooit gratis is.

---

## 7. Bewijsbaarheid

Alle datums in dit document zijn ontleend aan het Git-versiebeheer van het project en zijn reproduceerbaar via:

```bash
cd ~/animatie-saas/animideo
git log --all --pretty=format:'%h %ai %s' --reverse
```

De Supabase-migraties zijn terug te vinden in `supabase/migrations/` en zijn genummerd in volgorde van toepassing.

— Einde document —
