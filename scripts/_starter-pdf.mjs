// PDF-overzicht van de ACTIEVE Starter-abonnementen, RECHTSTREEKS uit Mollie:
// aantal, per account afgenomen-datum + exacte volgende afschrijving, groeigrafiek,
// én een dubbele-abonnementen-check (klanten met >1 actief abo = dubbel afgeschreven).
// Draaien: MOLLIE_API_KEY=live_... node scripts/_starter-pdf.mjs
// Output: ~/Desktop/Starter-abonnementen.pdf
import { chromium } from "playwright";

const MKEY = process.env.MOLLIE_API_KEY;
if (!MKEY || /^live_x+$/i.test(MKEY) || /x{6,}/i.test(MKEY)) {
  console.error("Geen geldige MOLLIE_API_KEY (geef 'm mee: MOLLIE_API_KEY=live_... node ...)");
  process.exit(1);
}
const MH = { Authorization: `Bearer ${MKEY}` };
const GEN = new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "long", year: "numeric" });
const fd = (d) => d ? new Date(d).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "short", year: "numeric" }) : "—";

// 1) Alle subscriptions (paginatie)
let subs = [];
let url = "https://api.mollie.com/v2/subscriptions?limit=250";
while (url) {
  const r = await fetch(url, { headers: MH });
  if (!r.ok) { console.error("Mollie subs fout", r.status, await r.text()); process.exit(1); }
  const j = await r.json();
  subs = subs.concat(j._embedded?.subscriptions || []);
  url = j._links?.next?.href || null;
}

// 2) Emails per customer (gecached)
const cache = {};
async function email(cid) {
  if (!cid) return "—";
  if (cache[cid] !== undefined) return cache[cid];
  const r = await fetch(`https://api.mollie.com/v2/customers/${cid}`, { headers: MH });
  cache[cid] = r.ok ? ((await r.json()).email || "—") : "—";
  return cache[cid];
}

const all = [];
for (const s of subs) {
  all.push({
    email: await email(s.customerId),
    customerId: s.customerId,
    amount: parseFloat(s.amount?.value || "0"),
    status: s.status,                 // active | canceled | suspended | completed | pending
    created: s.createdAt,
    next: s.nextPaymentDate,
    id: s.id,
  });
}

const active = all.filter(s => s.status === "active");
// Eigen test-accounts uitsluiten + dubbele abonnementen ontdubbelen (1 per klant,
// vroegste behouden zodat de eerste klant/klim klopt).
const EXCLUDE = new Set(["samvanmourik11@gmail.com", "smaspam1908@gmail.com"]);
const activeStarter = active
  .filter(s => Math.round(s.amount) === 49 && !EXCLUDE.has((s.email || "").toLowerCase()))
  .sort((a, b) => new Date(a.created) - new Date(b.created));
const seenEmail = new Map();
for (const s of activeStarter) { const e = (s.email || "").toLowerCase(); if (!seenEmail.has(e)) seenEmail.set(e, s); }
const starters = [...seenEmail.values()].sort((a, b) => new Date(a.created) - new Date(b.created));
const mrr = starters.reduce((t, s) => t + s.amount, 0);

// 3) Dubbele abonnementen: klant (email) met >1 ACTIEF abo
const byEmail = {};
active.forEach(s => { const e = (s.email || "").toLowerCase(); (byEmail[e] = byEmail[e] || []).push(s); });
const doubles = Object.entries(byEmail).filter(([, v]) => v.length > 1)
  .map(([e, v]) => ({ email: e, subs: v }))
  .sort((a, b) => b.subs.length - a.subs.length);

// Cashflow: groepeer alle actieve abo's op hun eerstvolgende incassodatum.
const flow = {};
starters.forEach(s => {
  const key = s.next ? s.next.slice(0, 10) : null;
  if (!key) return;
  (flow[key] = flow[key] || { count: 0, total: 0 });
  flow[key].count++; flow[key].total += s.amount;
});
const flowRows = Object.entries(flow).map(([d, v]) => ({ d, ...v })).sort((a, b) => a.d.localeCompare(b.d));
const flowMax = Math.max(1, ...flowRows.map(r => r.total));
const flowTotal = flowRows.reduce((t, r) => t + r.total, 0);
const fdw = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "2-digit", month: "short" });
const flowHtml = flowRows.map(r => `<tr><td>${fdw(r.d)}</td><td style="text-align:center">${r.count}×</td><td class="eur">€${r.total.toFixed(0)}</td><td class="barc"><div class="bar" style="width:${(r.total / flowMax * 100).toFixed(1)}%"></div></td></tr>`).join("");

// 4) Groeicurve: cumulatief aantal actieve Starters op afgenomen-datum
function growthSVG(items) {
  const W = 720, H = 300, mL = 44, mR = 20, mT = 20, mB = 40;
  const iw = W - mL - mR, ih = H - mT - mB;
  if (items.length === 0) return `<svg width="${W}" height="${H}"></svg>`;
  const t0 = new Date(items[0].created).getTime(), t1 = Date.now();
  const span = Math.max(1, t1 - t0), maxC = items.length;
  const x = (t) => mL + ((t - t0) / span) * iw, y = (c) => mT + ih - (c / maxC) * ih;
  const pts = [[x(t0), y(0)]];
  items.forEach((it, i) => { const px = x(new Date(it.created).getTime()); pts.push([px, y(i)]); pts.push([px, y(i + 1)]); });
  pts.push([x(t1), y(maxC)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L ${x(t1).toFixed(1)} ${y(0).toFixed(1)} L ${x(t0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const yt = []; const step = Math.max(1, Math.ceil(maxC / 5));
  for (let c = 0; c <= maxC; c += step) yt.push(`<line x1="${mL}" y1="${y(c)}" x2="${W - mR}" y2="${y(c)}" stroke="#ececf4"/><text x="${mL - 8}" y="${y(c) + 3}" text-anchor="end" font-size="10" fill="#999">${c}</text>`);
  const xl = [t0, (t0 + t1) / 2, t1].map(t => `<text x="${x(t)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#999">${fd(t)}</text>`);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.28"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>${yt.join("")}<path d="${area}" fill="url(#g)"/><path d="${line}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>${xl.join("")}</svg>`;
}

const rows = starters.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${r.email}</td><td>${fd(r.created)}</td><td class="hl">${fd(r.next)}</td><td class="sub">${r.id}</td></tr>`).join("");
const dblRows = doubles.map(d => `<tr><td>${d.email}</td><td>${d.subs.length}</td><td class="sub">${d.subs.map(s => `${s.id} (€${s.amount.toFixed(0)}, volg. ${fd(s.next)})`).join("<br>")}</td></tr>`).join("");

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 15mm 12mm; } * { box-sizing: border-box; }
  body { font-family: -apple-system,"Helvetica Neue",Arial,sans-serif; color:#1a1a2e; font-size:11px; }
  h1 { font-size:21px; margin:0 0 2px; } .sub-h { color:#666; margin:0 0 16px; }
  .cards { display:flex; gap:10px; margin:0 0 18px; }
  .card { flex:1; border:1px solid #e3e3ef; border-radius:10px; padding:12px 14px; background:#fbfbff; }
  .card .k { color:#777; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; }
  .card .v { font-size:22px; font-weight:700; margin-top:3px; color:#1e3a8a; }
  .card.warn { background:#fff6f5; border-color:#f6c9c4; } .card.warn .v { color:#b42318; }
  h2 { font-size:13px; margin:20px 0 8px; border-bottom:2px solid #1a1a2e; padding-bottom:3px; }
  .chart { border:1px solid #ececf4; border-radius:10px; padding:8px 4px; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th { text-align:left; background:#f3f3fa; padding:6px 8px; font-size:9px; text-transform:uppercase; letter-spacing:.03em; color:#555; border-bottom:1px solid #ddd; }
  td { padding:6px 8px; border-bottom:1px solid #eee; vertical-align:top; }
  td.n { color:#aaa; width:22px; } td.hl { font-weight:700; color:#16794a; white-space:nowrap; }
  td.sub { color:#888; font-family:ui-monospace,Menlo,monospace; font-size:9px; }
  td.eur { text-align:right; font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
  td.barc { width:42%; padding-right:14px; } .bar { height:9px; background:#2563eb; border-radius:5px; min-width:2px; }
  tfoot td { border-top:2px solid #1a1a2e; background:#f7f7fc; font-weight:700; }
  tr:nth-child(even) td { background:#fafafe; }
  .warn-box th { background:#fde8e8; color:#b42318; }
  .note { color:#777; font-size:9.5px; margin:8px 0 0; line-height:1.5; }
  .foot { margin-top:22px; color:#999; font-size:8.5px; border-top:1px solid #eee; padding-top:6px; }
</style></head><body>
  <h1>Starter-abonnementen</h1>
  <p class="sub-h">JouwAnimatieVideo A.I. · gegenereerd ${GEN} · bron: <b>Mollie API (live)</b></p>
  <div class="cards">
    <div class="card"><div class="k">Actieve Starters</div><div class="v">${starters.length}</div></div>
    <div class="card"><div class="k">MRR (p/m)</div><div class="v">€${mrr.toLocaleString("nl-NL")}</div></div>
    <div class="card"><div class="k">Jaaromzet (×12)</div><div class="v">€${(mrr * 12).toLocaleString("nl-NL")}</div></div>
    ${doubles.length ? `<div class="card warn"><div class="k">Dubbele abo's</div><div class="v">${doubles.length}</div></div>` : ""}
  </div>
  <h2>Groei — cumulatief aantal actieve Starters</h2>
  <div class="chart">${growthSVG(starters)}</div>

  <h2>Cashflow — incasso-kalender (komende cyclus)</h2>
  <table class="flow"><thead><tr><th>Datum</th><th style="text-align:center">Incasso's</th><th style="text-align:right">Bedrag</th><th></th></tr></thead>
    <tbody>${flowHtml}</tbody>
    <tfoot><tr><td>Totaal deze cyclus</td><td style="text-align:center">${starters.length}×</td><td class="eur">€${flowTotal.toFixed(0)}</td><td></td></tr></tfoot></table>
  <p class="note">Elke regel is een dag waarop Mollie automatisch incasseert (eerstvolgende geplande incasso per klant). Daarna herhaalt dit maandelijks op dezelfde dag — dit is dus je terugkerende maandelijkse cashflow (€${flowTotal.toFixed(0)}), verdeeld over de maand. Eigen test-accounts en dubbele abonnementen zijn niet meegeteld.</p>
  ${doubles.length ? `<h2>⚠️ Dubbele actieve abonnementen — ${doubles.length} klant(en)</h2>
  <table class="warn-box"><thead><tr><th>Klant</th><th>Aantal actief</th><th>Abonnementen (bedrag · volgende incasso)</th></tr></thead><tbody>${dblRows}</tbody></table>
  <p class="note">Deze klanten hebben meer dan één ACTIEF abonnement en worden dus meerdere keren afgeschreven. Zeg per klant het overtollige abo op in Mollie vóór de volgende incasso.</p>` : ""}
  <h2>Actieve Starters — ${starters.length}</h2>
  <table><thead><tr><th>#</th><th>Klant (e-mail)</th><th>Afgenomen op</th><th>Volgende afschrijving</th><th>Mollie-abo</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note"><b>Afgenomen op</b> = aanmaakdatum abonnement (Mollie <code>createdAt</code>). <b>Volgende afschrijving</b> = exacte door Mollie geplande incasso (<code>nextPaymentDate</code>), €49/mnd tot opzegging.</p>
  <p class="foot">Alleen actieve Starter-abonnementen (€49/mnd). Rechtstreeks uit de Mollie live-API op ${GEN}. Pro (€99)/Agency (€249) vallen buiten dit overzicht; de dubbele-check kijkt naar álle actieve abonnementen per klant.</p>
</body></html>`;

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
const out = "/Users/samvanmourik/Desktop/Starter-abonnementen.pdf";
await page.pdf({ path: out, format: "A4", printBackground: true, margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" } });
await browser.close();
console.log(`OK — ${starters.length} actieve Starters (€${mrr}/mnd), ${doubles.length} klant(en) met dubbel abo. PDF: ${out}`);
