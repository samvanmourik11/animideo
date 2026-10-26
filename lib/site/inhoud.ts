// De teksten van de website op animideo.com: de voorpagina en één landingspagina per doelgroep
// (Sam, 25-10-2026). Elke pagina volgt dezelfde verkoop-opbouw, want bij de vorige ads was het
// probleem dat bezoekers niet begrepen wat ze kochten: eerst de video van het hele proces, dan
// stap voor stap wat je doet, dan echte resultaten, en dan in credits uitgerekend wat je voor
// je geld krijgt.
//
// Video's staan in de publieke opslag (scene-assets/site/), niet in de repo: die zijn te groot.

export const VIDEO_BASIS = "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/site";

export type DoelgroepId = "youtube" | "bedrijven" | "kinderen" | "nederlands";

export interface Stap {
  titel: string;
  tekst: string;
  /** Kort, stil, herhalend fragment uit de procesvideo (bestandsnaam in VIDEO_BASIS). */
  clip: string;
}

export interface Voorbeeld {
  titel: string;
  url: string;
  /** "staand" (9:16) of "liggend" (16:9). */
  vorm: "staand" | "liggend";
}

export interface Rekensom {
  /** Wat je maakt, bijv. "YouTube-video van 8 minuten". */
  wat: string;
  credits: number;
}

export interface Vraag {
  v: string;
  a: string;
}

export interface Doelgroep {
  id: DoelgroepId;
  /** Tekst in het menu. */
  menu: string;
  metaTitel: string;
  metaOmschrijving: string;
  bovenkop: string;
  kop: string;
  /** Het deel van de kop dat de merkkleur krijgt. */
  kopAccent: string;
  sub: string;
  video: string;
  poster: string;
  stappen: Stap[];
  voorbeeldenKop: string;
  voorbeelden: Voorbeeld[];
  rekensommen: Rekensom[];
  /** Welk pakket we aanraden (krijgt het accent). */
  advies: "starter" | "pro" | "agency";
  adviesReden: string;
  vragen: Vraag[];
}

const VB = `${VIDEO_BASIS}/voorbeelden`;

// Vragen die op elke pagina terugkomen: geld, opzeggen, wat je mag met wat je maakt.
const ALGEMENE_VRAGEN: Vraag[] = [
  {
    v: "Wat kost de gratis week, en waarom moet ik met iDEAL betalen?",
    a: "De week is gratis en je krijgt 200 credits. Je verifieert met iDEAL voor een paar cent (tussen €0,01 en €0,09); dat bedrag storten we direct terug. Zo weten we dat je een echt persoon bent en kan je abonnement na de week doorlopen zonder dat je opnieuw gegevens invult.",
  },
  {
    v: "Wat gebeurt er na 7 dagen?",
    a: "Dan start het pakket dat je bij het aanmelden koos (Starter €49, Pro €99 of Agency €249 per maand) en krijg je de credits van dat pakket. Zeg je in de proefweek op, dan betaal je niets. Daarna kun je per maand opzeggen.",
  },
  {
    v: "Wat zijn credits?",
    a: "Elke keer dat de AI iets voor je maakt (een beeld, een stukje video, een voice-over) kost dat een paar credits. Bij elke knop staat vooraf wat het kost. Scripts schrijven en de Regisseur om advies vragen zijn gratis.",
  },
  {
    v: "Mag ik de video's gebruiken voor mijn bedrijf of kanaal?",
    a: "Ja. Wat je maakt is van jou: je mag het publiceren, er geld mee verdienen op YouTube en het gebruiken in advertenties.",
  },
  {
    v: "Ik ben niet technisch. Lukt me dit?",
    a: "Ja. Je typt in gewoon Nederlands wat je wilt, de Regisseur stelt een paar vragen en maakt het. In de Academy staan 25 korte videolessen, en loop je vast, dan helpt ons Nederlandse supportteam je verder.",
  },
];

export const DOELGROEPEN: Record<DoelgroepId, Doelgroep> = {
  youtube: {
    id: "youtube",
    menu: "Faceless YouTube",
    metaTitel: "Faceless YouTube-video's maken met AI | Animideo",
    metaOmschrijving: "Van onderwerp tot complete YouTube-video met Nederlandse voice-over, beelden en montage. Zonder camera, zonder gezicht. Probeer Animideo 7 dagen gratis.",
    bovenkop: "Voor faceless YouTube-kanalen",
    kop: "Een complete YouTube-video, zonder dat jij in beeld komt",
    kopAccent: "zonder dat jij in beeld komt",
    sub: "Kies een onderwerp. Animideo schrijft het script, spreekt het in met een echte Nederlandse stem, maakt bij elke zin het beeld en monteert alles tot een video die je zo kunt uploaden. Lange video's én Shorts.",
    video: "youtube.mp4",
    poster: "youtube.jpg",
    stappen: [
      { titel: "Kies je onderwerp", tekst: "Typ een onderwerp of plak een link. De Regisseur stelt een paar vragen: hoe lang, welke sfeer, voor welk publiek.", clip: "youtube-1.mp4" },
      { titel: "Script en stem", tekst: "Je krijgt een script met een sterke opening en hoofdstukken. Kies uit 100 stemmen; de voice-over staat er in seconden.", clip: "youtube-2.mp4" },
      { titel: "Beeld bij elke zin", tekst: "Bij elke scène maakt Animideo een beeld in jouw vaste stijl, met dezelfde personages. Niet goed? Eén klik voor een nieuwe.", clip: "youtube-3.mp4" },
      { titel: "Downloaden en uploaden", tekst: "De montage met muziek en ondertitels rolt eruit als mp4, liggend voor YouTube of staand voor Shorts en TikTok.", clip: "youtube-4.mp4" },
    ],
    voorbeeldenKop: "Gemaakt met Animideo",
    voorbeelden: [
      { titel: "Documentaire: de Watersnoodramp", url: `${VB}/watersnoodramp.mp4`, vorm: "liggend" },
      { titel: "Trailer: Het Fluisteren van de Draken", url: `${VB}/trailer-draken.mp4`, vorm: "liggend" },
      { titel: "Short: schakel of automaat?", url: `${VB}/schakel-of-automaat.mp4`, vorm: "staand" },
    ],
    rekensommen: [
      { wat: "YouTube-video van 8 minuten (±40 scènes + voice-over)", credits: 180 },
      { wat: "YouTube Short van 60 seconden", credits: 45 },
      { wat: "Extra beeld als een scène je niet bevalt", credits: 4 },
    ],
    advies: "pro",
    adviesReden: "Met Pro maak je elke maand zo'n 8 lange video's, of 30 Shorts, en plan je ze automatisch vooruit in.",
    vragen: [
      { v: "Mag ik met deze video's geld verdienen op YouTube?", a: "Ja. YouTube vraagt om eigen, waardevolle inhoud. Daarom schrijf je bij Animideo zelf mee aan het script en kies je zelf de stijl, zodat elke video uniek is en niet een kopie van wat anderen maken." },
      { v: "Kan ik ook in het Engels, Duits of Frans maken?", a: "Ja. Het script en de voice-over kunnen in meerdere talen; er zijn ook internationale stemmen." },
      { v: "Blijven mijn personages hetzelfde in elke scène?", a: "Ja. Je legt een personage of decor één keer vast; Animideo gebruikt het daarna in elke scène en in elke volgende video." },
      ...ALGEMENE_VRAGEN,
    ],
  },

  bedrijven: {
    id: "bedrijven",
    menu: "Voor bedrijven",
    metaTitel: "AI-video's voor jouw bedrijf: reclame, UGC en social | Animideo",
    metaOmschrijving: "Plak de link van je website of product en krijg een reclamevideo met voice-over. Of laat een AI-creator je product aanprijzen. Inclusief contentkalender en automatisch posten.",
    bovenkop: "Voor ondernemers en marketeers",
    kop: "Plak je link. Krijg een reclamevideo.",
    kopAccent: "Krijg een reclamevideo.",
    sub: "Animideo leest je website of productpagina, schrijft de reclame, maakt de beelden en de voice-over in jouw huisstijl en monteert het tot een video voor Instagram, TikTok of Facebook. Zonder bureau, zonder camera, in een paar minuten.",
    video: "bedrijven.mp4",
    poster: "bedrijven.jpg",
    stappen: [
      { titel: "Plak je link", tekst: "De link van je website of product is genoeg. Animideo haalt je logo, kleuren en wat je verkoopt er zelf uit.", clip: "bedrijven-1.mp4" },
      { titel: "Kies wat je wilt", tekst: "Een reclame van 15 seconden, een UGC-video met een AI-creator die je product aanprijst, of een reeks posts voor de komende weken.", clip: "bedrijven-2.mp4" },
      { titel: "Animideo maakt het", tekst: "Beelden, bewegende shots, een Nederlandse voice-over, muziek en je logo aan het eind. Jij kijkt mee en stuurt bij met gewone zinnen.", clip: "bedrijven-3.mp4" },
      { titel: "Posten of inplannen", tekst: "Download de video, of laat Animideo hem op het juiste moment op je kanalen zetten.", clip: "bedrijven-4.mp4" },
    ],
    voorbeeldenKop: "Echte resultaten uit Animideo",
    voorbeelden: [
      { titel: "Reclame: De Zoete Zwaan", url: `${VB}/reclame-zoete-zwaan.mp4`, vorm: "liggend" },
      { titel: "UGC: stroopwafels (creator Jeroen)", url: `${VB}/ugc-stroopwafels.mp4`, vorm: "staand" },
      { titel: "Reclame uit een link: reviewkaart", url: `${VB}/reclame-reviewkaart.mp4`, vorm: "staand" },
      { titel: "UGC: chocolade (creator Sanne)", url: `${VB}/ugc-chocolade.mp4`, vorm: "staand" },
    ],
    rekensommen: [
      { wat: "Reclamevideo van 15 seconden met voice-over", credits: 51 },
      { wat: "UGC-video van 15 seconden met AI-creator", credits: 48 },
      { wat: "Productfoto of social-post (beeld)", credits: 5 },
    ],
    advies: "pro",
    adviesReden: "Met Pro maak je elke maand zo'n 30 reclames of 300 posts, plant Animideo ze automatisch in en werk je met 3 collega's in één account.",
    vragen: [
      { v: "Lijkt het op mijn merk?", a: "Ja. Je zet je huisstijl er één keer in (logo, kleuren, lettertype; of laat Animideo die van je website halen) en elke video gebruikt hem." },
      { v: "Kan ik mijn eigen product laten zien?", a: "Ja. Upload een foto van je product; de AI-creator houdt het vast en laat het zien zoals het echt is." },
      { v: "Kan Animideo ook voor mij posten?", a: "Met Pro koppel je tot 3 accounts (Instagram, TikTok, Facebook, YouTube, X). Animideo bedenkt een contentkalender, maakt de posts en zet ze op het afgesproken moment online. Jij keurt eerst." },
      ...ALGEMENE_VRAGEN,
    ],
  },

  kinderen: {
    id: "kinderen",
    menu: "Kindercontent",
    metaTitel: "Kindercontent maken met AI: animatieverhalen | Animideo",
    metaOmschrijving: "Maak zelf animatieverhalen voor kinderen, met vaste personages, een warme Nederlandse stem en tekeningen in jouw stijl. Voor YouTube, voor de klas of voor het slapengaan.",
    bovenkop: "Voor makers van kindercontent",
    kop: "Animatieverhalen voor kinderen, met jouw eigen personages",
    kopAccent: "met jouw eigen personages",
    sub: "Bedenk een held, kies een stijl en vertel waar het verhaal over gaat. Animideo schrijft het verhaal, tekent elke scène met dezelfde personages en laat een warme Nederlandse stem voorlezen. Klaar voor YouTube Kids, de klas of het slapengaan.",
    video: "kinderen.mp4",
    poster: "kinderen.jpg",
    stappen: [
      { titel: "Maak je held", tekst: "Beschrijf je personage of upload een tekening. Animideo maakt er een vast figuur van dat in elk verhaal hetzelfde blijft.", clip: "kinderen-1.mp4" },
      { titel: "Vertel het idee", tekst: "\"Bella de olifant redt het feest\" is genoeg. Animideo schrijft een verhaal met een begin, een spannend moment en een les.", clip: "kinderen-2.mp4" },
      { titel: "Elke scène getekend", tekst: "Kies een stijl: 3D-animatie, prentenboek, cartoon. Elke scène wordt getekend, met je personages erin.", clip: "kinderen-3.mp4" },
      { titel: "Voorlezen en klaar", tekst: "Een warme verteller, muziek en zachte beweging. Download het, of plan het in voor je kanaal.", clip: "kinderen-4.mp4" },
    ],
    voorbeeldenKop: "Verhalen gemaakt met Animideo",
    voorbeelden: [
      { titel: "Pratende personages: De Magie van Tekenen", url: `${VB}/magie-van-tekenen.mp4`, vorm: "liggend" },
      { titel: "Zoey en de muzikale droom", url: `${VB}/zoey-muzikale-droom.mp4`, vorm: "liggend" },
      { titel: "De prinses die naar school gaat", url: `${VB}/prinses-naar-school.mp4`, vorm: "liggend" },
      { titel: "Geschiedenis voor kinderen: Suriname", url: `${VB}/suriname.mp4`, vorm: "liggend" },
    ],
    rekensommen: [
      { wat: "Voorleesverhaal van 3 minuten (±20 getekende scènes)", credits: 90 },
      { wat: "Kort verhaal van 1 minuut voor Shorts/TikTok", credits: 45 },
      { wat: "Een scène met bewegende animatie erbij", credits: 11 },
    ],
    advies: "starter",
    adviesReden: "Met Starter maak je elke maand zo'n 5 voorleesverhalen. Wil je een kanaal vullen of meer verhalen per maand? Kies Pro.",
    vragen: [
      { v: "Is het geschikt voor kinderen?", a: "Jij bepaalt het verhaal, de les en de toon, en je ziet elke scène en hoort de voice-over voordat je iets publiceert. Bevalt een scène niet, dan maak je hem met één klik opnieuw." },
      { v: "Kan ik mijn eigen stem laten voorlezen?", a: "Ja, in elk abonnement train je je eigen stem in een minuut. Daarna leest jouw stem elk verhaal voor." },
      { v: "Kan ik een verhaal in delen maken, zoals een serie?", a: "Ja. Je personages en decors blijven bewaard, dus aflevering 2 ziet eruit als aflevering 1." },
      ...ALGEMENE_VRAGEN,
    ],
  },

  nederlands: {
    id: "nederlands",
    menu: "Waarom Animideo",
    metaTitel: "De Nederlandse AI-video-app, met Nederlandse support | Animideo",
    metaOmschrijving: "Alle AI-video-tools in één Nederlandse app: beeld, video, stemmen, reclame, verhalen en social. Met 100 Nederlandse stemmen, betalen met iDEAL en support van echte mensen.",
    bovenkop: "De Nederlandse AI-video-app",
    kop: "Alle AI-video-tools in één app. In het Nederlands, met échte hulp.",
    kopAccent: "met échte hulp",
    sub: "Geen tien Engelse abonnementen en geen dollars. Animideo zet de beste AI-modellen voor beeld, video en stem in één Nederlandse app, met 100 Nederlandse stemmen, betalen met iDEAL en een supportteam dat je gewoon kunt appen.",
    video: "nederlands.mp4",
    poster: "nederlands.jpg",
    stappen: [
      { titel: "Zeg wat je wilt", tekst: "In gewoon Nederlands: \"Maak een reclame voor mijn bakkerij\". De Regisseur maakt een plan en vraagt wat hij moet weten.", clip: "nederlands-1.mp4" },
      { titel: "Alles in één app", tekst: "Beelden, video's, effecten, voice-overs, pratende personages, verhalen en reclames. Je hoeft niet te wisselen tussen tools.", clip: "nederlands-2.mp4" },
      { titel: "Klinkt écht Nederlands", tekst: "100 Nederlandse en Vlaamse stemmen, en teksten zonder Engelse vertaalfouten. Of train je eigen stem.", clip: "nederlands-3.mp4" },
      { titel: "Hulp van mensen", tekst: "25 videolessen in de Academy, en kom je er niet uit, dan app je met ons supportteam. In het Nederlands.", clip: "nederlands-4.mp4" },
    ],
    voorbeeldenKop: "Wat je maakt met Animideo",
    voorbeelden: [
      { titel: "Reclame: De Zoete Zwaan", url: `${VB}/reclame-zoete-zwaan.mp4`, vorm: "liggend" },
      { titel: "De prinses die naar school gaat", url: `${VB}/prinses-naar-school.mp4`, vorm: "liggend" },
      { titel: "UGC: stroopwafels", url: `${VB}/ugc-stroopwafels.mp4`, vorm: "staand" },
      { titel: "Logo komt tot leven", url: `${VB}/logo-tot-leven.mp4`, vorm: "staand" },
    ],
    rekensommen: [
      { wat: "Reclamevideo van 15 seconden", credits: 51 },
      { wat: "Voorleesverhaal van 3 minuten", credits: 90 },
      { wat: "AI-beeld", credits: 1 },
    ],
    advies: "pro",
    adviesReden: "Pro is wat de meeste mensen kiezen: genoeg credits voor elke week nieuwe content, automatisch posten en support via WhatsApp.",
    vragen: [
      { v: "Hoe bereik ik de support?", a: "Via de supportknop in de app, per mail, en met Pro of Agency ook via WhatsApp. In het Nederlands, en meestal nog dezelfde werkdag." },
      { v: "Waarom staat er JouwAnimatieVideo op mijn afschrift?", a: "Animideo is gemaakt door JouwAnimatieVideo, het Nederlandse animatiebureau. Betalingen en facturen lopen via dat bedrijf." },
      ...ALGEMENE_VRAGEN,
    ],
  },
};

export const DOELGROEP_IDS = Object.keys(DOELGROEPEN) as DoelgroepId[];

export const PAKKETTEN = [
  { id: "starter", naam: "Starter", prijs: 49, credits: 500, punten: ["Alle maak-tools en studio's", "De Regisseur", "100 Nederlandse stemmen", "Je eigen stem klonen", "Contentkalender maken", "1 huisstijl", "Academy + mail-support"] },
  { id: "pro", naam: "Pro", prijs: 99, credits: 1500, punten: ["Alles van Starter", "Automatisch vooruit posten (3 accounts)", "Animideo in Claude", "5 huisstijlen, team van 3", "Support via WhatsApp"] },
  { id: "agency", naam: "Agency", prijs: 249, credits: 4000, punten: ["Alles van Pro", "Onbeperkt accounts en huisstijlen", "Team van 10", "Eigen sleutels voor koppelingen", "Persoonlijke support"] },
] as const;
