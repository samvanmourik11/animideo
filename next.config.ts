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
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/export": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./lib/export/Inter-Bold.ttf",
    ],
  },
  turbopack: {},
};

export default nextConfig;
