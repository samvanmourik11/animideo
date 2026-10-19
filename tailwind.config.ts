import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // De kleuren van de effect- en app-tegels staan in lib/creaties/recepten.ts.
    "./lib/creaties/**/*.{ts,tsx}",
  ],
  // Licht/donker in de nieuwe app: de kleuren hangen aan CSS-variabelen onder
  // [data-thema] (zie globals.css), en "dark:" geldt binnen een donker thema-blok.
  darkMode: ["variant", "&:is([data-thema=donker] *)"],
  theme: {
    extend: {
      colors: {
        vlak: "rgb(var(--vlak) / <alpha-value>)",
        paneel: "rgb(var(--paneel) / <alpha-value>)",
        "paneel-2": "rgb(var(--paneel-2) / <alpha-value>)",
        zijbalk: "rgb(var(--zijbalk) / <alpha-value>)",
        rand: "rgb(var(--rand) / <alpha-value>)",
        tekst: "rgb(var(--tekst) / <alpha-value>)",
        "tekst-2": "rgb(var(--tekst-2) / <alpha-value>)",
        "tekst-3": "rgb(var(--tekst-3) / <alpha-value>)",
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
