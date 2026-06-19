// Zet PRODUCTDOSSIER-LINKEDIN.md om naar een nette PDF op het bureaublad.
// Lichtgewicht markdown->HTML (koppen, vet, code, tabellen, lijsten, quotes, hr)
// en print via Playwright Chromium naar A4-PDF.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const md = readFileSync("PRODUCTDOSSIER-LINKEDIN.md", "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const lines = md.split("\n");
let html = "";
let i = 0;
const cells = (row) => row.split("|").slice(1, -1).map((c) => c.trim());

while (i < lines.length) {
  const line = lines[i];

  // Tabel: blok van regels die met | beginnen
  if (/^\s*\|/.test(line)) {
    const block = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i]); i++; }
    const header = cells(block[0]);
    const rows = block.slice(2); // regel 1 = scheidingsrij
    html += "<table><thead><tr>" + header.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>";
    for (const r of rows) html += "<tr>" + cells(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
    html += "</tbody></table>";
    continue;
  }

  // Horizontale lijn (alleen ---, geen pipes)
  if (/^---+\s*$/.test(line)) { html += "<hr/>"; i++; continue; }

  // Koppen
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) { const n = h[1].length; html += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }

  // Blockquote (mogelijk meerdere regels)
  if (/^>\s?/.test(line)) {
    const block = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) { block.push(lines[i].replace(/^>\s?/, "")); i++; }
    html += `<blockquote>${block.map(inline).join("<br/>")}</blockquote>`;
    continue;
  }

  // Ongeordende lijst
  if (/^\s*-\s+/.test(line)) {
    html += "<ul>";
    while (i < lines.length && /^\s*-\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*-\s+/, ""))}</li>`; i++; }
    html += "</ul>";
    continue;
  }

  // Geordende lijst
  if (/^\s*\d+\.\s+/.test(line)) {
    html += "<ol>";
    while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`; i++; }
    html += "</ol>";
    continue;
  }

  // Lege regel
  if (/^\s*$/.test(line)) { i++; continue; }

  // Paragraaf
  html += `<p>${inline(line)}</p>`;
  i++;
}

const doc = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2233; line-height: 1.5; font-size: 11px; }
  h1 { font-size: 22px; color: #16243f; border-bottom: 3px solid #e8643c; padding-bottom: 8px; margin: 0 0 12px; }
  h2 { font-size: 16px; color: #16243f; margin: 22px 0 8px; border-bottom: 1px solid #d7dde6; padding-bottom: 4px; }
  h3 { font-size: 13px; color: #2b3a55; margin: 16px 0 6px; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 6px 18px; padding: 0; }
  li { margin: 3px 0; }
  code { background: #f1f3f7; padding: 1px 4px; border-radius: 3px; font-family: "SFMono-Regular", Menlo, Consolas, monospace; font-size: 10px; color: #b5402a; }
  strong { color: #16243f; }
  hr { border: none; border-top: 1px solid #e2e6ec; margin: 16px 0; }
  blockquote { margin: 10px 0; padding: 8px 12px; background: #fff7f3; border-left: 4px solid #e8643c; border-radius: 4px; color: #5a3c33; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10px; }
  th { background: #16243f; color: #fff; text-align: left; padding: 6px 8px; }
  td { border: 1px solid #dfe4ea; padding: 5px 8px; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9fb; }
  table, tr, blockquote { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
</style></head><body>${html}</body></html>`;

const out = join(homedir(), "Desktop", "Productdossier-JouwAnimatieVideo.pdf");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: "networkidle" });
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: '<div style="width:100%;font-size:8px;color:#8a93a3;text-align:center;">JouwAnimatieVideo A.I. — Productdossier · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
});
await browser.close();
console.log("PDF geschreven naar:", out);
