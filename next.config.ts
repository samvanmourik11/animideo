import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Alleen de dev-server: de tijdelijke tunnel (cloudflared) om de Claude-app-connector te
  // testen. Zonder dit blokkeert Next de scripts voor dat adres en werkt geen enkele knop.
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Native binaries niet bundelen maar als extern pakket laten staan: ffmpeg-static
  // (video) en @resvg/resvg-js (SVG->PNG voor de tekst-overlay van de story-export).
  // PDF-tekst gaat via unpdf (serverless-proof, hoeft niet extern).
  // @sparticuz/chromium + playwright-core leveren de headless browser op Vercel;
  // extern houden zodat de Chromium-binary en de package-bestanden meegaan.
  serverExternalPackages: ["ffmpeg-static", "@resvg/resvg-js", "@sparticuz/chromium", "playwright-core", "playwright"],
  outputFileTracingIncludes: {
    "/api/export": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./lib/export/Inter-Bold.ttf",
    ],
    // De story-export mixt met ffmpeg en rastert de tekst-overlay met resvg in
    // het Inter-font; de voice-route meet de audioduur met ffmpeg.
    "/api/infographics/export-story": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Inter-Bold.ttf"],
    "/api/infographics/scene-voice": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Nieuwe app: de reclame wordt gemonteerd in het verzoek dat de wachtrij laat
    // doorlopen (lib/reclame/montage.ts), met Poppins voor de tekst in beeld.
    "/api/creaties": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Poppins-Bold.ttf", "./lib/export/Arvo-Bold.ttf"],
    "/api/creaties/lopend": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Poppins-Bold.ttf", "./lib/export/Arvo-Bold.ttf"],
    // Stem & Lipsync: opnames omzetten naar mp3.
    "/api/stem/upload": ["./node_modules/ffmpeg-static/ffmpeg"],
    // De Regisseur start makers (ook de montage) vanuit zijn eigen routes.
    "/api/regisseur": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Poppins-Bold.ttf", "./lib/export/Arvo-Bold.ttf"],
    "/api/regisseur/[id]": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Poppins-Bold.ttf", "./lib/export/Arvo-Bold.ttf"],
    // De trailer wordt geschreven met het regelboek van het genre als opdracht.
    "/api/trailer/plan": ["./lib/trailer/regels/**"],
    // Delen maakt van een video een voorbeeldplaatje voor WhatsApp en LinkedIn.
    "/api/creaties/[id]/delen": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/creaties/[id]/profiel": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/creaties/[id]/voorpagina": ["./node_modules/ffmpeg-static/ffmpeg"],
    // Chromium-render-routes: naast ffmpeg ook de VOLLEDIGE playwright-core
    // (incl. browsers.json) en de @sparticuz/chromium-binary meetracen — anders
    // faalt de launch op Vercel met "Cannot find module .../browsers.json".
    "/api/editor/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/api/studio/render-designed-scene": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/api/infographics/export-video": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/api/infographics/export": [
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/api/explainer/export": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
    "/api/explainer/export-to-editor": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/playwright-core/**",
      "./node_modules/@sparticuz/chromium/**",
    ],
  },
  // animideo.nl/@bakkerijjansen → de openbare profielpagina. Een map met een @ in de
  // naam kent de router niet, vandaar een herschrijving.
  async rewrites() {
    return [{ source: "/@:handle", destination: "/maker/:handle" }];
  },
  turbopack: {},
};

export default nextConfig;
