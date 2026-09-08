// GEGENEREERD BESTAND — niet met de hand aanpassen.
// Gemaakt door scripts/build-assets.mjs uit lib/infographics/assets/.
// Nieuw asset? Zet het .svg-bestand erbij, voeg een regel toe aan
// manifest.json en draai `npm run assets`.

export interface BestandAsset {
  sleutel: string;
  omschrijving: string;
  categorie: string;
  maat: number;
  zweeft: boolean;
  /** SVG-inhoud op een vak van 100×100, met plaatshouderkleuren. */
  inhoud: string;
}

export const BESTAND_ASSETS: BestandAsset[] = [
  {
    "sleutel": "kaart",
    "omschrijving": "Nederland, het hele land, landelijk, alle gemeenten",
    "categorie": "decor",
    "maat": 3,
    "zweeft": true,
    "inhoud": "<path fill=\"#00ffff\" d=\"M26 25 L34 22 L42 20 L52 16 L61 13 L72 12 L78 18 L77 26 L80 33 L74 40 L77 46 L71 52 L74 58 L69 64 L72 72 L66 85 L61 92 L57 86 L61 74 L55 70 L47 72 L39 70 L33 72 L28 68 L20 70 L26 64 L17 63 L24 58 L22 48 L24 38 L23 30 Z\"/>\n  <path fill=\"#eeeeee\" d=\"M43 22 L53 25 L55 34 L47 39 L41 32 Z\"/>\n  <ellipse fill=\"#00ffff\" cx=\"36\" cy=\"18\" rx=\"5\" ry=\"1.6\" transform=\"rotate(-16 36 18)\"/>\n  <ellipse fill=\"#00ffff\" cx=\"47\" cy=\"13\" rx=\"4.4\" ry=\"1.5\" transform=\"rotate(-10 47 13)\"/>\n  <ellipse fill=\"#00ffff\" cx=\"58\" cy=\"10\" rx=\"3.8\" ry=\"1.4\" transform=\"rotate(-5 58 10)\"/>"
  },
  {
    "sleutel": "windturbine",
    "omschrijving": "windmolen, duurzame energie, klimaat, stroom",
    "categorie": "gebouw",
    "maat": 15,
    "zweeft": false,
    "inhoud": "<rect fill=\"#ffffff\" x=\"46\" y=\"30\" width=\"8\" height=\"66\" rx=\"4\"/>\n  <rect fill=\"#eeeeee\" x=\"40\" y=\"94\" width=\"20\" height=\"5\" rx=\"2.5\"/>\n  <g fill=\"#ffffff\">\n    <path d=\"M50 30 L54 4 L46 4 Z\"/>\n    <path d=\"M50 30 L74 44 L78 37 Z\" transform=\"rotate(0 50 30)\"/>\n    <path d=\"M50 30 L26 44 L22 37 Z\"/>\n  </g>\n  <circle fill=\"#00ffff\" cx=\"50\" cy=\"30\" r=\"5\"/>"
  },
  {
    "sleutel": "spreekgestoelte",
    "omschrijving": "debat, Tweede Kamer, toespraak, verantwoording afleggen",
    "categorie": "object",
    "maat": 1.3,
    "zweeft": false,
    "inhoud": "<path fill=\"#ffff00\" d=\"M30 44 L70 44 L64 96 L36 96 Z\"/>\n  <rect fill=\"#ff00ff\" x=\"26\" y=\"38\" width=\"48\" height=\"8\" rx=\"2\"/>\n  <rect fill=\"#eeeeee\" x=\"40\" y=\"58\" width=\"20\" height=\"14\" rx=\"1\"/>\n  <path fill=\"#ff00ff\" d=\"M52 38 C52 26 64 24 68 18 L71 21 C66 27 56 29 56 38 Z\"/>\n  <rect fill=\"#ff00ff\" x=\"64\" y=\"12\" width=\"10\" height=\"8\" rx=\"4\"/>"
  },
  {
    "sleutel": "standbeeld",
    "omschrijving": "cultuur, erfgoed, monument, geschiedenis",
    "categorie": "object",
    "maat": 3.5,
    "zweeft": false,
    "inhoud": "<rect fill=\"#eeeeee\" x=\"30\" y=\"72\" width=\"40\" height=\"10\" rx=\"2\"/>\n  <rect fill=\"#eeeeee\" x=\"34\" y=\"82\" width=\"32\" height=\"14\" rx=\"2\"/>\n  <circle fill=\"#eeeeee\" cx=\"50\" cy=\"18\" r=\"9\"/>\n  <path fill=\"#eeeeee\" d=\"M38 72 L38 36 a12 12 0 0 1 24 0 L62 72 Z\"/>\n  <path fill=\"#eeeeee\" d=\"M62 40 L74 30 L78 35 L64 48 Z\"/>"
  },
  {
    "sleutel": "kwast",
    "omschrijving": "kunst, cultuur, creatieve sector",
    "categorie": "object",
    "maat": 0.4,
    "zweeft": false,
    "inhoud": "<rect fill=\"#ff8800\" x=\"42\" y=\"6\" width=\"16\" height=\"46\" rx=\"8\"/>\n  <rect fill=\"#eeeeee\" x=\"39\" y=\"50\" width=\"22\" height=\"12\" rx=\"3\"/>\n  <path fill=\"#ff00ff\" d=\"M39 62 L61 62 L57 84 a12 12 0 0 1 -16 0 Z\"/>\n  <ellipse fill=\"#00ffff\" cx=\"50\" cy=\"92\" rx=\"18\" ry=\"6\"/>"
  },
  {
    "sleutel": "muzieknoten",
    "omschrijving": "muziek, cultuur, evenementen",
    "categorie": "symbool",
    "maat": 1,
    "zweeft": true,
    "inhoud": "<g fill=\"#ff00ff\">\n    <ellipse cx=\"26\" cy=\"76\" rx=\"14\" ry=\"10\" transform=\"rotate(-18 26 76)\"/>\n    <rect x=\"36\" y=\"20\" width=\"7\" height=\"54\" rx=\"3\"/>\n    <ellipse cx=\"66\" cy=\"62\" rx=\"12\" ry=\"9\" transform=\"rotate(-18 66 62)\"/>\n    <rect x=\"74\" y=\"12\" width=\"7\" height=\"48\" rx=\"3\"/>\n    <path d=\"M36 20 L81 10 L81 24 L36 34 Z\"/>\n  </g>"
  },
  {
    "sleutel": "meetlat",
    "omschrijving": "meten, norm, grens, toets, inkomensgrens",
    "categorie": "object",
    "maat": 1.6,
    "zweeft": false,
    "inhoud": "<rect fill=\"#ff00ff\" x=\"28\" y=\"6\" width=\"44\" height=\"88\" rx=\"16\"/>\n  <g fill=\"#ffffff\">\n    <rect x=\"38\" y=\"20\" width=\"18\" height=\"4\" rx=\"2\"/>\n    <rect x=\"38\" y=\"34\" width=\"12\" height=\"4\" rx=\"2\"/>\n    <rect x=\"38\" y=\"48\" width=\"18\" height=\"4\" rx=\"2\"/>\n    <rect x=\"38\" y=\"62\" width=\"12\" height=\"4\" rx=\"2\"/>\n    <rect x=\"38\" y=\"76\" width=\"18\" height=\"4\" rx=\"2\"/>\n  </g>"
  },
  {
    "sleutel": "documentenstapel",
    "omschrijving": "begroting, wetsvoorstel, dossiers, veel papierwerk",
    "categorie": "object",
    "maat": 0.5,
    "zweeft": false,
    "inhoud": "<rect fill=\"#00ffff\" x=\"18\" y=\"70\" width=\"64\" height=\"16\" rx=\"2\" transform=\"rotate(-4 50 78)\"/>\n  <rect fill=\"#ff00ff\" x=\"20\" y=\"52\" width=\"60\" height=\"16\" rx=\"2\" transform=\"rotate(3 50 60)\"/>\n  <rect fill=\"#00ffff\" x=\"22\" y=\"34\" width=\"58\" height=\"16\" rx=\"2\" transform=\"rotate(-2 50 42)\"/>\n  <rect fill=\"#eeeeee\" x=\"30\" y=\"12\" width=\"42\" height=\"24\" rx=\"2\"/>\n  <rect fill=\"#ffff00\" x=\"36\" y=\"20\" width=\"30\" height=\"4\" rx=\"2\"/>\n  <rect fill=\"#ffff00\" x=\"36\" y=\"28\" width=\"20\" height=\"4\" rx=\"2\"/>"
  }
];
