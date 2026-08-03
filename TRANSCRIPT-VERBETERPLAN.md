# Verbeterplan & feature-inspiratie — JouwAnimatieVideo A.I.

**Bron:** 13 opgenomen onboarding- en demo-calls (juni–juli 2026, ~84k woorden), volledig
doorgelezen. **Insteek:** dit plan is bewust **additief** — de nadruk ligt op *nieuwe features
en kansen*, niet op wat kapot is. De bugs staan er wel in (sectie D), maar compacter.
**Aparte bijlage:** het software-concept met **Jeroen (Brand Happening)** staat los in
`JEROEN-BRANDHAPPENING-CONCEPT.md` (subtiele logo-animatie, herbruikbare beeldstijl, micro-
beweging op statisch beeld, animated social templates).

> Legenda effort: **S** klein · **M** middel · **L** groot. "×N" = in N aparte calls genoemd.

---

## A. Jouw eigen uitgesproken roadmap (beloftes in de calls)

Dit zijn dingen die je **zelf hardop belooft** tijdens gesprekken ("dat komt in een update",
"daar zijn we mee bezig"). Feitelijk je eigen roadmap — en tegelijk verwachtingen die klanten
nu hebben. Waard om expliciet bij te houden en af te vinken.

| Belofte | Aan wie | Quote |
|---|---|---|
| Grote update "maandag" | TapEnjoy | *"Maandag komt er weer een grote update op"* |
| Referentiefoto per scène (live genoteerd als to-do) | TapEnjoy | *"referentie afbeelding... Schrijf ik even op"* |
| Pro-beelden standaard, update "dit weekend" | ProCorrect | *"van het weekend komt een nieuwe update live"* |
| Voice cloning / eigen stem trainen uit opnames | ProCorrect | *"dat je je eigen stem binnen de app kan trainen"* |
| Muziekgeneratie ook in Creative Studio (weekend-update) | ProCorrect | *"dat zit in de update die dit weekend gaat komen"* |
| Meertaligheid, "zelfs Chinees" | Super50Carz | *"alle talen, daar zijn we nog bezig mee"* |
| Directe tekst-naar-video (nog niet) | ProCorrect | *"vanaf een tekst direct video... zover zijn we nog niet"* |
| Losse oude tools worden gebundeld/vervangen | ProCorrect | *"twee tools die worden vervangen door deze tool"* |
| Transparante-logo-verwerking verbeteren | NL Guts | *"transparante versie de volgende keer nodig"* |
| AI-buddy van beta naar volwaardig | NL Guts | *"is wel een beetje bèta nog"* |
| Opsomming-scenes (nieuw, groeit nog) | NL Guts | *"dit is ook nieuw, die opsomming scènes"* |
| Proactieve update-mail + persoonlijk uitleg-filmpje | ProCorrect | *"krijg je een mail... neem ik een filmpje voor je op"* |

**Aanbeveling:** maak hier een levende "beloofd → geleverd"-lijst van. Meertaligheid, voice
cloning en referentiefoto-per-scène kwamen in meerdere calls terug én zijn door jou beloofd —
die verdienen zichtbaar prioriteit omdat klanten er nu op wachten.

---

## B. Nieuwe features & kansen (de inspiratie)

### B1 — Merk-getrouwheid: referentie, assets & personages 🎯
De rode draad door bijna elke call: klanten willen dat de output hún échte merk/product toont.

- **🔴 Referentiefoto per scène/object uploaden** (×5: TapEnjoy, ProCorrect, Jeffrey, Thelma,
  impliciet Wim). Nu alleen globaal bij stap 1. *"Kan je ook een foto uploaden om een voorbeeld
  te geven?"* — en jij noteerde het zelf live. **Effort: M.** *(Bestaat al in Creator Studio →
  patroon doortrekken naar de per-scène generatie.)*
- **🟠 Herbruikbare merk-/asset-bibliotheek** die de AI standaard toepast: logo, werkkleding,
  productverpakking — zodat "onze fust", "onze machine" consistent terugkomt (TapEnjoy,
  Super50Carz, NL Guts). *"we hebben een hele andere fust"*. **Effort: M–L.**
- **🟠 Eigen personage/mascotte importeren** (×3: Wim, Thelma, Johan). *"Die heb ik zelf al.
  Kan ik die ook invoeren?"* + consistent inzetten over scènes (cross-project characters).
  **Effort: M–L.**
- **🟡 Automatische logo-extractie uit website/social** — nu een handmatige screenshot-work-
  around (Robert, Anita Blitz die geen website heeft). *"Ik heb net even je logo gescreenshot"*.
  **Effort: M.**
- **🟡 Exacte hex/kleurnummer-invoer** (Wim, Super50Carz). *"Ik heb kleurnummers die ik altijd
  gebruik"*. **Effort: S.**
- **🟡 Bibliotheek van herkenbare entiteiten** (bv. een Belastingdienst-brief) die AI niet zelf
  goed maakt — een curated referentieset (ProCorrect). **Effort: M.**

### B2 — Stem & taal
- **🔴 Voice cloning / eigen stem trainen uit meeting-opnames** (beloofd; ProCorrect, Super50Carz).
  Sterke differentiator. **Effort: L.**
- **🔴 Meertaligheid uitrollen** incl. Chinees (beloofd; Super50Carz). **Effort: L.**
- **🟠 Do-not-translate / merknaam-glossary + uitspraak-woordenlijst** (×3: Jeffrey "slimme
  duck", TapEnjoy, Super50Carz). Klein te bouwen, hoge polish-winst. **Effort: S–M.**
- **🟠 Talking-character / lip-sync op de voice-over als 1-klik** (Anita Blitz — pratende hond).
  Gecombineerd met meertaligheid een aansprekende additie. **Effort: L.**

### B3 — Creatie-workflow (van idee naar draaiboek)
- **🔴 Ingebouwde draaiboek-/storyboard-planner** — vervangt de externe-LLM-work-around die je
  nu aanraadt, én lost de idee-fase-lock-in op. Klant beseft het zelf: *"in de voorbereiding al
  een beeld hoe de scènes eruit zien"* (NL Guts). **Effort: M–L.**
- **🟠 Native ideation + PDF-/document-generatie in de app** — nu open je live ChatGPT/Claude
  ernaast (ProCorrect). *"daarvoor open ik gewoon heel even snel ChatGPT"*. Inbouwen maakt de
  workflow zelfstandig. **Effort: M.**
- **🟠 Ingebouwde prompt-assistent** (Thelma wil ChatGPT ernaast voor prompts). **Effort: M.**
- **🟠 "Blog/website-tekst → video" one-click** (Thelma: haar blog als bron; ook Robert). **Effort: M.**
- **🟡 Onderwerp/scene verwijderen met automatische downstream-hergeneratie** (Anita Blitz:
  *"stel dat je die voeding eruit wil hebben"*). **Effort: M.**
- **🟡 Voice-over wijzigen stemt de beeld-prompt automatisch mee af** — klanten verwáchten dit
  gedrag al (NL Guts, ProCorrect). **Effort: M.**
- **🟡 Zelf de "hoek"/insteek kiezen aan de start** (ProCorrect). **Effort: S.**

### B4 — Serie, hergebruik & formaten
- **🟠 Serie-/multi-video-generatie uit één bron** per processtap/onderwerp — precies de
  kern-use-case van Super50Carz (import in "kleine happen") en Anita's content-drip. **Effort: M–L.**
- **🟠 Evergreen-/thema-modules met makkelijke her-render** — Johan (updaten bij wetswijziging),
  NL Guts (4 vaste jaarthema's die terugkomen). **Effort: M.**
- **🟠 Eén project → beide formaten (16:9 + 9:16)** zonder opnieuw te genereren (ProCorrect).
  **Effort: M.**
- **🟡 Platform-specifieke varianten uit één video** (LinkedIn vs Instagram — jij oppert het
  zelf bij Anita Blitz). **Effort: M.**
- **🟡 Per-scène "statisch laten / niet animeren"-toggle** (Wim). **Effort: S.**

### B5 — Stijl, toon & social-proof-ready output
- **🟠 In-app stijl-preview/vergelijker** — prospect snapt stijlverschil pas na voorbeelden
  (Jeffrey: *"Wat is 3D animatie t.o.v. realistic?"*). Sluit direct aan op de **stijlkiezer**
  op je roadmap (Stap 3). **Effort: S–M.**
- **🟠 Toon-/sfeer-directive per animatie** ("serieus vs speels" als knop; Hennie's dansende
  beveiliger moest serieus). **Effort: M.**
- **🟡 Kindvriendelijke/"speelser" stijl-preset** (Robert, kind-content). **Effort: S.**
- **🟡 Caption-safe-zone preview** voor social — TikTok-captions vallen nu over beeld
  (ProCorrect, social-media-expert). **Effort: S.**

### B6 — Distributie & website-integratie
- **🟠 Export met klikbare CTA / koppeling naar cursus of landingspagina** (Anita Blitz:
  *"kun je die dan aan die cursus plakken ook?"*). **Effort: M.**
- **🟠 YouTube-embed / website-integratie-helper** (Robert, Thelma) — inclusief advies om de
  site niet te vertragen. **Effort: M.**
- **🟡 "Video-op-website i.p.v. tekstblok" als conversie-feature** (Hennie, Robert). **Effort: M.**
- **🟡 Bulk: bestaande website-plaatjes → video's vervangen** (Robert). **Effort: L.**
- **🟡 Ingebouwd contentplan/plaatsingsadvies** — je biedt dit nu als losse dienst aan
  ("±80 raakpunten"); productiseren als in-app plan (Anita Blitz). **Effort: M.**

### B7 — Account, team & samenwerking
- **🔴 Self-serve project delen/overzetten naar klant-account** (×3: Super50Carz, NL Guts,
  Gert). Nu handmatig, niet betrouwbaar, en het blokkeert follow-up. *"is het mogelijk dat je
  die naar mij kan sturen"*. **Effort: M.**
- **🟠 Team-/multi-seat accounts** — Hennie kan pas beslissen mét zoon in het account;
  *"ik wil mijn zoon erin betrekken"*. **Effort: M.**

### B8 — Positionering & vertrouwen (features die verkopen)
- **🟠 Model-transparantie** — tonen welke AI's eronder zitten + "geen eigen abo nodig"
  (Jeffrey: *"Wat zit er achter voor AI?"*). **Effort: S.**
- **🟠 In-app voorbeeld-/inspiratiegalerij** met klantvideo's vóór start (Thelma). **Effort: S.**
- **🟡 White-label / bron-anonieme video** — over een technologie zónder het bronbedrijf te
  noemen (Jeffrey: *"zonder CO₂ Circulair te noemen"*). **Effort: S.**
- **🟡 Productize de handmatige pro-edit** — een nette "stuur op voor bureaubewerking"-handoff
  (Jeffrey; je doet dit nu ad-hoc). **Effort: M.**

### B9 — Branche-/use-case-templates (kant-en-klare startpunten)
Terugkerend: elke branche wil een herkenbaar startsjabloon. Kandidaten uit de calls:
- **Beschikbaarheid/recruitment voor ZZP-professionals** (Gert — invaldocent).
- **Kennis-/uitleg-explainers voor dienstverleners** (Johan — koopakte/notaris).
- **E-commerce/product-video** (Super50Carz, Thelma popcorn).
- **Sales-enablement "overtuig een interne beslisser"** met deelbare link (NL Guts).
- **Meta-/YouTube-ads formaat-presets** (Wim, Thelma).
- **Branche-terminologie-glossary** (Hennie: portofoon≠headset; NL Guts: collegezaal≠fabriek).
- **Effort per template: S–M.**

---

## C. Aanbevolen prioriteit (additief)

### Top-5 nieuwe features om nu op te pakken
1. **Referentiefoto per scène/object (B1)** — het meest gevraagde ontbrekende stuk, door jou
   al beloofd; lost merk-/logo-/product-getrouwheid over vrijwel alle branches op.
2. **Do-not-translate glossary + uitspraak (B2)** — goedkoop, verwijdert een terugkerende
   gênante voice-over-fout ("slimme duck", "Super fifty").
3. **Self-serve project-overdracht naar klant-account (B7)** — nu handmatig, blokkeert
   follow-up, in 3 calls gevraagd.
4. **Ingebouwde draaiboek-/storyboard-planner (B3)** — automatiseert je externe-LLM-advies en
   haalt de idee-fase-lock-in weg.
5. **In-app stijl-preview/vergelijker (B5)** — kleine additie die direct meelift op de
   stijlkiezer (Stap 3) en demo's overtuigender maakt.

### Top-3 grote weddenschappen
1. **Voice cloning + meertaligheid (B2)** — beide al beloofd, sterke differentiators.
2. **Serie-/evergreen-modus met her-render en beide formaten (B4)** — sluit aan op hoe
   klanten echt content maken (drip, wetswijzigingen, thema's).
3. **Merk-/asset-bibliotheek + eigen personages (B1)** — maakt output structureel on-brand.

---

## D. Bugs & pijnpunten (compact — details op aanvraag)

Kort, want dit plan is additief. De zwaarste:
- **🔴 Huisstijl-kleurbug** — verkeerde kleuren/zwart-wit sinds de huisstijl is losgekoppeld;
  brak bij Super50Carz de demo af, gaf NL Guts zwart-wit-scènes. *"nog een klein beetje beta"*.
- **🟠 AI-glitches die prospects zélf spotten** (×8+): popcorn met lepel/strijkbout, ronde
  schuttingen, dansende beveiliger, dubbele handen, verkeerde koffiepot. Betere default-negatives
  + branche-context (B1/B9).
- **🟠 Tekst-in-beeld & uitspraak** ("prijs" met Z/3, getallen als "1300"): rendering + TTS-
  normalisatie.
- **🟠 Regenereer-valkuil** (oude clip blijft → "twee video's"); idee-fase-lock-in (geen terug).
- **🟠 Offerte-mail komt niet aan** (Jeffrey, ~6 min resends midden in closing) — deliverability
  nakijken (Resend SPF/DKIM) + in-app offerte als fallback.

---

## E. UX/onboarding & conversie (compact)

- **Account maken tijdens de sessie** onduidelijk (×4–5) → laat de klant meteen (via directe
  link) een account maken. *(Sluit aan op de gratis-account/claim-flow.)*
- **Scène-model niet intuïtief** (scenes-vs-video, prompt-scope, delete-vs-regenerate) → korte
  in-app uitleg.
- **Rechterkolom onbegrijpelijk** ("negeer maar") → advanced-velden standaard inklappen.
- **Credits zorgen voor cognitieve last** → toon vooraf "deze actie kost X credits".
- **Onboarding-tempo overweldigt digibeten** (Anita Blitz) → een rustige "begeleide modus".
- **Conversie:** de nabewerkings-garantie ("bureau maakt het met de hand goed") is je sterkste
  bezwaar-ontzenuwer (werkte bij Jeffrey) — zet 'm standaard in de pitch. ROI-case klaarhebben
  (Hennie). Perfectionisten haken af op AI-fouten + credit-verbruik → B1/kwaliteit fixen verlaagt churn.

---

## F. Use-cases per branche

| Klant | Branche | Wil maken |
|---|---|---|
| Gert van Tol | Onderwijs | "Ik ben beschikbaar"-video richting scholen |
| Johan | Makelaardij | Bedrijfsvideo + informatieve vastgoed-explainers |
| Anita / TapEnjoy | Duurzame dranken (B2B) | Procesvideo + social over kunststof vs. staal |
| Oumaima / ProCorrect | Juridisch/compliance | Openingsvideo richting ZZP'ers |
| Anita Blitz | Hondencoach | Cursus verkopen op Facebook/TikTok |
| Ruengelo / Super50Carz | Auto import/export | Proces in happen (taxatie, import, vrijwaring) |
| NL Guts | Kennisnetwerk scheidingstech | Wervingsvideo voor intern akkoord/lidmaatschap |
| Robert / Two Move | Coaching/kinderwelzijn | Animaties i.p.v. echte kinderen (portretrecht) |
| Jeffrey Felix | Cleantech (CO2-afvang) | Kennisvideo zonder merk + NL Guts-werving |
| Wim / Schuttingmenneke | Schuttingen (MKB) | Meta-advertenties |
| Thelma / Pop Delicious | Food e-commerce | Ads voor Q4, geen eigen gezicht op camera |
| Hennie / Veiligheidsgroep | Beveiliging | Wervings-/uitlegvideo (met zoon + MKB-coach) |

**Rode draad:** MKB/ZZP, social-ads en "uitleg/proces"-video's; sterke gevoeligheid voor
**merk-/productgetrouwheid** en **laagdrempeligheid**.

---

*Backlog-document; items zijn los te plannen. Jeroen/Brand Happening staat apart in
`JEROEN-BRANDHAPPENING-CONCEPT.md`.*
