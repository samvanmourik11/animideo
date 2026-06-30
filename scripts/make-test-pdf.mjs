import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije generator van een geldige tekst-PDF, puur voor het testen
// van de infographic PDF-upload. ASCII-only zodat pdf-parse het 1-op-1 terugleest.
const title = "Jaarcijfers 2025 - Bloomwear B.V.";
const lines = [
  "Omzet groeide met 38% naar 12,4 miljoen euro (was 9,0 miljoen in 2024).",
  "Het aantal actieve klanten steeg van 8.500 naar 14.200.",
  "Klanttevredenheid (NPS) ging omhoog van 7,2 naar 8,6.",
  "73% van de klanten beveelt Bloomwear aan bij anderen.",
  "De webshop-conversie verbeterde van 2,1% naar 3,4%.",
  "CO2-uitstoot per product daalde met 21%.",
  "Het team groeide van 24 naar 41 medewerkers.",
  "Vier nieuwe markten geopend: Belgie, Duitsland, Frankrijk en Denemarken.",
  "Gemiddelde orderwaarde steeg naar 68 euro.",
  "Het retourpercentage daalde van 12% naar 7%.",
  "Totaal verkochte producten in 2025: 182.000 stuks.",
  "Herhaalaankopen waren goed voor 54% van de omzet.",
];

const enc = "latin1";
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

let content = "BT\n/F1 18 Tf\n72 790 Td\n(" + esc(title) + ") Tj\n/F1 11 Tf\n0 -34 Td\n(" + esc(lines[0]) + ") Tj\n";
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

const out = join(homedir(), "Desktop", "test-infographic-data.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out);
