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

export async function launchBrowser(): Promise<Browser> {
  if (onServerless()) {
    const [{ default: sparticuz }, { chromium }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("playwright-core"),
    ]);
    return chromium.launch({
      args: [...sparticuz.args, "--no-sandbox"],
      executablePath: await sparticuz.executablePath(),
      headless: true,
    });
  }
  // Lokaal: snelle systeem-Chrome, val terug op de bundled Chromium als die ontbreekt.
  const { chromium } = await import("playwright");
  return (chromium
    .launch({ channel: "chrome", args: ["--no-sandbox", "--headless=new"] })
    .catch(() => chromium.launch({ args: ["--no-sandbox"] }))) as Promise<Browser>;
}
