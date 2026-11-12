// De tekenstijlen van de Motion graphics-studio, overgenomen uit ons stijlenboek
// (~/stijlenboek, november 2026). Een stijl bestaat uit twee delen:
//  - `thema`: gegevens waarmee de bouwstenen (public/motion/kern.js) achtergrond, kleuren,
//    labels, kaarten, schaduw en de veeg in die stijl tekenen;
//  - `regels`: wat Claude moet weten om zijn eigen tekeningen in dezelfde stijl te maken.
// Zonder stijl ("standaard") verandert er niets: dat is de lichte stijl van het begin.
//
// Alleen stijlen die in platte tekeningen (SVG) kunnen. De 3D-stijlen uit het stijlenboek
// (lowpoly, blokjes, bouwstenen, klei3d, ...) en de pixelstijlen hebben een andere
// tekenmachine nodig en zitten er niet in.

export interface StijlThema {
  /** Kleuren die de vaste namen (C.inkt, C.wit, C.rood, ...) in deze stijl krijgen. */
  C: Record<string, string>;
  /** Vaste accentkleuren in plaats van de merkkleuren (de merkkleur past niet in elke stijl). */
  accent?: [string, string];
  /** Tekstkleur op een licht vlak. */
  donker: string;
  /** Vlakke kleuren: geen verloop op gekleurde vlakken. */
  vlak?: boolean;
  bg: { kleuren: [string, string, string]; extra?: "stralen" | "sterren" | "raster" | "scan" | "korrel" | "cirkels" | "wolken" | "halftoon" | "film"; stip?: string; vignet?: string; orbs?: boolean; deeltjes?: boolean };
  /** Extra filters (SVG); een filter met een id dat al bestaat (zoals 'sch', de schaduw) vervangt het bestaande. */
  defs?: string;
  /** Filter over alles wat in de scenes getekend wordt, bijvoorbeeld krijt of gloed. */
  scenesFilter?: string;
  /** Lijnen laten 'koken': het ruisfilter met dit id krijgt zoveel keer per seconde een andere korrel. */
  kook?: { id: string; fps: number };
  /** Beweging in stapjes (stop-motion). */
  fps?: number;
  pil: { fill?: string; kleur?: string; rand?: string; randDik?: number; rx?: number; glans?: boolean };
  kaart: { fill?: string; rand?: string; randDik?: number; rx?: number };
  veeg?: [string, string];
  eind?: [string, string];
  /** Alle tekst in dit gewicht, wat de code ook vraagt. */
  gewicht?: number;
}

export interface MotionStijl {
  id: string;
  naam: string;
  /** Eén regel voor de klant. */
  uitleg: string;
  /** Lettertype(s) van Google Fonts, zoals ze in het adres staan. Het eerste is het hoofdlettertype. */
  fonts: string[];
  font: string;
  thema: StijlThema;
  regels: string;
}

const GEEN_SCHADUW = `<filter id="sch"><feOffset dx="0" dy="0"/></filter>`;
const gloed = (id: string, d: number) =>
  `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${d}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const wiebel = (id: string, freq: number, schaal: number) =>
  `<filter id="${id}" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence id="${id}T" type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="1" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${schaal}" xChannelSelector="R" yChannelSelector="G"/></filter>`;

export const MOTION_STIJLEN: MotionStijl[] = [
  {
    id: "schoolbord",
    naam: "Schoolbord",
    uitleg: "Groen bord met krijt dat zichzelf tekent. Voor uitleg en 'wist je dat'.",
    fonts: ["Cabin+Sketch:wght@400;700"],
    font: "Cabin Sketch",
    thema: {
      C: { inkt: "#f4f1e6", wit: "#2a5241", geel: "#f6dc6b", rood: "#f29aa8", blauw: "#8fd0f0", groen: "#a8e0a0", oranje: "#f5b877", paars: "#c9b3f0", grijs: "#5f8271", licht: "#335f4c", muted: "#b9cdbf" },
      accent: ["#f6dc6b", "#8fd0f0"],
      donker: "#1f4033",
      vlak: true,
      bg: { kleuren: ["#2f5a48", "#274d3e", "#1f4033"], extra: "korrel", stip: "none", vignet: "#0c1f18" },
      defs:
        GEEN_SCHADUW +
        `<filter id="krijt" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d"/><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="8" result="k"/><feColorMatrix in="k" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.9" result="gaten"/><feComposite in="d" in2="gaten" operator="in"/></filter>`,
      scenesFilter: "krijt",
      pil: { fill: "none", kleur: "#f4f1e6", rand: "#f4f1e6", randDik: 4, glans: false },
      kaart: { fill: "#2a5241", rand: "#f4f1e6", randDik: 4, rx: 14 },
      veeg: ["#1f4033", "#2f5a48"],
      eind: ["#23483a", "#16302a"],
    },
    regels: `Alles is met krijt op een groen schoolbord getekend.
- Vormen zijn omlijnd, niet gevuld: fill 'none' (of hooguit een lichte vulling met fill-opacity .15), lijnen 6 tot 9 dik met ronde uiteinden.
- Kleuren: C.inkt is wit krijt (de hoofdkleur voor lijnen en tekst), C.geel, C.rood (roze krijt) en C.blauw zijn de accenten. Geen donkere tekst, geen witte vlakken.
- Laat lijnen en vormen zichzelf tekenen met draw(), alsof een hand ze trekt. Onderstreep een kernwoord met een krijtstreep, omcirkel wat belangrijk is, gebruik pijlen.
- Geen schaduwen, geen verlopen, geen glans. Rustig tempo.`,
  },
  {
    id: "lichtlijn",
    naam: "Lichtlijn",
    uitleg: "Zwart met lichtgevende lijnen en amber cijfers. Voor techniek en wetenschap.",
    fonts: ["Orbitron:wght@500;600;700;800"],
    font: "Orbitron",
    thema: {
      C: { inkt: "#dff6ff", wit: "#0a1220", blauw: "#35e0ff", geel: "#ffb52e", oranje: "#ff8a1f", groen: "#3dffb0", rood: "#ff4d6d", paars: "#9d7bff", grijs: "#1c2a3d", licht: "#0e1828", muted: "#7d93ad" },
      accent: ["#35e0ff", "#ffb52e"],
      donker: "#05070d",
      vlak: true,
      bg: { kleuren: ["#070b16", "#05070d", "#02030a"], stip: "#35e0ff", vignet: "#000000", deeltjes: true },
      defs: GEEN_SCHADUW + gloed("licht", 6),
      scenesFilter: "licht",
      pil: { fill: "#0a1220", kleur: "#dff6ff", rand: "#35e0ff", randDik: 2.5, rx: 0.2, glans: false },
      kaart: { fill: "#0a1422", rand: "#35e0ff", randDik: 2, rx: 10 },
      veeg: ["#35e0ff", "#ffb52e"],
      eind: ["#0a1220", "#02030a"],
    },
    regels: `Lichtgevende draadmodellen op zwart.
- Teken dingen als lijntekening: fill 'none', lijnen 4 tot 6 dik in C.blauw (cyaan). Een bol is een draadmodel met breedte- en lengtelijnen, een gebouw een omtrek met raamlijnen.
- Cijfers en het ene kernwoord groot in C.geel (amber); laat ze bij het verschijnen twee keer kort flikkeren (opacity in stapjes). Overige tekst C.inkt, in hoofdletters met letter-spacing 4 tot 8.
- Donkere panelen mogen (C.wit), nooit lichte vlakken. Geen schaduwen; de gloed komt vanzelf.`,
  },
  {
    id: "strip",
    naam: "Strip",
    uitleg: "Stripboek: dikke inkt, zonnestralen en knalvormen. Voor humor en verrassende feiten.",
    fonts: ["Bangers"],
    font: "Bangers",
    thema: {
      C: { inkt: "#111111", wit: "#ffffff", rood: "#ef3b2d", blauw: "#2f9bea", geel: "#ffe14d", oranje: "#ff8a1f", groen: "#3fc66b", paars: "#7a4fd6", grijs: "#e9e2c8", licht: "#fff6d6", muted: "#4a4a4a" },
      donker: "#111111",
      vlak: true,
      bg: { kleuren: ["#ffd84a", "#ffd23f", "#ffc21f"], extra: "stralen", stip: "#c98a00", vignet: "none" },
      defs: `<filter id="sch" x="-20%" y="-30%" width="150%" height="180%"><feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#111111" flood-opacity="1"/></filter>`,
      pil: { rand: "#111111", randDik: 6, rx: 0.16, glans: false },
      kaart: { rand: "#111111", randDik: 7, rx: 8 },
      eind: ["#1d2f6f", "#111a44"],
    },
    regels: `Een stripboek.
- Alles heeft een dikke zwarte omlijning: stroke C.inkt, 7 tot 9 dik, hoeken rond (stroke-linejoin round). Vlakken in felle, vlakke kleuren: C.rood, C.blauw, C.geel, C.groen.
- Zet beelden in panelen (kaart()) die een paar graden gedraaid staan. Achter een kernwoord of getal komt een knalvorm: een stervormige polygon in C.rood of C.geel met zwarte rand.
- Alles komt binnen met een plof (pop()), tekst in hoofdletters, licht schuin (rotate -4). Snel en speels.`,
  },
  {
    id: "plat",
    naam: "Plat",
    uitleg: "Crème met vlakke pastelvormen die verend binnenkomen. Voor uitleg, cijfers en merken.",
    fonts: ["Poppins:wght@500;600;700;800"],
    font: "Poppins",
    thema: {
      C: { inkt: "#1f2a44", wit: "#ffffff", rood: "#ff6b5e", geel: "#f2b632", groen: "#3ec9b0", blauw: "#4a7bd0", oranje: "#ff9a52", paars: "#8a6fd1", grijs: "#e2d9c8", licht: "#faf6ee", muted: "#6f7688" },
      donker: "#1f2a44",
      vlak: true,
      bg: { kleuren: ["#f6f1e8", "#f4efe6", "#efe8da"], extra: "cirkels", stip: "none", vignet: "none" },
      defs: GEEN_SCHADUW,
      pil: { fill: "#1f2a44", kleur: "#ffffff", glans: false },
      kaart: { rx: 28 },
      eind: ["#1f2a44", "#151d33"],
    },
    regels: `Vlakke pastelillustratie.
- Vormen zijn vlak gevuld, zonder omlijning, zonder schaduw en zonder verloop: C.rood (koraal), C.geel (mosterd), C.groen (mint), C.blauw en C.inkt (navy), naast de merkkleur C.accent.
- Bouw dingen op uit eenvoudige ronde vormen (cirkels, afgeronde rechthoeken). Alles komt verend binnen (pop()/back). Labels zijn pillen.
- Veel lucht om de vormen, één ding tegelijk in het midden.`,
  },
  {
    id: "blauwdruk",
    naam: "Blauwdruk",
    uitleg: "Technische tekening met raster en maatlijnen. Voor 'hoe werkt het', techniek en bouw.",
    fonts: ["Space+Mono:wght@400;700"],
    font: "Space Mono",
    thema: {
      C: { inkt: "#eaf2ff", wit: "#1d4a9c", geel: "#ffe27a", blauw: "#9cc7ff", rood: "#ff9c8a", groen: "#9ff0c8", oranje: "#ffc48a", paars: "#c9b8ff", grijs: "#3f68b5", licht: "#2a5ab0", muted: "#a9c1ea" },
      accent: ["#ffe27a", "#eaf2ff"],
      donker: "#173d85",
      vlak: true,
      bg: { kleuren: ["#2458b3", "#1d4a9c", "#173d85"], extra: "raster", stip: "none", vignet: "#0a1f4a" },
      defs: GEEN_SCHADUW,
      pil: { fill: "#1d4a9c", kleur: "#eaf2ff", rand: "#eaf2ff", randDik: 3, rx: 0.08, glans: false },
      kaart: { fill: "#1d4a9c", rand: "#eaf2ff", randDik: 3, rx: 4 },
      veeg: ["#eaf2ff", "#173d85"],
      eind: ["#173d85", "#0d2a61"],
    },
    regels: `Een technische tekening (blauwdruk).
- Alles is een dunne witte lijn: fill 'none', stroke C.inkt, 3 tot 4 dik. Hulplijnen gestippeld (stroke-dasharray). Lijnen trekken zich met draw().
- Zet er maatlijnen bij met pijltjes en een maat of getal, een kruisdraad door het midden van ronde vormen, en kleine labels als "FIG. 01".
- Tekst in hoofdletters, klein en met letter-spacing; alleen het kernwoord of getal groot en in C.geel. Geen gevulde gekleurde vlakken, geen schaduw. Precies en rustig.`,
  },
  {
    id: "nacht",
    naam: "Nacht",
    uitleg: "Zwart, sierlijke letter, één warm accent en veel rust. Voor verhalen, citaten en mindset.",
    fonts: ["Instrument+Serif:ital@0;1"],
    font: "Instrument Serif",
    thema: {
      C: { inkt: "#efe9dd", wit: "#151517", geel: "#e3a857", oranje: "#d98b4a", rood: "#c96a5a", groen: "#9db39a", blauw: "#9aa9c4", paars: "#a99ac4", grijs: "#2a2a2e", licht: "#1a1a1d", muted: "#8d8a84" },
      accent: ["#e3a857", "#efe9dd"],
      donker: "#0c0c0e",
      vlak: true,
      bg: { kleuren: ["#131316", "#0d0d0f", "#060607"], extra: "korrel", stip: "none", vignet: "#000000" },
      defs: GEEN_SCHADUW,
      pil: { fill: "none", kleur: "#efe9dd", rand: "#8d8a84", randDik: 1.5, glans: false },
      kaart: { fill: "#151517", rand: "#3a3a3e", randDik: 1.5, rx: 6 },
      veeg: ["#060607", "#131316"],
      eind: ["#131316", "#060607"],
      gewicht: 400,
    },
    regels: `Donker en stil, als een filmtitel.
- Veel lege ruimte: één ding tegelijk in beeld, klein en precies in het midden of op een derde.
- Dunne lijnen (2 tot 3) in C.inkt; één warm accent, C.accent (amber), voor het ene ding waar het om gaat. Verder geen kleur.
- Schreefletter; het kernwoord cursief (font-style italic) en groter. Kleine bijschriften in hoofdletters met letter-spacing 6.
- Alles vervaagt traag binnen (eo over 0,8 s of langer); niets ploft of veert.`,
  },
  {
    id: "knipsel",
    naam: "Knipsel",
    uitleg: "Uitgeknipt papier in stop-motion. Voor verhalen en geschiedenis.",
    fonts: ["Archivo+Black", "Special+Elite"],
    font: "Archivo Black",
    thema: {
      C: { inkt: "#1d1d1b", wit: "#fbf6ea", rood: "#d8452e", blauw: "#2f5f8f", geel: "#e8a93a", groen: "#5c8a4f", oranje: "#e07b39", paars: "#7a5a8c", grijs: "#cdbf9f", licht: "#f3ead4", muted: "#6a6253" },
      donker: "#1d1d1b",
      vlak: true,
      bg: { kleuren: ["#eee2c8", "#e9dcc0", "#decfae"], extra: "korrel", stip: "none", vignet: "#5a4a2a" },
      defs:
        `<filter id="sch" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="4" dy="7" stdDeviation="2.5" flood-color="#2a1d08" flood-opacity=".38"/></filter>` +
        wiebel("rafel", 0.035, 5),
      scenesFilter: "rafel",
      kook: { id: "rafelT", fps: 6 },
      fps: 12,
      pil: { fill: "#1d1d1b", kleur: "#fbf6ea", rx: 0.06, glans: false },
      kaart: { fill: "#fbf6ea", rx: 4 },
      eind: ["#2a2420", "#171310"],
    },
    regels: `Uitgeknipt papier, gefilmd in stop-motion.
- Alles is een stuk papier: vlakke vormen met hoekige, iets scheve randen (polygonen in plaats van perfecte cirkels en rechthoeken), elk met filter 'url(#sch)' zodat het los op de ondergrond ligt. Leg vormen over elkaar in lagen.
- Tekst staat op gescheurde stroken papier (een kaart() of polygon in C.wit, C.inkt of een kleur) die een paar graden gedraaid liggen. Bijschriften mogen in font-family 'Special Elite' (typemachine).
- Kleuren: C.rood, C.blauw, C.geel, C.groen naast de merkkleur. Geen verloop, geen glans.
- Dingen worden neergelegd of schuiven in rechte lijnen binnen; geen vloeiend veren.`,
  },
  {
    id: "hologram",
    naam: "Hologram",
    uitleg: "Cyaan projectie met scanlijnen. Voor tech, toekomst en analyse.",
    fonts: ["Rajdhani:wght@500;600;700"],
    font: "Rajdhani",
    thema: {
      C: { inkt: "#c9f6ff", wit: "#06182a", blauw: "#39d8ff", groen: "#5cffd0", geel: "#ffe066", rood: "#ff5c7a", oranje: "#ffa94d", paars: "#8f8cff", grijs: "#12334a", licht: "#0a2236", muted: "#6fa3b8" },
      accent: ["#39d8ff", "#5cffd0"],
      donker: "#020b14",
      vlak: true,
      bg: { kleuren: ["#04121f", "#020b14", "#01060c"], extra: "scan", stip: "#39d8ff", vignet: "#000000", deeltjes: true },
      defs: GEEN_SCHADUW + gloed("holo", 5),
      scenesFilter: "holo",
      pil: { fill: "#06182a", kleur: "#c9f6ff", rand: "#39d8ff", randDik: 2, rx: 0.12, glans: false },
      kaart: { fill: "#071c30", rand: "#39d8ff", randDik: 2, rx: 6 },
      veeg: ["#39d8ff", "#5cffd0"],
      eind: ["#06182a", "#01060c"],
    },
    regels: `Een hologram uit een projector.
- Vormen zijn van licht: lijnen 3 tot 5 dik in C.blauw (cyaan), vlakken halfdoorzichtig (fill C.blauw met fill-opacity .12 tot .3) met een lichte rand. Niets is massief.
- Dingen materialiseren van onder naar boven (een clipPath of schaal die omhoog loopt) terwijl er een scanbalk overheen gaat. Zet HUD-details om het onderwerp: hoekjes, een ring met streepjes, kleine meetwaarden.
- Tekst in hoofdletters met letter-spacing; het getal of kernwoord groot in C.groen of C.geel.`,
  },
  {
    id: "neon",
    naam: "Neon",
    uitleg: "Roze en cyaan neonbuizen in het donker. Voor nachtleven, games en lef.",
    fonts: ["Oxanium:wght@500;600;700;800"],
    font: "Oxanium",
    thema: {
      C: { inkt: "#ffe9fb", wit: "#150a24", rood: "#ff3d9a", blauw: "#2de2ff", geel: "#ffe14d", groen: "#4dffb8", oranje: "#ff8a3d", paars: "#b56bff", grijs: "#2a1740", licht: "#1c0d30", muted: "#a58cc0" },
      accent: ["#ff3d9a", "#2de2ff"],
      donker: "#0d0518",
      vlak: true,
      bg: { kleuren: ["#190a2c", "#0f061c", "#07020f"], stip: "#ff3d9a", vignet: "#000000", deeltjes: true },
      defs: GEEN_SCHADUW + gloed("buis", 9),
      scenesFilter: "buis",
      pil: { fill: "none", kleur: "#ffe9fb", rand: "#ff3d9a", randDik: 5, glans: false },
      kaart: { fill: "#150a24", rand: "#2de2ff", randDik: 4, rx: 22 },
      veeg: ["#ff3d9a", "#2de2ff"],
      eind: ["#1c0d30", "#07020f"],
    },
    regels: `Neonreclame in de nacht.
- Alles is een neonbuis: fill 'none', lijnen 6 tot 8 dik met ronde uiteinden, afwisselend C.rood (roze) en C.blauw (cyaan), met C.geel voor het kernwoord. Teken dingen als doorlopende buislijn, zoals een uithangbord.
- Een buis gaat aan met een flikker: opacity 0, 1, .3, 1 in korte stapjes binnen 0,4 s. Daarna brandt hij rustig.
- Geen gevulde lichte vlakken; donkere borden (C.wit) mogen. De gloed komt vanzelf.`,
  },
  {
    id: "stickman",
    naam: "Pentekening",
    uitleg: "Zwarte pen op papier met lijntjespoppetjes en één oranje accent. Voor humor en alledaagse uitleg.",
    fonts: ["Patrick+Hand"],
    font: "Patrick Hand",
    thema: {
      C: { inkt: "#1b1b1b", wit: "#fffaf0", oranje: "#f07a1a", rood: "#f07a1a", geel: "#f07a1a", groen: "#1b1b1b", blauw: "#1b1b1b", paars: "#1b1b1b", grijs: "#d9d0bb", licht: "#fbf5e6", muted: "#6b665c" },
      accent: ["#f07a1a", "#1b1b1b"],
      donker: "#1b1b1b",
      vlak: true,
      bg: { kleuren: ["#f8f2e3", "#f6f0e1", "#efe7d3"], extra: "korrel", stip: "none", vignet: "none" },
      defs: GEEN_SCHADUW + wiebel("pen", 0.03, 4),
      scenesFilter: "pen",
      kook: { id: "penT", fps: 8 },
      pil: { fill: "#fffaf0", kleur: "#1b1b1b", rand: "#1b1b1b", randDik: 4, glans: false },
      kaart: { fill: "#fffaf0", rand: "#1b1b1b", randDik: 4, rx: 10 },
      veeg: ["#1b1b1b", "#f07a1a"],
      eind: ["#262320", "#141210"],
      gewicht: 400,
    },
    regels: `Een pentekening op papier.
- Alles is zwarte lijn: fill 'none' (of C.wit om iets af te dekken), stroke C.inkt, 5 tot 6 dik met ronde uiteinden. Schaduw en grond geef je aan met arcering (een paar schuine streepjes).
- Mensen zijn lijntjespoppetjes: een cirkel als hoofd, lijnen als lijf, armen en benen, met een houding die iets zegt (schouders ophalen, wijzen, juichen) en eventueel een "?", "!" of "zzz" erboven. Gebruik persoon() niet.
- Eén accentkleur: C.oranje, alleen voor het ene ding waar de scene om draait. Verder geen kleur.
- Lijnen tekenen zich met draw(). Tekst is handschrift, niet in hoofdletters.`,
  },
  {
    id: "minimaal",
    naam: "Minimaal",
    uitleg: "Dunne witte lijnen op zwart, geen kleur. Voor zakelijk, mindset en één helder idee.",
    fonts: ["Inter:wght@300;400;500"],
    font: "Inter",
    thema: {
      C: { inkt: "#f2f2f2", wit: "#0c0c0c", groen: "#f2f2f2", rood: "#f2f2f2", geel: "#f2f2f2", oranje: "#f2f2f2", blauw: "#f2f2f2", paars: "#f2f2f2", grijs: "#3a3a3a", licht: "#161616", muted: "#8f8f8f" },
      accent: ["#f2f2f2", "#8f8f8f"],
      donker: "#050505",
      vlak: true,
      bg: { kleuren: ["#0a0a0a", "#050505", "#020202"], stip: "#ffffff", vignet: "#000000" },
      defs: GEEN_SCHADUW + gloed("zweem", 3),
      scenesFilter: "zweem",
      pil: { fill: "none", kleur: "#f2f2f2", rand: "#f2f2f2", randDik: 1.5, glans: false },
      kaart: { fill: "#0c0c0c", rand: "#f2f2f2", randDik: 1.5, rx: 4 },
      veeg: ["#f2f2f2", "#3a3a3a"],
      eind: ["#0c0c0c", "#020202"],
      gewicht: 300,
    },
    regels: `Uiterst minimaal: dunne witte lijnen op zwart.
- Alleen lijn: fill 'none', stroke C.inkt, 2 dik. Geen kleur, geen vlakken, geen iconen met vulling. Een mens is een lijnfiguur zonder gezicht (gebruik persoon() niet).
- Eén idee per scene, klein in het midden, met veel zwart eromheen. Lijnen tekenen zich rustig met draw().
- Tekst klein en dun, in hoofdletters met letter-spacing 6 tot 10; alleen het getal of kernwoord groot. Niets ploft of veert.`,
  },
  {
    id: "ruimte",
    naam: "Ruimte",
    uitleg: "Paarsblauwe sterrenhemel met vlakke, ronde vormen. Voor wetenschap en 'wist je dat'.",
    fonts: ["Nunito:wght@600;700;800;900"],
    font: "Nunito",
    thema: {
      C: { inkt: "#ffffff", wit: "#2a2075", blauw: "#37d6c8", geel: "#ffd84d", rood: "#ff6b8a", oranje: "#ff9d4d", groen: "#5be3a0", paars: "#9a7bff", grijs: "#3a2f8a", licht: "#2f2580", muted: "#b6aee6" },
      accent: ["#37d6c8", "#ffd84d"],
      donker: "#1a1147",
      vlak: true,
      bg: { kleuren: ["#2a1f73", "#1d1452", "#0f0a33"], extra: "sterren", stip: "none", vignet: "#05021a" },
      defs: GEEN_SCHADUW,
      pil: { fill: "#ffd84d", kleur: "#1a1147", glans: false },
      kaart: { fill: "#2a2075", rand: "#4a3fb0", randDik: 3, rx: 30 },
      veeg: ["#37d6c8", "#ffd84d"],
      eind: ["#241a66", "#0f0a33"],
    },
    regels: `Vlakke vectorkunst in de ruimte.
- Ronde, vlakke vormen zonder omlijning: planeten en bollen met een donkerdere schaduwsikkel aan één kant, C.blauw (turquoise), C.rood, C.oranje, C.paars. Geen verloop, geen schaduw.
- Ook een aards onderwerp teken je in deze wereld: op de bolling van een planeet onderin, of zwevend tussen de sterren.
- Tekst wit, rond en vet; het kernwoord in C.geel.`,
  },
  // ── Cartoonstijlen ──────────────────────────────────────────────────────────────────
  {
    id: "tekenfilm",
    naam: "Tekenfilm",
    uitleg: "Vrolijke tekenfilm: blauwe lucht, bolle vormen en figuurtjes met grote ogen. Voor alles wat luchtig mag.",
    fonts: ["Baloo+2:wght@500;600;700;800"],
    font: "Baloo 2",
    thema: {
      C: { inkt: "#2b2350", wit: "#ffffff", rood: "#ff5a5f", blauw: "#3fa9f5", geel: "#ffd23f", oranje: "#ff9a3c", groen: "#5ccf6b", paars: "#9b6bf2", grijs: "#d7e6f5", licht: "#f2f9ff", muted: "#5d5a80" },
      donker: "#2b2350",
      vlak: true,
      bg: { kleuren: ["#8fdcff", "#b5e9ff", "#e3f7ff"], extra: "wolken", stip: "none", vignet: "none" },
      defs: `<filter id="sch" x="-20%" y="-30%" width="150%" height="180%"><feDropShadow dx="6" dy="6" stdDeviation="0" flood-color="#2b2350" flood-opacity="1"/></filter>`,
      pil: { rand: "#2b2350", randDik: 5, glans: false },
      kaart: { rand: "#2b2350", randDik: 6, rx: 36 },
      eind: ["#3a2f7a", "#231c52"],
    },
    regels: `Een vrolijke tekenfilm, zoals op zaterdagochtend.
- Alles heeft een dikke, donkerpaarse omlijning: stroke C.inkt, 6 tot 8 dik, stroke-linejoin en stroke-linecap round. Vormen zijn bol en rond, nooit strak of hoekig; vlakke, vrolijke kleuren (C.rood, C.blauw, C.geel, C.groen, C.oranje).
- Geef elke gekleurde vorm één schaduwvlak: dezelfde vorm, iets donkerder, aan de rechteronderkant. En één wit glimlichtje linksboven.
- Dingen mogen een gezicht hebben: twee grote witte ogen met zwarte pupil en een glimlichtje, een lachend mondje. Teken mensen zelf als tekenfilmfiguur (groot rond hoofd, klein lijf, grote ogen) in plaats van persoon(). Verzonnen figuren, nooit bestaande tekenfilmfiguren.
- Onderin mag een groene heuvel of een straat liggen waar de dingen op staan (C.groen met omlijning).
- Beweging: alles komt binnen met een plof en veert na (pop()), en wat stilstaat deint zachtjes mee (golf()). Rek en krimp bij landen en springen.`,
  },
  {
    id: "jaren30",
    naam: "Oude tekenfilm",
    uitleg: "Tekenfilm uit de jaren dertig: sepia, slangenarmen, alles deint mee, met filmkorrel en krasjes. Voor humor en 'vroeger'.",
    fonts: ["Chelsea+Market"],
    font: "Chelsea Market",
    thema: {
      C: { inkt: "#1f170e", wit: "#f6ead0", rood: "#8a5a36", blauw: "#6d6654", geel: "#e3c98f", oranje: "#b98a55", groen: "#857a5c", paars: "#5c4a3a", grijs: "#cdb98f", licht: "#ecdcb8", muted: "#5b4a34" },
      accent: ["#1f170e", "#8a5a36"],
      donker: "#1f170e",
      vlak: true,
      bg: { kleuren: ["#ecdcb6", "#e2cfa3", "#d0b884"], extra: "film", stip: "none", vignet: "#1a0f02" },
      defs: GEEN_SCHADUW + wiebel("beef", 0.02, 4),
      scenesFilter: "beef",
      kook: { id: "beefT", fps: 6 },
      fps: 12,
      pil: { fill: "#1f170e", kleur: "#f6ead0", glans: false },
      kaart: { fill: "#f6ead0", rand: "#1f170e", randDik: 7, rx: 26 },
      veeg: ["#1f170e", "#8a5a36"],
      eind: ["#2a1e10", "#120c05"],
    },
    regels: `Een tekenfilm uit de jaren dertig, in sepia.
- Alleen bruintinten: C.inkt (bijna zwart) voor lijnen en donkere vlakken, C.wit (crème) voor lichte vlakken, C.geel, C.oranje en C.rood als tussentinten. Geen andere kleur, ook niet de merkkleur.
- Dikke zwarte omlijning (stroke C.inkt, 7 tot 9, rond). Figuren hebben een zwart lijf, een crème gezicht, witte handschoenen en 'taartpunt-ogen' (zwart ovaal met een uitgesneden wigje). Armen en benen zijn slangen: gebogen lijnen zonder ellebogen of knieën (stroke 14 tot 18, rond). Ook dingen (zon, huis, auto, munt) krijgen een gezicht. Teken figuren zelf, gebruik persoon() niet; verzonnen figuren, nooit bestaande tekenfilmfiguren.
- Alles deint onafgebroken op de maat: laat elke figuur en elk ding op en neer veren met golf(tt, 2, ...) (twee keer per seconde), figuren iets door de knieën.
- Tekst in titelkaarten: een zwarte kaart met crème letters en een dun crème kader, zoals bij een stomme film.
- Geen verloop, geen glans, geen schaduw.`,
  },
  {
    id: "anime",
    naam: "Anime",
    uitleg: "Japanse tekenfilm: strakke inktlijnen, harde schaduw, felle lucht en actielijnen. Voor drama en verrassing.",
    fonts: ["Dela+Gothic+One", "M+PLUS+Rounded+1c:wght@500;700;800"],
    font: "M PLUS Rounded 1c",
    thema: {
      C: { inkt: "#1a1a2e", wit: "#ffffff", rood: "#ff4d6d", blauw: "#3b82f6", geel: "#ffd43b", oranje: "#ff8c42", groen: "#38c172", paars: "#8b5cf6", grijs: "#d5e3f5", licht: "#eef6ff", muted: "#4b5578" },
      donker: "#1a1a2e",
      vlak: true,
      bg: { kleuren: ["#3d8bf2", "#7cc0ff", "#d6f0ff"], extra: "wolken", stip: "none", vignet: "none" },
      defs: `<filter id="sch" x="-20%" y="-30%" width="150%" height="180%"><feDropShadow dx="5" dy="5" stdDeviation="0" flood-color="#1a1a2e" flood-opacity="1"/></filter>`,
      pil: { rand: "#1a1a2e", randDik: 4, rx: 0.12, glans: false },
      kaart: { rand: "#1a1a2e", randDik: 5, rx: 10 },
      veeg: ["#ff4d6d", "#ffd43b"],
      eind: ["#1f2a5c", "#0f1533"],
    },
    regels: `Anime: een Japanse tekenfilm.
- Strakke, dunne inktlijn om alles: stroke C.inkt, 4 tot 5 dik. Vlakke kleuren met precies één hardere schaduwtint per kleur (cel-schaduw): een scherp afgesneden donkerder vlak aan één kant, geen verloop. Eén wit glimstreepje op glanzende dingen.
- Figuren teken je zelf (gebruik persoon() niet): groot hoofd, puntig haar in één kleur met een glansstreep, grote ogen met een gekleurde iris en twee witte glimpunten, klein neusje en mondje. Verzonnen figuren, nooit bestaande anime-figuren.
- Bij het belangrijkste moment van een scene: actielijnen (dunne lijnen die vanuit de rand naar het midden wijzen), een korte schok (het beeld schudt 0,3 s) en een uitroep als "!?" of "!!" in font-family 'Dela Gothic One'. Hooguit één keer per scene.
- Koppen en getallen in font-family 'Dela Gothic One', wit of C.geel met een donkere rand (stroke C.inkt, 8, paint-order stroke). Overige tekst in het gewone lettertype.
- Beweging: snel erin, dan stil; korte zoom op het kernbeeld. Geen zacht deinen.`,
  },
  {
    id: "noir",
    naam: "Zwart-wit strip",
    uitleg: "Zwart-wit stripboek met rasterpuntjes en één rode kleur. Voor mysterie, misdaad en drama.",
    fonts: ["Bangers", "Special+Elite"],
    font: "Bangers",
    thema: {
      C: { inkt: "#0d0d0d", wit: "#ffffff", rood: "#e0271b", blauw: "#3a3a3a", geel: "#ffffff", oranje: "#8c8c8c", groen: "#5e5e5e", paars: "#2a2a2a", grijs: "#bdbdbd", licht: "#ececec", muted: "#444444" },
      accent: ["#e0271b", "#0d0d0d"],
      donker: "#0d0d0d",
      vlak: true,
      bg: { kleuren: ["#f4f4f4", "#e6e6e6", "#cfcfcf"], extra: "halftoon", stip: "#000000", vignet: "#000000" },
      defs: `<filter id="sch" x="-20%" y="-30%" width="150%" height="180%"><feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#0d0d0d" flood-opacity="1"/></filter>`,
      fps: 12,
      pil: { fill: "#0d0d0d", kleur: "#ffffff", rx: 0.08, glans: false },
      kaart: { fill: "#ffffff", rand: "#0d0d0d", randDik: 8, rx: 4 },
      veeg: ["#0d0d0d", "#e0271b"],
      eind: ["#161616", "#000000"],
    },
    regels: `Een zwart-wit stripboek (film noir) met één rode kleur.
- Alleen zwart (C.inkt), wit (C.wit) en grijs (C.grijs, C.oranje, C.groen zijn hier grijstinten). C.rood is de enige kleur en komt per scene precies één keer voor: op het ding waar het om draait. Geen merkkleur.
- Grote zwarte vlakken en harde schaduwen: de helft van een figuur of gebouw mag gewoon zwart zijn. Dikke omlijning (stroke C.inkt, 8 tot 10). Silhouetten (een stad, een figuur met hoed en lange jas, een lantaarnpaal) werken beter dan details. Teken figuren zelf, gebruik persoon() niet.
- Zet beelden in panelen: witte kaart() met dikke zwarte rand, strak naast of schuin over elkaar. Schuine lichtbanen (witte stroken met opacity .5) alsof er licht door een luxaflex valt.
- Koppen in hoofdletters, wit op een zwarte strook of zwart op wit. Bijschriften in font-family 'Special Elite' (typemachine) op een klein wit vlakje met zwarte rand, zoals een tekstkader in een strip.
- Beweging: panelen schuiven hard in beeld of klappen erin; geen zacht veren.`,
  },
  {
    id: "prentenboek",
    naam: "Prentenboek",
    uitleg: "Kinderboek: zachte kleuren, wiebelige potloodlijn en lieve figuurtjes. Voor kinderen en warme verhalen.",
    fonts: ["Patrick+Hand", "Fredoka:wght@500;600;700"],
    font: "Fredoka",
    thema: {
      C: { inkt: "#4a3b32", wit: "#fffaf0", rood: "#f08a7b", blauw: "#8cc7e8", geel: "#f9d977", oranje: "#f5b06b", groen: "#a5d49a", paars: "#c3a6e0", grijs: "#e6dcc8", licht: "#fbf3e0", muted: "#7d6a5c" },
      donker: "#4a3b32",
      vlak: true,
      bg: { kleuren: ["#fdf3dc", "#fbeccb", "#f6dfb4"], extra: "korrel", stip: "none", vignet: "#b08a4a" },
      defs: GEEN_SCHADUW + wiebel("potlood", 0.03, 5),
      scenesFilter: "potlood",
      kook: { id: "potloodT", fps: 4 },
      pil: { fill: "#fffaf0", kleur: "#4a3b32", rand: "#4a3b32", randDik: 4, glans: false },
      kaart: { fill: "#fffaf0", rand: "#4a3b32", randDik: 4, rx: 30 },
      eind: ["#5a4638", "#3a2c22"],
    },
    regels: `Een prentenboek voor kinderen, met potlood en krijt getekend.
- Zachte pastelkleuren (C.rood is zacht koraal, C.blauw lichtblauw, C.geel, C.groen, C.paars) met een warmbruine potloodlijn eromheen: stroke C.inkt, 4 tot 5 dik, rond. De kleur mag iets buiten of binnen de lijn vallen (verschuif het kleurvlak een paar pixels ten opzichte van de omlijning), zoals bij inkleuren.
- Alles is rond en lief: dieren, huisjes, bomen, een zon met stralen en een gezicht. Figuren teken je zelf (gebruik persoon() niet): rond hoofd, twee stipjes als ogen, blosjes (roze cirkeltjes met opacity .5), een klein lachje. Verzonnen figuren, nooit bestaande.
- Onderin een zachte heuvel of grond waar alles op staat; kleine details eromheen (bloemetjes, sterretjes, wolkjes).
- Tekst in gewone letters, niet in hoofdletters; korte bijschriften mogen in font-family 'Patrick Hand' (handschrift).
- Beweging rustig en zacht: dingen groeien of wandelen in beeld, deinen licht (golf()); niets knalt of schudt.`,
  },
];

export const stijlVan = (id?: string | null): MotionStijl | null => MOTION_STIJLEN.find((s) => s.id === id) ?? null;
