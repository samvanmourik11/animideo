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
    await writeFile(script, `#!/bin/sh\nulimit -c 0\nexec "${echt}" "$@"\n`);
    await chmod(script, 0o755);
    return script;
  } catch {
    return echt;
  }
}

export async function launchBrowser(o: { zonderCrashbestanden?: boolean } = {}): Promise<Browser> {
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
