"use client";

// De drie bibliotheken achter één rij tabjes. De inhoud per tabje is ongewijzigd:
// dit zijn dezelfde clients als voorheen, alleen niet meer op drie losse adressen.
//
// Het gekozen tabje staat in de URL (?tab=voorwerpen), zodat een link naar een
// bepaald tabje blijft werken en de knop "terug" in de browser doet wat je
// verwacht.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Character } from "@/lib/types";
import type { BibliotheekVoorwerp } from "@/lib/infographics/voorwerp-bibliotheek";
import type { BibliotheekOmgeving } from "@/lib/infographics/omgeving-bibliotheek";
import CharactersClient from "../characters/CharactersClient";
import VoorwerpenClient from "../voorwerpen/VoorwerpenClient";
import OmgevingenClient from "../omgevingen/OmgevingenClient";

export type BibliotheekTab = "personages" | "voorwerpen" | "omgevingen";

export default function BibliotheekClient({
  startTab,
  magObjecten,
  magRealistisch,
  characters,
  voorwerpen,
  voorwerpenNietActief,
  omgevingen,
  omgevingenNietActief,
}: {
  startTab: BibliotheekTab;
  magObjecten: boolean;
  /** Mag dit account de realistische stijl kiezen? (zie lib/studio/access.ts) */
  magRealistisch: boolean;
  characters: Character[];
  voorwerpen: BibliotheekVoorwerp[];
  voorwerpenNietActief: boolean;
  omgevingen: BibliotheekOmgeving[];
  omgevingenNietActief: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<BibliotheekTab>(magObjecten ? startTab : "personages");

  const tabs: { id: BibliotheekTab; label: string; uitleg: string }[] = [
    { id: "personages", label: "Personages", uitleg: "Mensen die in meerdere video's hetzelfde horen te zijn" },
    { id: "voorwerpen", label: "Voorwerpen", uitleg: "Dingen die er in elke video hetzelfde uitzien" },
    { id: "omgevingen", label: "Omgevingen", uitleg: "Plekken die in elke video dezelfde plek zijn" },
  ];

  function kies(id: BibliotheekTab) {
    setTab(id);
    // Vervangen in plaats van toevoegen: anders staat de hele geschiedenis vol
    // met tabwissels en moet je tien keer op terug drukken.
    router.replace(`/bibliotheek?tab=${id}`, { scroll: false });
  }

  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <h1 className="text-xl font-bold text-white mb-1">Bibliotheek</h1>
      <p className="text-sm text-slate-400 mb-4">
        Wat je hier vastlegt, ziet er in al je video&apos;s hetzelfde uit.
      </p>

      <div className="flex flex-wrap gap-1.5 border-b border-white/10 mb-5">
        {tabs.map((t) => {
          const dicht = !magObjecten && t.id !== "personages";
          if (dicht) return null;
          return (
            <button
              key={t.id}
              onClick={() => kies(t.id)}
              title={t.uitleg}
              className={`px-3 py-2 text-sm rounded-t-lg border-b-2 transition ${
                tab === t.id
                  ? "border-orange-400 text-white bg-white/5"
                  : "border-transparent text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* De clients tekenen zelf hun eigen kop; die verbergen we hier met een
          negatieve marge niet — ze staan als onderkop prima onder het tabje. */}
      {tab === "personages" && <CharactersClient initialCharacters={characters} magRealistisch={magRealistisch} />}
      {tab === "voorwerpen" && (
        <VoorwerpenClient initialVoorwerpen={voorwerpen} nietActief={voorwerpenNietActief} fout={null} magRealistisch={magRealistisch} />
      )}
      {tab === "omgevingen" && (
        <OmgevingenClient initialOmgevingen={omgevingen} nietActief={omgevingenNietActief} fout={null} magRealistisch={magRealistisch} />
      )}
    </div>
  );
}
