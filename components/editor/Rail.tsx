"use client";

// ── De rail links ────────────────────────────────────────────────────────────
//
// Eén verticale kolom met alles wat je in beeld kunt brengen, en per onderdeel
// een woord eronder. Dat woord is het verschil met de oude editor: die had drie
// knopjes rechtsboven waar je moest raden wat erachter zat.
//
// De volgorde volgt de manier waarop je werkt: eerst een opzet (sjablonen), dan
// wat erin komt (elementen, tekst, merk, eigen bestanden), dan geluid, dan
// gereedschap. De AI-monteur staat onderaan apart — die doet iets anders dan de
// rest: hij bewerkt wat er al staat.

export type RailItem =
  | "sjablonen" | "elementen" | "tekst" | "merk" | "uploads" | "muziek" | "tools" | "monteur" | "versies";

interface Ingang {
  id: RailItem;
  label: string;
  icoon: React.ReactNode;
  /** Alleen voor de monteur: die krijgt een andere kleur, want hij verandert dingen. */
  bijzonder?: boolean;
}

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const RAIL: Ingang[] = [
  {
    id: "sjablonen", label: "Sjablonen",
    icoon: (<><rect x="3" y="3" width="8" height="18" rx="1.5" {...s} /><rect x="13" y="3" width="8" height="8" rx="1.5" {...s} /><rect x="13" y="13" width="8" height="8" rx="1.5" {...s} /></>),
  },
  {
    id: "elementen", label: "Elementen",
    icoon: (<><circle cx="7.5" cy="7.5" r="4.5" {...s} /><rect x="13" y="13" width="8" height="8" rx="1.5" {...s} /><path d="M7.5 13 L12 21 H3 Z" {...s} /></>),
  },
  {
    id: "tekst", label: "Tekst",
    icoon: (<><path d="M5 6V4h14v2" {...s} /><path d="M12 4v16" {...s} /><path d="M8.5 20h7" {...s} /></>),
  },
  {
    id: "merk", label: "Merk",
    icoon: (<><path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z" {...s} /><path d="M9 12l2 2 4-4" {...s} /></>),
  },
  {
    id: "uploads", label: "Uploads",
    icoon: (<><path d="M12 16V4" {...s} /><path d="M8 8l4-4 4 4" {...s} /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" {...s} /></>),
  },
  {
    id: "muziek", label: "Muziek",
    icoon: (<><path d="M9 18V6l10-2v12" {...s} /><circle cx="6.5" cy="18" r="2.5" {...s} /><circle cx="16.5" cy="16" r="2.5" {...s} /></>),
  },
  {
    id: "tools", label: "Tools",
    icoon: (<><path d="M4 20l4-1 10-10a2.1 2.1 0 10-3-3L5 16z" {...s} /><path d="M14.5 5.5l4 4" {...s} /></>),
  },
  {
    id: "monteur", label: "Monteur", bijzonder: true,
    icoon: (<><path d="M12 3v3" {...s} /><rect x="4" y="6" width="16" height="12" rx="3" {...s} /><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" /></>),
  },
  {
    id: "versies", label: "Versies",
    icoon: (<><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" {...s} /><path d="M3 4v4h4" {...s} /><path d="M12 8v4l3 2" {...s} /></>),
  },
];

export default function Rail({
  actief,
  onKies,
}: {
  actief: RailItem | null;
  onKies: (id: RailItem) => void;
}) {
  return (
    <nav className="w-[76px] shrink-0 bg-[#f4f7fd] border-r border-slate-200 flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
      {RAIL.map((item) => {
        const aan = actief === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onKies(item.id)}
            aria-pressed={aan}
            className={`w-[68px] py-2.5 rounded-xl flex flex-col items-center gap-1 transition-colors ${
              aan
                ? "bg-blue-100 text-blue-700"
                : item.bijzonder
                  ? "text-blue-600 hover:bg-blue-50"
                  : "text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>{item.icoon}</svg>
            <span className="text-[11px] font-medium leading-none">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
