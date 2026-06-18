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
  // alongside the export route. (PDF-tekst gaat via unpdf, dat serverless-proof
  // bundelt en dus niet extern hoeft.)
  serverExternalPackages: ["ffmpeg-static", "playwright", "playwright-core", "@sparticuz/chromium"],
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
