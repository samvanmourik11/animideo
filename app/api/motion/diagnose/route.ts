import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { isTeamAccount } from "@/lib/studio/access";
import { launchBrowser } from "@/lib/browser";
import { paginaHtml } from "@/lib/motion/pagina";

export const runtime = "nodejs";
export const maxDuration = 120;

// TIJDELIJK (14-11-2026): uitzoeken waarom de headless browser op Vercel omvalt bij het
// tekenen van een motion-pagina. Alleen voor ons team. Weghalen zodra het is opgelost.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isTeamAccount(user.email)) return NextResponse.json({ error: "nee" }, { status: 403 });
  const v = req.nextUrl.searchParams.get("v") ?? "a";
  if (v.startsWith("t")) {
    // Snelheid: 40 beelden tekenen + fotograferen. t1080 / t720, "-b" = zonder vervaging.
    const h = v.includes("720") ? 720 : 1080, w = Math.round(h * 16 / 9);
    const code = await readFile(path.join(process.cwd(), "public", "motion", "voorbeeld.js"), "utf8");
    const SCRIPT: [string, string][] = [["s1", "Ken je dat? De telefoon gaat, maar je staat net te knippen. Weer een gemiste afspraak."], ["eind", "Kapsalon Knip laat het je zien."]];
    let t = 0;
    const woorden = SCRIPT.flatMap(([, tekst]) => tekst.split(/\s+/).map((word) => { const x = { word, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }; t += 0.4; return x; }));
    let html = await paginaHtml({ w, h, woorden, script: SCRIPT, code, merk: { naam: "Knip", website: "", kleur: "#7b3ff2", kleur2: "#ffc21a" } });
    if (v.includes("-b")) html = html.replace('filter="url(#zacht)"', "");
    const b = await launchBrowser({ zonderCrashbestanden: true });
    const tijden: string[] = [];
    try {
      const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await pg.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
      await pg.waitForFunction("window.READY === true", null, { timeout: 30000 });
      let tr = 0, ts = 0;
      for (let f = 0; f < 40; f++) {
        const a1 = Date.now(); await pg.evaluate(`window.render(${(f * 5) / 25})`); const a2 = Date.now();
        await pg.screenshot({ type: "jpeg", quality: 92 }); const a3 = Date.now();
        tr += a2 - a1; ts += a3 - a2;
      }
      tijden.push(`render ${Math.round(tr / 40)}ms/beeld, foto ${Math.round(ts / 40)}ms/beeld`);
    } catch (e) { tijden.push(String(e).slice(0, 300)); } finally { await b.close().catch(() => {}); }
    return NextResponse.json({ v, tijden });
  }
  if (v === "p") {
    // Drie browsers tegelijk starten en een pagina laten tekenen, zoals drie hoofdstukken tegelijk.
    const uit = await Promise.all([0, 1, 2].map(async (k) => {
      const t1 = Date.now();
      try {
        const b = await launchBrowser();
        const pg = await b.newPage();
        await pg.setContent("<p>hoi</p>", { waitUntil: "domcontentloaded", timeout: 30000 });
        await pg.screenshot();
        await b.close();
        return `${k}: goed ${Date.now() - t1}ms`;
      } catch (e) { return `${k}: FOUT ${String(e).slice(0, 300)}`; }
    }));
    return NextResponse.json({ v, uit });
  }
  const log: string[] = [];
  const t0 = Date.now();
  const stap = (s: string) => log.push(`${Date.now() - t0}ms ${s}`);
  const code = await readFile(path.join(process.cwd(), "public", "motion", "voorbeeld.js"), "utf8").catch(() => "window.VIDEO={scenes:[]}");
  const SCRIPT: [string, string][] = [["s1", "Ken je dat? De telefoon gaat."], ["eind", "Kapsalon Knip laat het je zien."]];
  let t = 0;
  const woorden = SCRIPT.flatMap(([, tekst]) => tekst.split(/\s+/).map((word) => { const w = { word, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }; t += 0.4; return w; }));
  let html = "";
  try {
    html = await paginaHtml({ w: 1920, h: 1080, woorden, script: SCRIPT, code, merk: { naam: "Knip", website: "", kleur: "#7b3ff2", kleur2: "#ffc21a" } });
    stap(`html ${html.length} tekens`);
  } catch (e) { stap(`html-fout ${String(e)}`); }
  if (v.includes("f")) html = html.replace(/<link[^>]+fonts[^>]+>/, "");
  if (v.includes("s")) html = "<!doctype html><html><body><svg width=200 height=200><circle cx=50 cy=50 r=40 fill=red /></svg><script>window.READY=true</script></body></html>";
  const browser = await launchBrowser().catch((e) => { stap(`launch-fout ${String(e)}`); return null; });
  if (!browser) return NextResponse.json({ log });
  stap(`browser ${browser.version()}`);
  browser.on("disconnected", () => stap("browser disconnected"));
  try {
    const pagina = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    pagina.on("crash", () => stap("pagina crash"));
    pagina.on("console", (m) => { if (log.length < 60) stap(`console ${m.type()} ${m.text().slice(0, 200)}`); });
    stap("pagina open");
    if (!v.includes("r")) {
      await pagina.route("**/*", (route) => {
        const url = route.request().url();
        return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) || url.startsWith("data:") || url === "about:blank" ? route.continue() : route.abort();
      });
      stap("route gezet");
    }
    if (v.includes("g")) await pagina.goto("data:text/html;base64," + Buffer.from(html).toString("base64"), { waitUntil: "domcontentloaded", timeout: 30000 });
    else await pagina.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    stap("inhoud gezet");
    await pagina.waitForFunction("window.READY === true", null, { timeout: 30000 });
    stap("klaar");
    const s = (await pagina.evaluate("({ einde: window.END, scenes: window.SCENES, fouten: window.FOUTEN })")) as unknown;
    stap(`stand ${JSON.stringify(s).slice(0, 300)}`);
    if (!v.includes("s")) { await pagina.evaluate("window.render(1)"); stap("render 1"); }
    const jpg = await pagina.screenshot({ type: "jpeg", quality: 60 });
    stap(`screenshot ${jpg.length} bytes`);
  } catch (e) {
    stap(`FOUT ${e instanceof Error ? e.message.slice(0, 400) : String(e)}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return NextResponse.json({ v, log });
}
