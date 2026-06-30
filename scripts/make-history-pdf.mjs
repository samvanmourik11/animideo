import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije concept-PDF over de VOC (1602-1799), om de PDF-upload van de
// storytelling-infographic mee te testen met een GESCHIEDENIS-onderwerp.
// Bewust veel feiten + harde cijfers zodat de AI een verhaalboog van 5-7 scenes
// kan bouwen die als video minstens 2 minuten duurt. ASCII-only zodat pdf-parse
// de tekst 1-op-1 terugleest. Tekst wordt afgebroken zodat regels op de pagina
// passen, en alle posities zijn RELATIEVE Td-sprongen (anders valt tekst weg).
const title = "De VOC - de eerste multinational ter wereld (1602-1799)";

const facts = [
  "In 1602 bundelden zes Hollandse en Zeeuwse handelskamers hun krachten in de Verenigde Oost-Indische Compagnie.",
  "De VOC was het eerste bedrijf ter wereld dat aandelen uitgaf aan het gewone publiek.",
  "Het startkapitaal bedroeg ruim 6,4 miljoen gulden, een voor die tijd ongekend bedrag.",
  "De Staten-Generaal gaven de VOC een handelsmonopolie op heel Azie ten oosten van Kaap de Goede Hoop.",
  "De compagnie mocht zelfs oorlog voeren, verdragen sluiten en forten bouwen namens de Republiek.",
  "In 1619 stichtte Jan Pieterszoon Coen Batavia, het bestuurscentrum in Azie, op de plek van het huidige Jakarta.",
  "Specerijen als nootmuskaat, foelie, kruidnagel en peper waren in Europa meer waard dan goud.",
  "Een pond nootmuskaat kostte in Azie enkele centen, maar bracht in Amsterdam tot driehonderd keer zoveel op.",
  "Op het hoogtepunt had de VOC ongeveer 40.000 mensen in dienst, verspreid over drie continenten.",
  "De compagnie bezat een eigen vloot van rond de 150 handelsschepen en tientallen oorlogsschepen.",
  "Tussen 1602 en 1796 maakten VOC-schepen bijna 4.700 reizen van Europa naar Azie.",
  "Een enkele reis naar de Oost duurde gemiddeld acht maanden en was levensgevaarlijk.",
  "Naar schatting kwam een op de vijf opvarenden onderweg om door ziekte, storm of scheurbuik.",
  "Amsterdam groeide mede door de VOC uit tot de rijkste handelsstad van Europa.",
  "De Amsterdamse beurs werd het kloppend hart van de internationale handel in aandelen.",
  "De keerzijde was hard: dwangarbeid, geweld en slavenhandel waren deel van het VOC-systeem.",
  "Op de Banda-eilanden liet de VOC in 1621 vrijwel de hele bevolking doden of verdrijven voor de nootmuskaat.",
  "Tijdens haar bestaan vervoerde de compagnie tienduizenden tot slaaf gemaakte mensen binnen Azie.",
  "In de 18e eeuw groeide de schuld door oorlogen, corruptie en dalende winsten gestaag.",
  "Tegen 1780 bracht de Vierde Engelse Oorlog de handel en de vloot zware schade toe.",
  "Op 31 december 1799 werd de VOC opgeheven, met een schuld van ruim 100 miljoen gulden.",
  "De Nederlandse staat nam de bezittingen over en daarmee begon de koloniale tijd in Nederlands-Indie.",
  "Bijna twee eeuwen lang bepaalde de VOC de wereldhandel, met rijkdom en uitbuiting dicht bij elkaar.",
  "Tot vandaag geldt de VOC als symbool van zowel Nederlandse ondernemingszin als koloniaal onrecht.",
];

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

// Breek een regel af op ~90 tekens zodat hij binnen de pagina past.
const wrap = (text, max = 90) => {
  const words = text.split(" ");
  const out = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) out.push(line);
  return out;
};

// Maak een vlakke lijst van render-regels met hun lettergrootte en de extra
// ruimte erboven (zo houden we de feiten visueel als alinea's bij elkaar).
const rows = [];
for (const fact of facts) {
  const wrapped = wrap(fact);
  wrapped.forEach((w, i) => rows.push({ text: w, size: 11, gap: i === 0 ? 24 : 16 }));
}

const pageHeight = 842;
const topY = 790;
const bottomMargin = 60;
const leftX = 60;

// Verdeel de regels over pagina's; elke pagina is een eigen content stream met
// uitsluitend relatieve Td-sprongen (eerste sprong plaatst de cursor absoluut).
const pages = [];
let cur = null;
let y = 0;
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

// Objecten: 1 catalog, 2 pages, 3 font, daarna per pagina page + content.
const objects = [];
objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

const kids = [];
let nextObj = 4;
for (const p of pages) {
  const pageObj = nextObj++;
  const contentObj = nextObj++;
  kids.push(pageObj + " 0 R");
  objects[pageObj] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 " + pageHeight + "]" +
    " /Resources << /Font << /F1 3 0 R >> >> /Contents " + contentObj + " 0 R >>";
  objects[contentObj] =
    "<< /Length " + Buffer.byteLength(p.content, enc) + " >>\nstream\n" + p.content + "\nendstream";
}
objects[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>";

const total = nextObj - 1;
let pdf = "%PDF-1.4\n";
const offsets = [];
for (let i = 1; i <= total; i++) {
  offsets[i] = Buffer.byteLength(pdf, enc);
  pdf += i + " 0 obj\n" + objects[i] + "\nendobj\n";
}
const xrefOffset = Buffer.byteLength(pdf, enc);
pdf += "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
for (let i = 1; i <= total; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
pdf += "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";

const out = join(homedir(), "Desktop", "concept-geschiedenis-voc.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out, "(" + pages.length + " pagina's, " + facts.length + " feiten)");
