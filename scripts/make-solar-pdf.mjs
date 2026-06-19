import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije concept-PDF over zonnepanelen + thuisbatterijen, om de
// PDF-upload van de storytelling-infographic mee te testen. ASCII-only zodat
// pdf-parse de tekst 1-op-1 terugleest.
const title = "Zonnepanelen en thuisbatterijen in Nederland - 2025";
const lines = [
  "Eind 2025 hebben ruim 2,5 miljoen Nederlandse huishoudens zonnepanelen op het dak.",
  "Een gemiddeld systeem van 10 panelen wekt jaarlijks ongeveer 3.500 kWh op.",
  "Daarmee dekt een huishouden tot 70% van zijn eigen stroomverbruik.",
  "De gemiddelde terugverdientijd van zonnepanelen daalde naar 6 jaar.",
  "Een set van 10 panelen kost gemiddeld 4.500 euro inclusief installatie.",
  "Met de afbouw van de salderingsregeling vanaf 2027 wordt opslag belangrijker.",
  "Een thuisbatterij van 5 kWh slaat overdag opgewekte stroom op voor de avond.",
  "Daarmee gebruik je tot 80% van je eigen zonnestroom zelf, in plaats van 30%.",
  "Een thuisbatterij kost gemiddeld 5.000 euro en gaat 10 tot 15 jaar mee.",
  "Een huishouden met panelen en batterij bespaart tot 1.200 euro per jaar.",
  "In 2025 werden ongeveer 80.000 thuisbatterijen geplaatst, vier keer zoveel als in 2023.",
  "Samen voorkomen zon en opslag jaarlijks miljoenen tonnen CO2-uitstoot.",
  "Slim laden bij lage stroomprijzen levert per jaar tientallen euro's extra op.",
];

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

let content = "BT\n/F1 17 Tf\n60 790 Td\n(" + esc(title) + ") Tj\n/F1 11 Tf\n0 -34 Td\n(" + esc(lines[0]) + ") Tj\n";
for (let i = 1; i < lines.length; i++) content += "0 -24 Td\n(" + esc(lines[i]) + ") Tj\n";
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

const out = join(homedir(), "Desktop", "concept-zonnepanelen-thuisbatterij.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out);
