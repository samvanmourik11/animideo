import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije concept-PDF over de tulpenmanie van 1637, als bron voor de
// storytelling-infographic. Feiten gebaseerd op o.a. Wikipedia, Historiek,
// National Geographic en Beursgeschiedenis. ASCII-only zodat pdf-parse de tekst
// 1-op-1 terugleest. Geen em-dashes.
const title = "De tulpenmanie - de eerste zeepbel ter wereld (1637)";
const lines = [
  "De tulpenmanie was de eerste grote speculatiezeepbel ter wereld, in Holland tijdens de Gouden Eeuw.",
  "De tulp kwam oorspronkelijk uit het Ottomaanse Rijk en werd rond 1593 in Leiden voor het eerst gekweekt.",
  "De rage begon halverwege 1636 en stortte begin februari 1637 in een paar dagen in.",
  "Op het hoogtepunt werden voor een enkele tulpenbol duizenden guldens geboden.",
  "Dat was meer dan tien keer het jaarsalaris van een ervaren vakman.",
  "Een bol die in 1636 nog 20 gulden kostte, deed begin 1637 wel 1.200 gulden.",
  "De beroemde Semper Augustus was naar schatting 6.000 gulden waard.",
  "Voor dat bedrag kon je destijds een mooi grachtenpand in Haarlem kopen.",
  "De gevlamde strepen van de Semper Augustus kwamen door een virus, het tulpenbrekingsvirus.",
  "Op de veiling in Alkmaar op 5 februari 1637 ging een Viceroy-bol voor 4.200 gulden van de hand.",
  "Bollen werden vaak verhandeld terwijl ze nog in de grond zaten, op papieren contracten.",
  "Deze handel zonder echte bollen kreeg de bijnaam windhandel.",
  "Toen het vertrouwen wegviel, vonden kopers geen afnemers meer en klapte de markt in.",
  "In de praktijk werden de meeste contracten niet nagekomen en betaalden kopers weinig of niets.",
  "De tulpenmanie geldt nog altijd als het schoolvoorbeeld van een financiele zeepbel.",
];

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

let content = "BT\n/F1 15 Tf\n50 800 Td\n(" + esc(title) + ") Tj\n/F1 10 Tf\n0 -32 Td\n(" + esc(lines[0]) + ") Tj\n";
for (let i = 1; i < lines.length; i++) content += "0 -22 Td\n(" + esc(lines[i]) + ") Tj\n";
content += "ET";

const objects = [];
objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
objects[4] = "<< /Length " + Buffer.byteLength(content, enc) + " >>\nstream\n" + content + "\nendstream";
objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

let pdf = "%PDF-1.4\n";
const offsets = [];
for (let i = 1; i <= 5; i++) {
  offsets[i] = Buffer.byteLength(pdf, enc);
  pdf += i + " 0 obj\n" + objects[i] + "\nendobj\n";
}
const xrefOffset = Buffer.byteLength(pdf, enc);
pdf += "xref\n0 6\n0000000000 65535 f \n";
for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";

const out = join(homedir(), "Desktop", "concept-geschiedenis-tulpenmanie.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out);
