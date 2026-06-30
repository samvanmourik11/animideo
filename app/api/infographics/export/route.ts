import { NextRequest, NextResponse } from "next/server";
import { chromium, type Browser } from "playwright";
import { createClient } from "@/lib/supabase/server";
import { canvasSize } from "@/lib/infographics/canvas-size";
import type { InfographicSpec } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function launchBrowser(): Promise<Browser> {
  // Echte Chrome eerst (sneller), val terug op bundled Chromium met software-rendering.
  try {
    return await chromium.launch({
      channel: "chrome",
      args: ["--no-sandbox", "--headless=new"],
    });
  } catch {
    return await chromium.launch({ args: ["--no-sandbox", "--use-gl=swiftshader"] });
  }
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId } = (await req.json()) as { projectId: string };

    const { data: project } = await supabase
      .from("projects")
      .select("title, infographic_spec")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project?.infographic_spec) {
      return NextResponse.json({ error: "Geen infographic gevonden om te exporteren" }, { status: 404 });
    }

    const spec = project.infographic_spec as InfographicSpec;
    const { width, height } = canvasSize(spec.format);

    // Spec UTF-8-veilig base64-encoden voor de query-param van de render-pagina.
    const b64 = Buffer.from(JSON.stringify(spec), "utf-8").toString("base64");
    // App-URL uit de request-headers: de host die de browser echt gebruikt
    // (localhost in dev, het echte domein in productie). NIET NEXT_PUBLIC_APP_URL,
    // die kan verouderd zijn.
    const host = req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    const appUrl = host ? `${proto}://${host}` : new URL(req.url).origin;
    const renderUrl = `${appUrl}/infographic-render?spec=${encodeURIComponent(b64)}`;

    browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.goto(renderUrl, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction("window.__infographicReady === true", null, { timeout: 30000 });
    // Korte marge voor font-/logo-rendering.
    await page.waitForTimeout(300);

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
    });
    await browser.close();
    browser = null;

    const storagePath = `${user.id}/${projectId}/infographic-${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage
      .from("scene-assets")
      .upload(storagePath, png, { contentType: "image/png", upsert: true });
    if (uploadErr) throw new Error(`Upload mislukt: ${uploadErr.message}`);

    const downloadName = `${(project.title || "infographic").replace(/\s+/g, "-")}.png`;
    const { data: urlData } = supabase.storage
      .from("scene-assets")
      .getPublicUrl(storagePath, { download: downloadName });

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err: unknown) {
    if (browser) await browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographic export failed:", msg);
    return NextResponse.json({ error: "Export mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
