// DE ACADEMY — videolessen met opdrachten, zodat klanten de app echt leren gebruiken (Sam,
// 25-10-2026: "cruciaal voor live"). Hoofdstuk 0 geeft de context (wat kan het, credits,
// waarom een mislukte poging ook kost, geld verdienen), daarna één hoofdstuk per soort tool.
//
// Client-veilig: alleen gegevens. De video's maken we buiten de app (~/animideo-tutorials/
// academy: schermafdrukken + presentator + Hugo V) en staan op de opslag onder academy/<slug>.
// Een opdracht vinkt zichzelf af zodra de klant het echt gemaakt heeft (lib/academy/voortgang.ts).

export type CheckId =
  | "beeld"
  | "bewerk"
  | "video"
  | "effect"
  | "app"
  | "reclame"
  | "voice-over"
  | "pratend"
  | "regisseur"
  | "storytelling"
  | "dialoog"
  | "ugc"
  | "film"
  | "social"
  | "trend"
  | "gedeeld"
  | "personage"
  | "huisstijl"
  | "profiel"
  | "team"
  | "claude"
  | "geen";

export interface Opdracht {
  tekst: string;
  /** Waar je de opdracht doet. */
  link: string;
  knop: string;
  /** Hoe we zien dat hij gedaan is; 'geen' = de klant vinkt hem zelf af. */
  check: CheckId;
}

export interface Les {
  slug: string;
  titel: string;
  /** Eén zin onder de titel. */
  kort: string;
  /** Wat je onthoudt: 3-5 punten onder de video. */
  punten: string[];
  opdracht: Opdracht;
}

export interface Hoofdstuk {
  nummer: number;
  titel: string;
  uitleg: string;
  icoon: string;
  lessen: Les[];
}

export const HOOFDSTUKKEN: Hoofdstuk[] = [
  {
    nummer: 0,
    titel: "Welkom bij Animideo",
    uitleg: "Wat kun je met de app, hoe werken credits, en hoe verdien je er geld mee? Begin hier.",
    icoon: "👋",
    lessen: [
      {
        slug: "welkom",
        titel: "Wat kun je met Animideo?",
        kort: "Een rondleiding: van één beeld tot een complete film, allemaal in het Nederlands.",
        punten: [
          "Links in het menu staat alles: Beeld, Video, Effecten, Apps, Stem en de Studio's.",
          "De Regisseur is je assistent: zeg wat je wilt en hij maakt het plan en het werk.",
          "Alles wat je maakt, komt in Mijn bibliotheek.",
          "Je hoeft geen prompts te kunnen schrijven: gewoon Nederlands is genoeg.",
        ],
        opdracht: { tekst: "Maak je allereerste beeld: typ wat je wilt zien en klik op Maak.", link: "/maak/beeld", knop: "Naar Beeld", check: "beeld" },
      },
      {
        slug: "credits",
        titel: "Zo werken credits",
        kort: "Wat een credit is, wat dingen kosten, en wat je doet als je meer nodig hebt.",
        punten: [
          "Elke maand komen er credits bij; wat je niet gebruikt, blijft staan.",
          "Een gewoon beeld kost 1 credit, een Pro-beeld 5, een video vanaf 6. Schrijven, plannen en de Regisseur zijn gratis.",
          "Op elke knop staat vooraf wat iets kost. Je saldo zie je linksonder.",
          "Meer nodig? Koop losse credits bij of kies een groter abonnement.",
        ],
        opdracht: { tekst: "Bekijk je saldo en wat je deze maand hebt gebruikt.", link: "/account/credits", knop: "Naar mijn credits", check: "geen" },
      },
      {
        slug: "mislukte-poging",
        titel: "Waarom een mislukte poging ook credits kost",
        kort: "Een slechte take bij een echte film kost ook geld. Met AI is dat niet anders, en zo voorkom je het.",
        punten: [
          "Elke poging laat een computer echt werk doen; dat kost ons geld, ook als het resultaat tegenvalt.",
          "Net als op een filmset: een mislukte take kost de tijd van acteurs, camera en regisseur.",
          "Begin goedkoop: test een idee met een gewoon beeld voordat je er een video van maakt.",
          "Wees concreet: wie, wat, waar, welk licht, welke camera. Hoe duidelijker, hoe minder overnieuw.",
          "Laat de Regisseur eerst een plan maken; jij keurt voordat er credits gaan.",
        ],
        opdracht: { tekst: "Maak één beeld goedkoop (Standaard) en daarna dezelfde in Pro. Zie je het verschil?", link: "/maak/beeld", knop: "Naar Beeld", check: "beeld" },
      },
      {
        slug: "geld-verdienen",
        titel: "Geld verdienen met Animideo",
        kort: "Van besparen op je eigen marketing tot diensten verkopen aan andere bedrijven.",
        punten: [
          "Bespaar: productfoto's, posts en filmpjes voor je eigen bedrijf zonder fotograaf of bureau.",
          "Verkoop diensten: social-content, productfoto's of UGC-video's voor lokale ondernemers en webshops.",
          "Maak persoonlijke video's: kinderverhalen, verjaardagen, bedankjes voor klanten.",
          "Bouw een eigen kanaal op TikTok of YouTube met verhalen, trends of uitleg.",
          "Werk je met meer mensen? Met Pro of Agency deel je één pot credits met je team.",
        ],
        opdracht: { tekst: "Kies één verdienmodel en vraag de Regisseur om een eerste voorbeeld te maken.", link: "/regisseur", knop: "Naar de Regisseur", check: "regisseur" },
      },
    ],
  },
  {
    nummer: 1,
    titel: "Beelden maken",
    uitleg: "Van een zin naar een beeld, en dat beeld daarna bijschaven.",
    icoon: "🖼️",
    lessen: [
      {
        slug: "beeld-maken",
        titel: "Je eerste beeld",
        kort: "Beschrijven, formaat kiezen, Standaard of Pro, en een eigen foto als voorbeeld.",
        punten: [
          "Beschrijf wat je wilt zien in gewone zinnen: wie, wat, waar en welke sfeer.",
          "Kies het formaat: vierkant voor Instagram, staand voor TikTok en Reels, liggend voor YouTube en je website.",
          "Standaard (1 credit) is prima om te proberen; Pro (5 credits) is scherper en spelt tekst foutloos.",
          "Met een eigen foto als voorbeeld zet je jezelf, je product of je zaak in het beeld.",
        ],
        opdracht: { tekst: "Maak een beeld van je eigen bedrijf of hobby, in het formaat dat je het vaakst gebruikt.", link: "/maak/beeld", knop: "Naar Beeld", check: "beeld" },
      },
      {
        slug: "beeld-bewerken",
        titel: "Beelden bewerken",
        kort: "Iets aanpassen met een zin, scherper maken, achtergrond weg, gezicht en licht.",
        punten: [
          "Open een beeld in je bibliotheek: daar staan de bewerkknoppen.",
          "Aanpassen met tekst: 'maak de lucht oranje' of 'zet er een kopje koffie bij'.",
          "Scherper maakt het beeld groter en strakker, Achtergrond weg geeft een los onderwerp.",
          "Gezicht verbeteren en Ander licht maken een portret af.",
        ],
        opdracht: { tekst: "Open een beeld uit je bibliotheek en bewerk het: pas iets aan, of haal de achtergrond weg.", link: "/mijn-werk", knop: "Naar mijn bibliotheek", check: "bewerk" },
      },
    ],
  },
  {
    nummer: 2,
    titel: "Video",
    uitleg: "Beelden tot leven brengen en virale effecten maken.",
    icoon: "🎬",
    lessen: [
      {
        slug: "video-maken",
        titel: "Van beeld naar video",
        kort: "Een beeld laten bewegen, en welk model je kiest.",
        punten: [
          "Kies een beeld (upload of uit je bibliotheek) en beschrijf wat er moet bewegen en wat de camera doet.",
          "Seedance Lite is de standaard: rustig en het voordeligst.",
          "Hailuo is sterk in natuurkunde, Kling 2.5 in mensen en dieren, Seedance Pro in full-HD.",
          "Een clip duurt 5 seconden en is meestal binnen een paar minuten klaar.",
        ],
        opdracht: { tekst: "Laat een beeld uit je bibliotheek bewegen.", link: "/maak/video", knop: "Naar Video", check: "video" },
      },
      {
        slug: "effecten",
        titel: "Effecten",
        kort: "Foto erin, viraal filmpje eruit: smelten, verdwijnen, bullet time en meer.",
        punten: [
          "Kies een effect, upload een foto en klik op Maak. Je hoeft niets te beschrijven.",
          "Lees bij elk effect welke foto het best werkt, bijvoorbeeld 'van top tot teen'.",
          "Staat er een gezicht op? Zet het vinkje dat je toestemming hebt van die persoon.",
        ],
        opdracht: { tekst: "Maak een effect met een foto van jezelf of je product.", link: "/effecten", knop: "Naar Effecten", check: "effect" },
      },
    ],
  },
  {
    nummer: 3,
    titel: "Kant-en-klare tools",
    uitleg: "Apps en sjablonen die in één klik doen waar je anders uren mee bezig bent.",
    icoon: "🧩",
    lessen: [
      {
        slug: "apps",
        titel: "Apps voor je bedrijf",
        kort: "Productfoto's, een zakelijke profielfoto, een billboard, en foto's opknappen.",
        punten: [
          "Productfoto-studio maakt van een telefoonfoto een strakke studiofoto.",
          "Product in sfeer zet je product in een echte situatie, zoals een keuken of een woonkamer.",
          "Zakelijke profielfoto maakt van een selfie een nette foto voor LinkedIn.",
          "Billboard en bushokje laten zien hoe je advertentie er buiten uitziet.",
        ],
        opdracht: { tekst: "Maak een productfoto of een zakelijke profielfoto.", link: "/apps", knop: "Naar Apps", check: "app" },
      },
      {
        slug: "branches-reclame",
        titel: "Jouw branche en reclame van een link",
        kort: "Sjablonen voor zorg, onderwijs, horeca en meer, en een complete reclame uit een webadres.",
        punten: [
          "Kies je branche: je krijgt sjablonen voor wat jij elke week nodig hebt.",
          "Link → reclame: plak een productpagina en je krijgt een reclamefilmpje met stem en muziek.",
          "Hoe beter de pagina (foto's, tekst), hoe beter de reclame.",
        ],
        opdracht: { tekst: "Maak een reclame van een link naar een product of dienst.", link: "/apps", knop: "Naar Apps", check: "reclame" },
      },
    ],
  },
  {
    nummer: 4,
    titel: "Stem & Lipsync",
    uitleg: "Voice-overs met 100 Nederlandse stemmen, je eigen stem, en foto's die praten.",
    icoon: "🗣️",
    lessen: [
      {
        slug: "stemmen",
        titel: "Stemmen en voice-overs",
        kort: "De juiste stem vinden en een voice-over maken die je kunt downloaden.",
        punten: [
          "Filter op Nederlands, Vlaams, man of vrouw, leeftijd en soort stem, en luister het voorbeeld.",
          "Bij Voice-over typ je de tekst zoals hij uitgesproken moet worden.",
          "Met [lachend], [fluisterend] of [enthousiast] stuur je de toon bij.",
        ],
        opdracht: { tekst: "Maak een voice-over van een paar zinnen over je bedrijf.", link: "/stem", knop: "Naar Stem & Lipsync", check: "voice-over" },
      },
      {
        slug: "eigen-stem-pratend",
        titel: "Je eigen stem en pratende foto's",
        kort: "Train je eigen stem en laat een foto praten, met echte lipsync.",
        punten: [
          "Eigen stem: neem een stukje op en geef toestemming; daarna praat de app met jouw stem.",
          "Pratende foto: kies een foto, een stem en een tekst, en de mond beweegt mee.",
          "Gebruik alleen je eigen stem of die van iemand die er toestemming voor gaf.",
        ],
        opdracht: { tekst: "Laat een foto praten.", link: "/stem", knop: "Naar Stem & Lipsync", check: "pratend" },
      },
    ],
  },
  {
    nummer: 5,
    titel: "De Regisseur",
    uitleg: "Je persoonlijke assistent die alle tools voor je bedient.",
    icoon: "🎬",
    lessen: [
      {
        slug: "regisseur",
        titel: "Werken met de Regisseur",
        kort: "Zeg wat je wilt maken; de Regisseur bedenkt het plan, vraagt wat hij moet weten en maakt het.",
        punten: [
          "Begin met wat je wilt bereiken, plak een link of voeg een bestand toe.",
          "De Regisseur stelt vragen met knoppen; klik je keuze aan.",
          "Voordat er credits gaan, zie je wat het kost en keur jij het goed.",
          "Iets elke week laten maken? Vraag om een vaste taak.",
        ],
        opdracht: { tekst: "Vraag de Regisseur om drie Instagram-posts voor je bedrijf.", link: "/regisseur", knop: "Naar de Regisseur", check: "regisseur" },
      },
    ],
  },
  {
    nummer: 6,
    titel: "De Studio's",
    uitleg: "Grotere producties: verhalen, gesprekken, UGC, films, social media en trends.",
    icoon: "🎞️",
    lessen: [
      {
        slug: "storytelling",
        titel: "Storytelling",
        kort: "Een verhaal met illustraties en voice-over, scène voor scène.",
        punten: [
          "Vertel waar het verhaal over gaat; de AI schrijft de verhaallijn.",
          "Elke scène krijgt een tekening in de stijl die je kiest.",
          "Pas tekst of beeld per scène aan voordat je de video maakt.",
        ],
        opdracht: { tekst: "Maak een kort verhaal over je bedrijf of voor een kind.", link: "/studios/storytelling", knop: "Naar Storytelling", check: "storytelling" },
      },
      {
        slug: "dialoog",
        titel: "Dialoog",
        kort: "Twee of drie personages die met elkaar praten, met echte stemmen en lipsync.",
        punten: [
          "Kies of maak je personages en geef elk een stem.",
          "Schrijf het gesprek zelf of laat het schrijven.",
          "Handig voor uitleg, een grap of een klantverhaal.",
        ],
        opdracht: { tekst: "Maak een kort gesprek tussen twee personages.", link: "/studios/dialoog", knop: "Naar Dialoog", check: "dialoog" },
      },
      {
        slug: "ugc",
        titel: "UGC-video's",
        kort: "Een AI-creator vertelt over je product of dienst, zoals een echte klant op TikTok.",
        punten: [
          "Plak de link naar je product en klik op Lees pagina, of vul het zelf in.",
          "Kies een creator, de lengte en of er tussenbeelden (B-roll) in moeten.",
          "Je krijgt een video met Nederlandse stem en ondertitels.",
        ],
        opdracht: { tekst: "Maak een UGC-video van 15 seconden over je product of dienst.", link: "/studios/ugc", knop: "Naar UGC", check: "ugc" },
      },
      {
        slug: "film",
        titel: "Filmstudio",
        kort: "Samen met de Regisseur een film van een paar minuten maken, scène voor scène.",
        punten: [
          "Vertel je verhaal of upload een script; de Regisseur maakt er scènes van.",
          "Personages krijgen een vast gezicht en een vaste stem.",
          "Je keurt elke scène; bij feedback worden alleen de veranderde shots opnieuw gemaakt.",
        ],
        opdracht: { tekst: "Begin een film met een idee van één zin.", link: "/studios/film", knop: "Naar Film", check: "film" },
      },
      {
        slug: "social",
        titel: "Social: een contentkalender",
        kort: "Koppel je kanalen en laat weken aan posts maken en plaatsen.",
        punten: [
          "Koppel Instagram, TikTok, Facebook, YouTube of X.",
          "Vertel waar je posts over gaan; je krijgt een kalender met tekst en beeld.",
          "Kies: eerst zelf keuren, of automatisch laten plaatsen.",
        ],
        opdracht: { tekst: "Maak een contentkalender van twee weken.", link: "/studios/social", knop: "Naar Social", check: "social" },
      },
      {
        slug: "trends",
        titel: "Trends",
        kort: "Doe mee met wat nu viral gaat, met je eigen foto.",
        punten: [
          "Bekijk eerst het origineel: zo weet je wat je krijgt.",
          "Upload je foto (soms van top tot teen) en klik op Maak na.",
          "Elke week komen er nieuwe trends bij; alles is eerst door ons getest.",
        ],
        opdracht: { tekst: "Maak een trend na met je eigen foto.", link: "/studios/trends", knop: "Naar Trends", check: "trend" },
      },
    ],
  },
  {
    nummer: 7,
    titel: "Jouw werk en je merk",
    uitleg: "Je bibliotheek, vaste personages, je huisstijl, je profiel en je team.",
    icoon: "📚",
    lessen: [
      {
        slug: "bibliotheek",
        titel: "Je bibliotheek en delen",
        kort: "Alles terugvinden, ordenen in mappen en delen met een link.",
        punten: [
          "Zoek op wat je ooit opgaf, of filter op beelden, video's en favorieten.",
          "Maak mappen per klant of per project.",
          "Delen gaat met een link: de ontvanger hoeft geen account te hebben.",
        ],
        opdracht: { tekst: "Deel iets wat je maakte met een link.", link: "/mijn-werk", knop: "Naar mijn bibliotheek", check: "gedeeld" },
      },
      {
        slug: "personages",
        titel: "Vaste personages en decors",
        kort: "Eén keer vastleggen, in alle video's hetzelfde gezicht.",
        punten: [
          "Upload een foto of laat een personage ontwerpen, in de stijl die je kiest.",
          "Je kunt ook vaste voorwerpen en omgevingen vastleggen.",
          "In de tools kies je ze daarna als hoofdpersoon.",
        ],
        opdracht: { tekst: "Leg een vast personage vast.", link: "/bibliotheek", knop: "Naar Personages & decors", check: "personage" },
      },
      {
        slug: "huisstijl",
        titel: "Je huisstijl",
        kort: "Kleuren, logo en toon, zodat alles herkenbaar van jou is.",
        punten: [
          "Leg je kleuren, logo, lettertype en manier van praten vast.",
          "Tools die tekst of een eindkaart maken, gebruiken je huisstijl.",
        ],
        opdracht: { tekst: "Maak je huisstijl aan.", link: "/brand", knop: "Naar Huisstijlen", check: "huisstijl" },
      },
      {
        slug: "profiel-team",
        titel: "Je profiel en je team",
        kort: "Laat je mooiste werk zien en werk samen uit één pot credits.",
        punten: [
          "Je profiel is een eigen openbare pagina; jij kiest welk werk erop komt.",
          "Met Pro werk je met 3 collega's, met Agency met 10, uit één pot credits.",
          "Iedereen in het team ziet elkaars werk in de bibliotheek.",
        ],
        opdracht: { tekst: "Maak je profiel aan en zet er één beeld of video op.", link: "/profiel", knop: "Naar Mijn profiel", check: "profiel" },
      },
      {
        slug: "claude",
        titel: "Animideo in Claude",
        kort: "Maak beelden en video's door het gewoon aan Claude te vragen.",
        punten: [
          "Voeg Animideo toe als connector in de Claude-app.",
          "Daarna vraag je: 'Maak met Animideo een reclamevideo voor mijn bakkerij'.",
          "Claude noemt altijd eerst wat iets kost; het komt in je bibliotheek.",
        ],
        opdracht: { tekst: "Verbind Animideo met Claude.", link: "/claude", knop: "Naar Animideo in Claude", check: "claude" },
      },
    ],
  },
];

export const ALLE_LESSEN: (Les & { hoofdstuk: Hoofdstuk })[] = HOOFDSTUKKEN.flatMap((h) => h.lessen.map((l) => ({ ...l, hoofdstuk: h })));

export function lesVan(slug: string) {
  return ALLE_LESSEN.find((l) => l.slug === slug) ?? null;
}

const OPSLAG = "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/academy";

export function videoVan(slug: string): string {
  return `${OPSLAG}/${slug}.mp4`;
}

export function posterVan(slug: string): string {
  return `${OPSLAG}/${slug}.jpg`;
}
