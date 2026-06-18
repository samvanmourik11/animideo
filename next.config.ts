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
  // ffmpeg-static ships a platform binary. Mark it external so Next/Turbopack
  // don't try to bundle it, and trace-include the binary so it's deployed
  // alongside the export route.
  // pdf-parse (via pdfjs-dist) laadt een worker-module relatief uit node_modules.
  // Bundelen breekt dat pad ("Cannot find module pdf.worker.mjs"), dus extern houden.
  serverExternalPackages: ["ffmpeg-static", "playwright", "playwright-core", "@sparticuz/chromium", "pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/export": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./lib/export/Inter-Bold.ttf",
    ],
    // De story-export schiet per scene een tekst-screenshot (chromium) en mixt
    // met ffmpeg; de voice-route meet de audioduur met ffmpeg. Beide hebben de
    // ffmpeg-binary nodig op Vercel.
    "/api/infographics/export-story": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/infographics/scene-voice": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  turbopack: {},
};

export default nextConfig;
