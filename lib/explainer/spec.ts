// Datamodel voor een flat animated explainer (CargoView-stijl): een reeks scenes,
// elk gedreven door een stukje voice-over (narration). De renderer animeert per
// scene een template met een centrale illustratie en icoon-callouts.

export type ExplainerTemplate =
  | "title"
  | "deviceMetrics"  // monitor/centraal beeld met metric-iconen er omheen (arc boven)
  | "orbitIcons"     // centrale cirkel met illustratie, icoon-badges op een ring
  | "boxesCallouts"  // centraal object met callouts links/rechts/onder
  | "lineChart"      // gloeiende lijngrafiek met datapunten en x-labels
  | "journeyPath"    // kronkelend pad met genummerde nodes (icoon + label)
  | "donutCallouts"  // donut/ring met genummerde callouts eromheen
  | "bigStat"        // een of twee reuze kerncijfers
  | "isoSteps"       // isometrische 3D-trap met genummerde stappen
  | "isoDonut"       // isometrische 3D-donut met genummerde callouts
  | "outro";

export interface ExplainerDataPoint {
  label: string;
  value: number;
}

export type Illustration =
  | "monitor"
  | "boxes"
  | "truck"
  | "plane"
  | "ship"
  | "building"
  | "sensor"
  | "none";

export interface ExplainerCallout {
  icon: string;  // keyword uit de explainer-iconenset
  label: string;
}

export interface ExplainerScene {
  id: string;
  template: ExplainerTemplate;
  narration: string;            // voice-over tekst voor deze scene
  title?: string;
  subtitle?: string;
  center: Illustration;
  callouts: ExplainerCallout[];
  data?: ExplainerDataPoint[];  // datapunten voor lineChart / donutCallouts
  bg: string;                   // achtergrondkleur van de scene
  durationSec: number;          // voorlopig geschat; later uit TTS-duur
}

export interface ExplainerTheme {
  primary: string;   // hoofd-merkkleur (badges, accenten), bijv. navy
  accent: string;    // accentkleur (badges variant), bijv. oranje/geel
  ink: string;       // tekst op lichte achtergrond
  onColor: string;   // tekst op een gekleurde achtergrond (meestal wit)
}

// Art-direction over dezelfde scene-structuur heen.
export type ExplainerStyle = "flat" | "bold" | "neon" | "glass" | "geometric";

export interface ExplainerSpec {
  version: 1;
  title: string;
  format: "16:9" | "9:16";
  style: ExplainerStyle;
  theme: ExplainerTheme;
  scenes: ExplainerScene[];
}

// ── Voorbeeld-spec op basis van de AT&T CargoView voice-over, om de
// animatie-engine te testen vóór de AI-generatie er is. ───────────────────────
export const CARGOVIEW_SAMPLE: ExplainerSpec = {
  version: 1,
  title: "CargoView met FlightSafe",
  format: "16:9",
  style: "flat",
  theme: { primary: "#15357A", accent: "#F5A623", ink: "#15357A", onColor: "#FFFFFF" },
  scenes: [
    {
      id: "intro",
      template: "title",
      narration:
        "In de wereldwijde supply chain is het beheren van waardevolle vracht een uitdaging.",
      title: "CargoView",
      subtitle: "met FlightSafe",
      center: "none",
      callouts: [],
      bg: "#E8821E",
      durationSec: 4,
    },
    {
      id: "handlers",
      template: "orbitIcons",
      narration:
        "Vracht wordt onderweg door veel mensen, vervoerders en luchthavens behandeld.",
      title: "Veel schakels, één keten",
      center: "boxes",
      callouts: [
        { icon: "people", label: "Verladers" },
        { icon: "ship", label: "Zeevracht" },
        { icon: "truck", label: "Wegtransport" },
        { icon: "plane", label: "Luchtvracht" },
        { icon: "people", label: "Ontvangers" },
      ],
      bg: "#E8821E",
      durationSec: 6,
    },
    {
      id: "sensors",
      template: "deviceMetrics",
      narration:
        "Slimme sensoren reizen mee en meten temperatuur, druk, licht, schok, beweging en GPS-locatie.",
      title: "Realtime inzicht",
      center: "monitor",
      callouts: [
        { icon: "thermometer", label: "Temperatuur" },
        { icon: "gauge", label: "Druk" },
        { icon: "bulb", label: "Licht" },
        { icon: "shock", label: "Schok" },
        { icon: "gps", label: "GPS-locatie" },
      ],
      bg: "#5BC2F0",
      durationSec: 7,
    },
    {
      id: "boxes",
      template: "boxesCallouts",
      narration:
        "Of je vracht nu temperatuurgevoelig, breekbaar of verzegeld is: CargoView geeft je de informatie die je nodig hebt.",
      title: "Voor elke zending",
      center: "boxes",
      callouts: [
        { icon: "thermometer", label: "Temperatuurgevoelig" },
        { icon: "shield", label: "Verzegeld" },
        { icon: "glass", label: "Breekbaar" },
      ],
      bg: "#F5B92E",
      durationSec: 6,
    },
    {
      id: "outro",
      template: "outro",
      narration: "CargoView. Houd je vracht dichtbij, waar hij ook reist.",
      title: "CargoView",
      subtitle: "Houd je vracht dichtbij",
      center: "none",
      callouts: [],
      bg: "#15357A",
      durationSec: 4,
    },
  ],
};
