import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Genereert 3 demo-PDF's voor de webinar (storytelling-infographic):
//  1. leuk verhaal / geschiedenis  -> LEGO
//  2. bedrijf                      -> Stipt (boekhouding voor zzp'ers, fictief)
//  3. hobbyist                     -> eerste jaar als imker
// Dependency-vrij, ASCII-only (zodat de PDF-tekst 1-op-1 wordt teruggelezen),
// bewust veel harde cijfers zodat de AI een verhaalboog kan bouwen. Geen
// em-dashes in de copy (huisstijl): komma of gewoon koppelteken.

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const wrap = (text, max = 90) => {
  const words = text.split(" ");
  const out = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > max) { out.push(line); line = w; }
    else line = line ? line + " " + w : w;
  }
  if (line) out.push(line);
  return out;
};

function buildPdf(title, facts) {
  const rows = [];
  for (const fact of facts) {
    const wrapped = wrap(fact);
    wrapped.forEach((w, i) => rows.push({ text: w, gap: i === 0 ? 24 : 16 }));
  }
  const pageHeight = 842, topY = 790, bottomMargin = 60, leftX = 60;
  const pages = [];
  let cur = null, y = 0;
  const newPage = (withTitle) => {
    cur = { content: "BT\n", started: false };
    pages.push(cur);
    y = topY;
    if (withTitle) {
      cur.content += "/F1 16 Tf\n" + leftX + " " + y + " Td\n(" + esc(title) + ") Tj\n";
      cur.started = true;
      y -= 40;
    }
  };
  newPage(true);
  cur.content += "/F1 11 Tf\n";
  for (const row of rows) {
    if (y - row.gap < bottomMargin) {
      cur.content += "ET";
      newPage(false);
      cur.content += "/F1 11 Tf\n";
    }
    if (!cur.started) {
      cur.content += leftX + " " + y + " Td\n(" + esc(row.text) + ") Tj\n";
      cur.started = true;
    } else {
      cur.content += "0 -" + row.gap + " Td\n(" + esc(row.text) + ") Tj\n";
      y -= row.gap;
    }
  }
  cur.content += "ET";

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  const kids = [];
  let nextObj = 4;
  for (const p of pages) {
    const pageObj = nextObj++, contentObj = nextObj++;
    kids.push(pageObj + " 0 R");
    objects[pageObj] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 " + pageHeight + "]" +
      " /Resources << /Font << /F1 3 0 R >> >> /Contents " + contentObj + " 0 R >>";
    objects[contentObj] = "<< /Length " + Buffer.byteLength(p.content, enc) + " >>\nstream\n" + p.content + "\nendstream";
  }
  objects[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>";
  const total = nextObj - 1;
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= total; i++) { offsets[i] = Buffer.byteLength(pdf, enc); pdf += i + " 0 obj\n" + objects[i] + "\nendobj\n"; }
  const xrefOffset = Buffer.byteLength(pdf, enc);
  pdf += "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
  for (let i = 1; i <= total; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return { buf: Buffer.from(pdf, enc), pages: pages.length };
}

const docs = [
  {
    file: "webinar-1-verhaal-lego.pdf",
    title: "De geschiedenis van LEGO - van houten eend tot wereldmerk",
    facts: [
      "In 1932 begon timmerman Ole Kirk Christiansen in het Deense dorp Billund met het maken van houten speelgoed.",
      "Twee jaar later, in 1934, bedacht hij de naam LEGO, een samentrekking van de Deense woorden leg godt: speel goed.",
      "In 1949 maakte het bedrijf zijn eerste plastic bouwsteentjes, nog zonder het slimme klik-systeem.",
      "Op 28 januari 1958 werd het moderne steentje met buisjes aan de onderkant gepatenteerd, en dat past vandaag nog steeds op een steentje uit 1958.",
      "Een klassiek steentje van 2 bij 4 noppen heeft 8 noppen aan de bovenkant.",
      "Met slechts zes van die 2 bij 4 steentjes kun je meer dan 915 miljoen verschillende combinaties maken.",
      "De steentjes worden geperst met een nauwkeurigheid van twee duizendste millimeter, daardoor klikken ze al sinds 1958 perfect op elkaar.",
      "In 1968 opende het eerste Legoland-park in Billund, dat in het eerste jaar al 625.000 bezoekers trok.",
      "In 1978 verscheen de eerste minifiguur met beweegbare armen en benen en een vrolijk gezicht.",
      "Inmiddels zijn er meer dan 8 miljard minifiguren gemaakt, meer dan er mensen op aarde zijn.",
      "De LEGO-fabrieken produceren ongeveer 36.000 steentjes per minuut, dat zijn er meer dan 19 miljard per jaar.",
      "Wereldwijd zijn er in de loop der tijd meer dan 600 miljard LEGO-elementen gemaakt.",
      "Als je alle geproduceerde steentjes zou verdelen, heeft elke aardbewoner er ongeveer tachtig.",
      "LEGO is sinds 2015 officieel de grootste speelgoedfabrikant ter wereld.",
      "Een grote Star Wars-set kan uit meer dan 7.500 losse onderdelen bestaan.",
      "Toch is en blijft het idee simpel: stop kinderen een doos steentjes en hun fantasie doet de rest.",
      "Van een houten eendje in 1932 tot een merk in meer dan 130 landen: LEGO bouwde een imperium, steentje voor steentje.",
    ],
  },
  {
    file: "webinar-2-bedrijf-stipt.pdf",
    title: "Stipt - boekhouding zonder gedoe voor zzp'ers",
    facts: [
      "Stipt is in 2019 opgericht door twee oud-accountants die zagen hoeveel tijd zelfstandigen kwijt waren aan hun administratie.",
      "Hun missie is simpel: ondernemers laten ondernemen, terwijl de cijfers vanzelf kloppen.",
      "Stipt is een online boekhoudprogramma speciaal voor zzp'ers en kleine bedrijven.",
      "De app koppelt automatisch met je zakelijke bankrekening en sorteert je transacties met slimme herkenning.",
      "Een factuur maak je in minder dan een minuut, met je eigen logo en huisstijl.",
      "Je btw-aangifte staat met een enkele klik klaar voor de Belastingdienst.",
      "Gebruikers besparen gemiddeld 6 uur per maand op hun administratie.",
      "Inmiddels vertrouwen meer dan 8.500 ondernemers hun boekhouding toe aan Stipt.",
      "Samen verstuurden zij vorig jaar ruim 1,2 miljoen facturen via het platform.",
      "Klanten geven Stipt gemiddeld een 4,8 uit 5 in onafhankelijke reviews.",
      "Van de gebruikers verlengt 92 procent na het eerste jaar hun abonnement.",
      "Een abonnement begint bij 12 euro per maand, zonder verborgen kosten.",
      "Nieuwe klanten kunnen de software 30 dagen gratis uitproberen.",
      "Het supportteam van 24 mensen reageert gemiddeld binnen 4 minuten op een vraag.",
      "Stipt groeide in vier jaar van 2 naar 40 medewerkers, volledig zonder externe investeerders.",
      "De data staat veilig op Nederlandse servers en voldoet volledig aan de privacywetgeving.",
      "Het doel voor volgend jaar: 15.000 ondernemers helpen om weer verliefd te worden op hun eigen bedrijf.",
    ],
  },
  {
    file: "webinar-3-hobby-imker.pdf",
    title: "Mijn eerste jaar als imker - het verhaal van een bijenvolk",
    facts: [
      "Vorig voorjaar haalde ik mijn eerste bijenvolk op, een doos vol leven die zachtjes zoemde in de achterbak.",
      "In de zomer telt een gezond bijenvolk tot wel 50.000 bijen, allemaal nakomelingen van een enkele koningin.",
      "De koningin kan op een topdag tot 2.000 eitjes leggen, meer dan haar eigen lichaamsgewicht.",
      "Een werkbij leeft in de zomer maar ongeveer 6 weken, ze werkt zichzelf letterlijk dood.",
      "In die korte tijd vliegt een enkele bij gemiddeld zo'n 800 kilometer.",
      "Op een dag bezoekt een bij tot wel 2.000 bloemen op zoek naar nectar en stuifmeel.",
      "Voor een potje honing van 500 gram vliegen de bijen samen meer dan 75.000 kilometer, bijna twee keer de aarde rond.",
      "Daarvoor moeten ze ongeveer een miljoen bloemen bezoeken.",
      "In de winter houden de bijen hun tros op 35 graden door samen te trillen met hun spieren.",
      "Ze eten dan van de honing die ze in de zomer hebben aangelegd, soms wel 15 kilo per volk.",
      "Bijen praten met elkaar via een dansje, de beroemde bijendans wijst de richting naar het voedsel.",
      "Mijn eerste inspectie was spannend: duizenden bijen op een raat, en ik moest de koningin zien te vinden.",
      "Na een goede zomer oogstte ik mijn eerste honing, ruim 18 kilo uit een enkele kast.",
      "Een op de drie happen van ons eten bestaat dankzij bestuivers zoals de bij.",
      "Wereldwijd zijn bijen verantwoordelijk voor de bestuiving van zo'n 70 van de 100 belangrijkste voedselgewassen.",
      "Sinds ik imker ben kijk ik anders naar elke bloem in de berm, het is allemaal eten voor mijn meiden.",
      "Een jaar geleden was ik bang voor een enkele wesp, nu sta ik rustig tussen tienduizenden bijen.",
    ],
  },
];

for (const d of docs) {
  const { buf, pages } = buildPdf(d.title, d.facts);
  const out = join(homedir(), "Desktop", d.file);
  writeFileSync(out, buf);
  console.log("PDF:", out, "(" + pages + " pagina's, " + d.facts.length + " feiten)");
}
