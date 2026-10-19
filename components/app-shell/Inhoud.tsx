"use client";

import { usePathname } from "next/navigation";
import { isNieuwePagina } from "./thema";

// De oude tools (Studio's, personages, account …) zijn gebouwd met vaste donkere kleuren:
// witte tekst zonder eigen achtergrond. In het lichte thema zou die tekst onleesbaar
// worden. Daarom houden ze een eigen donker blok tot ze zelf zijn omgebouwd.
export default function Inhoud({ children }: { children: React.ReactNode }) {
  const pad = usePathname();
  if (isNieuwePagina(pad)) {
    return <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">{children}</main>;
  }
  return (
    <div data-thema="donker" className="min-h-screen bg-[#060d1f] text-white">
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
