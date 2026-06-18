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
  serverExternalPackages: ["ffmpeg-static", "@resvg/resvg-js"],
  outputFileTracingIncludes: {
    "/api/export": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./lib/export/Inter-Bold.ttf",
    ],
    // De story-export mixt met ffmpeg en rastert de tekst-overlay met resvg in
    // het Inter-font; de voice-route meet de audioduur met ffmpeg.
    "/api/infographics/export-story": ["./node_modules/ffmpeg-static/ffmpeg", "./lib/export/Inter-Bold.ttf"],
    "/api/infographics/scene-voice": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  turbopack: {},
};

export default nextConfig;
