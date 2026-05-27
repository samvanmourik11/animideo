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
  // COOP/COEP zijn nodig voor ffmpeg.wasm SharedArrayBuffer in de wizards
  // (Step6Editor). Alleen op die routes zetten — anders blokkeert COEP de
  // Dailymotion iframes op /leren.
  async headers() {
    const isolation = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ];
    return [
      { source: "/studio/:path*", headers: isolation },
      { source: "/project/:path*", headers: isolation },
      { source: "/playground/:path*", headers: isolation },
    ];
  },
  // Turbopack is the default in Next.js 16; no custom webpack config needed
  turbopack: {},
};

export default nextConfig;
