import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije concept-PDF over wat suiker doet met je brein, als bron voor
// de storytelling-infographic. Feiten zijn gebaseerd op onderzoek (WHO, Wageningen
// University, Whitehall II-studie, University of Sydney, Max Planck Institute).
// ASCII-only zodat pdf-parse de tekst 1-op-1 terugleest. Geen em-dashes.
const title = "Wat suiker doet met je brein - de feiten";
const lines = [
  "De WHO adviseert maximaal 50 gram toegevoegde suiker per dag, ongeveer 12 suikerklontjes.",
  "Idealiter blijf je zelfs onder de 25 gram per dag voor de beste gezondheid.",
  "Nederlanders eten gemiddeld rond 64 gram toegevoegde suiker per dag, ruim boven de norm.",
  "Een blikje frisdrank bevat al ongeveer 35 gram suiker, bijna de hele dagnorm.",
  "Suiker activeert het beloningssysteem en geeft een piek van dopamine, de stof voor plezier.",
  "Die dopaminepiek lijkt op het effect van verslavende middelen, waardoor je steeds meer wilt.",
  "Bij veel suiker went het brein, er komt minder dopamine vrij en je hebt meer nodig voor hetzelfde gevoel.",
  "Na een suikerpiek volgt snel een dal, met vermoeidheid, concentratieverlies en prikkelbaarheid.",
  "Een dieet met veel suiker en vet kan het geheugen schaden, vooral in de hippocampus.",
  "De hippocampus is het deel van het brein dat cruciaal is voor leren, geheugen en routes onthouden.",
  "In een studie onder 472 mensen van 50 tot 85 jaar hing veel suiker samen met slechter geheugen.",
  "Bij jongeren met een langdurig hoog suikergehalte in het bloed werd zelfs krimp van de hippocampus gezien.",
  "De Whitehall-studie volgde 5.000 mannen en 2.000 vrouwen ruim 22 jaar lang.",
  "Mannen die meer dan 67 gram suiker per dag aten, hadden 23% meer kans op een depressie binnen vijf jaar.",
  "Het goede nieuws, minder suiker eten verbetert na verloop van tijd je geheugen en je stemming.",
];

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

let content = "BT\n/F1 16 Tf\n50 800 Td\n(" + esc(title) + ") Tj\n/F1 10 Tf\n0 -32 Td\n(" + esc(lines[0]) + ") Tj\n";
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

const out = join(homedir(), "Desktop", "concept-suiker-brein.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out);
