"use client";

import { useState } from "react";
import type { Character } from "@/lib/types";
import CharacterStudio from "@/components/characters/CharacterStudio";

export default function CharactersClient({
  initialCharacters,
}: {
  initialCharacters: Character[];
}) {
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);

  function addCharacter(c: Character) {
    setCharacters((prev) => [c, ...prev]);
  }
  function removeCharacter(id: string) {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Personages</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Maak hier vaste personages die je in alle tools kan kiezen als hoofdpersoon.
        </p>
      </div>
      <CharacterStudio
        characters={characters}
        onAdd={addCharacter}
        onRemove={removeCharacter}
      />
    </div>
  );
}
