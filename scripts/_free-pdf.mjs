// PDF-uitdraai van de FREE-accounts: aantal + wanneer aangemaakt, met tijdlijn.
// Splitst "directe free-signups" (nooit €1) van "ex-€1" (na opzegging op free).
// Output: ~/Desktop/Free-accounts.pdf
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync("/Users/samvanmourik/animideo/.env.local", "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const GEN = new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "long", year: "numeric" });
const fd = (d) => d ? new Date(d).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "short", year: "numeric" }) : "—";

// 1) Alle free-profielen (paginatie, want kan groot zijn)
let free = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("profiles").select("email, created_at").eq("plan", "free").order("created_at", { ascending: true }).range(from, from + 999);
  if (error) { console.error("profiles fout:", error.message); process.exit(1); }
  free = free.concat(data || []);
  if (!data || data.length < 1000) break;
}
// 2) E-mails die ooit €1/cursus kochten (om ex-€1 te herkennen)
const { data: pcs } = await sb.from("pending_checkouts").select("email").eq("is_cursus", true).in("status", ["paid", "claimed"]);
const paidEmails = new Set((pcs || []).map(r => (r.email || "").toLowerCase()));

const direct = free.filter(p => !paidEmails.has((p.email || "").toLowerCase()));
const exEuro = free.filter(p => paidEmails.has((p.email || "").toLowerCase()));
direct.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

// 3) Cumulatieve groei van directe free-signups
function growthSVG(items) {
  const W = 720, H = 300, mL = 44, mR = 20, mT = 20, mB = 40, iw = W - mL - mR, ih = H - mT - mB;
  if (items.length === 0) return `<svg width="${W}" height="${H}"></svg>`;
  const t0 = new Date(items[0].created_at).getTime(), t1 = Date.now(), span = Math.max(1, t1 - t0), maxC = items.length;
  const x = (t) => mL + ((t - t0) / span) * iw, y = (c) => mT + ih - (c / maxC) * ih;
  const pts = [[x(t0), y(0)]];
  items.forEach((it, i) => { const px = x(new Date(it.created_at).getTime()); pts.push([px, y(i)]); pts.push([px, y(i + 1)]); });
  pts.push([x(t1), y(maxC)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${x(t1).toFixed(1)} ${y(0).toFixed(1)} L ${x(t0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const yt = []; const step = Math.max(1, Math.ceil(maxC / 5));
  for (let c = 0; c <= maxC; c += step) yt.push(`<line x1="${mL}" y1="${y(c)}" x2="${W - mR}" y2="${y(c)}" stroke="#ececf4"/><text x="${mL - 8}" y="${y(c) + 3}" text-anchor="end" font-size="10" fill="#999">${c}</text>`);
  const xl = [t0, (t0 + t1) / 2, t1].map(t => `<text x="${x(t)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#999">${fd(t)}</text>`);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.28"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>${yt.join("")}<path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>${xl.join("")}</svg>`;
}

const rows = direct.map((p, i) => `<tr><td class="n">${i + 1}</td><td>${p.email || "—"}</td><td>${fd(p.created_at)}</td></tr>`).join("");

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
  @page { size:A4; margin:15mm 12mm; } * { box-sizing:border-box; }
  body { font-family:-apple-system,"Helvetica Neue",Arial,sans-serif; color:#1a1a2e; font-size:11px; }
  h1 { font-size:21px; margin:0 0 2px; } .sub-h { color:#666; margin:0 0 16px; }
  .cards { display:flex; gap:10px; margin:0 0 18px; }
  .card { flex:1; border:1px solid #e3e3ef; border-radius:10px; padding:12px 14px; background:#fbfbff; }
  .card .k { color:#777; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; }
  .card .v { font-size:22px; font-weight:700; margin-top:3px; color:#1e3a8a; }
  h2 { font-size:13px; margin:20px 0 8px; border-bottom:2px solid #1a1a2e; padding-bottom:3px; }
  .chart { border:1px solid #ececf4; border-radius:10px; padding:8px 4px; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th { text-align:left; background:#f3f3fa; padding:6px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.03em; color:#555; border-bottom:1px solid #ddd; }
  td { padding:5px 8px; border-bottom:1px solid #eee; } td.n { color:#aaa; width:24px; }
  tr:nth-child(even) td { background:#fafafe; }
  .note { color:#777; font-size:9.5px; margin:8px 0 0; line-height:1.5; }
  .foot { margin-top:22px; color:#999; font-size:8.5px; border-top:1px solid #eee; padding-top:6px; }
</style></head><body>
  <h1>Free-accounts — uitdraai</h1>
  <p class="sub-h">JouwAnimatieVideo A.I. · gegenereerd ${GEN} · bron: applicatie-database</p>
  <div class="cards">
    <div class="card"><div class="k">Free-accounts totaal</div><div class="v">${free.length}</div></div>
    <div class="card"><div class="k">Directe free-signups</div><div class="v">${direct.length}</div></div>
    <div class="card"><div class="k">Ex-€1 (opgezegd → free)</div><div class="v">${exEuro.length}</div></div>
  </div>
  <h2>Wanneer — cumulatief aantal directe free-signups</h2>
  <div class="chart">${growthSVG(direct)}</div>
  <h2>Directe free-signups — ${direct.length} (chronologisch)</h2>
  <table><thead><tr><th>#</th><th>E-mail</th><th>Account aangemaakt</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note"><b>Directe free-signups</b> = accounts die zelf een gratis account maakten en nooit een €1-checkout deden. <b>Ex-€1</b> = klanten die het €1-aanbod kochten maar na opzegging op free vielen (die maakten dus geen "gratis account", maar staan nu wel op free). Datum = aanmaakdatum van het profiel (Supabase <code>created_at</code>, ≈ moment van registratie).</p>
  <p class="foot">Bron: profielen waar plan='free', gekruist met betaalde is_cursus-checkouts. Gegenereerd op ${GEN}.</p>
</body></html>`;

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
const out = "/Users/samvanmourik/Desktop/Free-accounts.pdf";
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" } });
await browser.close();
console.log(`OK — ${free.length} free totaal (${direct.length} direct, ${exEuro.length} ex-€1). PDF: ${out}`);
