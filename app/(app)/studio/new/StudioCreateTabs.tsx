"use client";

import { useState } from "react";
import CreateForm from "./CreateForm";
import CharacterStudio from "@/components/characters/CharacterStudio";
import { BrandKit, Character } from "@/lib/types";

interface Props {
  userId:     string;
  brandKits:  BrandKit[];
  characters: Character[];
}

type Tab = "project" | "characters";

export default function StudioCreateTabs({ userId, brandKits, characters: initialCharacters }: Props) {
  const [tab, setTab] = useState<Tab>("project");
  const [characters, setCharacters] = useState<Character[]>(initialCharacters);

  function addCharacter(c: Character) {
    setCharacters(prev => [c, ...prev]);
  }
  function removeCharacter(id: string) {
    setCharacters(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div>
      <div className="flex items-center gap-1 p-1 bg-slate-950/60 border border-white/10 rounded-lg w-fit mb-5">
        <button
          type="button"
          onClick={() => setTab("project")}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${
            tab === "project" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-white/5"
          }`}
        >
          🎬 Project
        </button>
        <button
          type="button"
          onClick={() => setTab("characters")}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition ${
            tab === "characters" ? "bg-cyan-600 text-white" : "text-slate-300 hover:bg-white/5"
          }`}
        >
          👥 Karakters {characters.length > 0 && <span className="text-[10px] opacity-70">({characters.length})</span>}
        </button>
      </div>

      {tab === "project" && (
        <CreateForm
          userId={userId}
          brandKits={brandKits}
          characters={characters}
          onSwitchToCharacters={() => setTab("characters")}
        />
      )}
      {tab === "characters" && (
        <CharacterStudio
          characters={characters}
          onAdd={addCharacter}
          onRemove={removeCharacter}
        />
      )}
    </div>
  );
}
