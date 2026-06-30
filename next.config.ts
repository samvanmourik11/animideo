import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  turbopack: {},
};

export default nextConfig;
