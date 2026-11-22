// Gedeelde headless-browser launcher voor alle render-routes (editor-render,
// designed-scenes, infographic/explainer-export).
//
// Op Vercel/Lambda draait de volledige playwright NIET (geen Chrome-binary, bundle
// te groot). Daar gebruiken we playwright-core + @sparticuz/chromium (een Lambda-
// compatibele Chromium). Lokaal (incl. de localhost-demo) blijft de snelle, volledige
// playwright met systeem-Chrome werken — die render verandert dus niet.

import type { Browser } from "playwright-core";

export type { Browser };

const onServerless = () =>
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Chromium in één proces crasht op de server vaak bij het afsluiten en laat dan een
 * crashbestand (core.chromium.*) van bijna 1 GB in /tmp achter. Twee daarvan en de schijf is
 * vol: de volgende browser start niet meer ("Target page, context or browser has been
 * closed"). Gezien bij de Motion graphics-studio op 14-11-2026. Daarom: oude crashbestanden
 * weg, en Chromium starten via een klein script dat geen crashbestanden laat maken.
 */
async function zonderCrashbestanden(echt: string): Promise<string> {
  const { readdir, rm, writeFile, chmod } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = tmpdir();
  for (const n of await readdir(dir).catch(() => [] as string[])) {
    if (/^core(\.|$)/.test(n)) await rm(path.join(dir, n), { force: true }).catch(() => {});
  }
  try {
    const script = path.join(dir, "chromium-zonder-core.sh");
    const { readFile } = await import("node:fs/promises");
    const inhoud = `#!/bin/sh\nulimit -c 0\nexec "${echt}" "$@"\n`;
    // Niet herschrijven als hij al klopt: een draaiende browser start mogelijk net via dit script.
    if ((await readFile(script, "utf8").catch(() => "")) !== inhoud) {
      const tijdelijk = `${script}.${process.pid}.${Date.now()}`;
      await writeFile(tijdelijk, inhoud);
      await chmod(tijdelijk, 0o755);
      const { rename } = await import("node:fs/promises");
      await rename(tijdelijk, script);
    }
    return script;
  } catch {
    return echt;
  }
}

/**
 * Meerdere video's tegelijk op dezelfde server: ze pakten tegelijk Chromium uit naar /tmp en
 * schreven tegelijk het startscript, waardoor de tweede een half uitgepakt programma startte
 * ("browserType.launch: Target page, context or browser has been closed"). Gezien 22-11-2026
 * bij drie docu's tegelijk. Daarom: het opstarten één voor één, en bij mislukken nog twee
 * keer proberen.
 */
let opstartRij: Promise<unknown> = Promise.resolve();

export async function launchBrowser(o: { zonderCrashbestanden?: boolean } = {}): Promise<Browser> {
  if (!onServerless()) return launchEenmaal(o);
  const beurt = opstartRij.then(async () => {
    let laatste: unknown;
    for (let poging = 0; poging < 3; poging++) {
      try {
        return await launchEenmaal(o);
      } catch (e) {
        laatste = e;
        await new Promise((r) => setTimeout(r, 1500 * (poging + 1)));
      }
    }
    throw laatste;
  });
  opstartRij = beurt.catch(() => {});
  return beurt;
}

async function launchEenmaal(o: { zonderCrashbestanden?: boolean }): Promise<Browser> {
  if (onServerless()) {
    const [{ default: sparticuz }, { chromium }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    // Chromium's schijf-cache hard begrenzen: bij een lange frame-render seekt het
    // de videoclips duizenden keren en zou het anders een groeiende media-/disk-
    // cache naar de beperkte Vercel-/tmp (512MB) schrijven → ENOSPC. Met een
    // minimale cache gaat het decoderen via RAM (daar is ruim geheugen).
    return chromium.launch({
      args: [
        ...sparticuz.args,
        "--no-sandbox",
        "--disk-cache-size=1",
        "--media-cache-size=1",
        "--disable-gpu-shader-disk-cache",
        "--disable-application-cache",
      ],
      executablePath: o.zonderCrashbestanden ? await zonderCrashbestanden(await sparticuz.executablePath()) : await sparticuz.executablePath(),
      headless: true,
    });
  }
  // Lokaal: snelle systeem-Chrome, val terug op de bundled Chromium als die ontbreekt.
  const { chromium } = await import("playwright");
  return (chromium
    .launch({ channel: "chrome", args: ["--no-sandbox", "--headless=new"] })
    .catch(() => chromium.launch({ args: ["--no-sandbox"] }))) as Promise<Browser>;
}
