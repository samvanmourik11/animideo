import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Dependency-vrije concept-PDF over veel voorkomende oorzaken van daklekkage,
// als bron voor de storytelling-infographic. Feiten gebaseerd op Nederlandse
// dakdekker-bronnen (AquaStop, Mijn-dakdekker, Eigenhuis-dakdekker e.a.).
// ASCII-only zodat pdf-parse de tekst 1-op-1 terugleest. Geen em-dashes.
const title = "Veel voorkomende oorzaken van daklekkage";
const lines = [
  "Bij platte daken zit ongeveer 80% van alle lekkages in de naden en aansluitingen.",
  "De aansluiting op de opstaande rand (boei) is het kwetsbaarst, daar werken de thermische krachten het sterkst.",
  "Scheuren in de dakbedekking zijn goed voor ongeveer 30% van de lekkages bij platte daken.",
  "Een verstopte hemelwaterafvoer veroorzaakt naar schatting 25% van de lekkages.",
  "Slechte naden en aansluitingen zorgen voor ongeveer 20% van de daklekkages.",
  "Ouderdom van de dakbedekking is in ongeveer 15% van de gevallen de oorzaak.",
  "Bij hoge temperaturen ontstaat blaasvorming onder de bitumen laag door vocht, gevolgd door scheuren.",
  "Mechanisch bevestigde EPDM-folie kan na jaren rondom de schroeven scheuren door belasting.",
  "Bij hellende daken zijn verschoven, gebroken of ontbrekende dakpannen de meest voorkomende oorzaak.",
  "Loslatende nokvorsten laten regenwater ongehinderd de dakconstructie in lopen.",
  "Versleten loodslabben rond schoorsteen en dakkapel laten vocht door, vooral bij harde wind en regen.",
  "Verstopte dakgoten door bladeren en vuil leiden in het najaar vaak tot lekkages.",
  "Een bitumen plat dak gaat ongeveer 20 tot 30 jaar mee, EPDM zelfs tot 50 jaar.",
  "Veel lekkages beginnen klein en blijven lang onzichtbaar, waardoor de houten constructie ongemerkt verrot.",
  "Periodiek onderhoud, zoals goten schoonmaken en naden controleren, voorkomt het grootste deel van de schade.",
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

const out = join(homedir(), "Desktop", "concept-daklekkage.pdf");
writeFileSync(out, Buffer.from(pdf, enc));
console.log("PDF geschreven naar:", out);
