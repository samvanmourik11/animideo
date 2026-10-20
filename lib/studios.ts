// De Studio's in de nieuwe app: de grote tools met hun eigen werkwijze (meerdere stappen,
// scenes, een storyboard). Ze krijgen een eigen kopje in het menu en een startpagina met
// je projecten; de tool zelf werkt precies zoals hij werkte. Client-veilig.

export interface Studio {
  id: "storytelling" | "dialoog";
  naam: string;
  icoon: string;
  uitleg: string;
  /** De tool zelf; een bestaand project opent met ?project=<id>. */
  pad: string;
  /** projects.mode van deze tool. */
  mode: "story" | "dialogue";
  /** Maker van de eindvideo's in de bibliotheek (lib/creaties/studio-video.ts). */
  maker: "storytelling" | "dialoog";
  nieuw: string;
}

export const STUDIOS: Studio[] = [
  {
    id: "storytelling",
    naam: "Storytelling",
    icoon: "📖",
    uitleg: "Een verhaal met illustraties en voice-over: de AI schrijft de verhaalboog en tekent elke scene.",
    pad: "/infographics/story",
    mode: "story",
    maker: "storytelling",
    nieuw: "Nieuw verhaal",
  },
  {
    id: "dialoog",
    naam: "Dialoog",
    icoon: "💬",
    uitleg: "Twee of drie personages die met elkaar praten, met echte stemmen en lipsync.",
    pad: "/infographics/dialogue",
    mode: "dialogue",
    maker: "dialoog",
    nieuw: "Nieuwe dialoog",
  },
];

export function studio(id: unknown): Studio | null {
  return STUDIOS.find((s) => s.id === id) ?? null;
}
