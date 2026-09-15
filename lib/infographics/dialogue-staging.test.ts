import { describe, it, expect } from "vitest";
import {
  kaderVoorScene, buildTwoShotBrief, buildTurnShotPrompt, buildShotPrompt,
  buildDialogueMotionPrompt, buildActionMotionPrompt, wereldRegie,
} from "./dialogue-staging";
import type { DialogueCastMember } from "./dialogue-schema";

// Elke scene kreeg exact hetzelfde kader, en omdat elk regelbeeld een bewerking
// van dat kader is, was de halve video hetzelfde plaatje. Deze rotatie is de
// enige bron van visuele afwisseling tussen scenes, dus dat hij echt wisselt
// hoort vast te liggen.

const lid = (extra: Partial<DialogueCastMember> = {}): DialogueCastMember => ({
  id: "char-1",
  characterId: "uuid-1",
  name: "Tyrel",
  role: "de neef",
  voice: "stem-a",
  portraitUrl: "https://x/t.png",
  position: "left",
  appearance: "oranje trui",
  ...extra,
});
const cast = [lid(), lid({ id: "char-2", characterId: "uuid-2", name: "Lily", position: "right" })];

// Elk beeld wordt los getekend. Het bos wisselde per beeld van seizoen en stijl, en
// Lilly was in één shot kleiner dan op het castblad omdat haar leeftijd meeging.
describe("wereld en lengte", () => {
  it("zet geen leeftijd in het shot; de lengte komt van het castblad", () => {
    const p = buildShotPrompt({ setting: "a forest", inBeeld: [lid({ leeftijd: "6-10 jaar" })], kader: "medium" });
    expect(p).not.toContain("6-10 jaar");
  });

  it("zet de wereld van het gebied er letterlijk in", () => {
    expect(wereldRegie("tall beech trees, brown leaves")).toContain("tall beech trees, brown leaves.");
  });

  it("laat de wereldregel weg als er geen wereld is", () => {
    expect(wereldRegie("  ")).toBe("");
  });
});

describe("kaderVoorScene", () => {
  it("geeft opeenvolgende scenes een ander camerastandpunt", () => {
    for (let i = 0; i < 8; i++) {
      expect(kaderVoorScene(i)).not.toBe(kaderVoorScene(i + 1));
    }
  });

  it("loopt rond in plaats van leeg te lopen", () => {
    expect(kaderVoorScene(0)).toBe(kaderVoorScene(5));
    expect(kaderVoorScene(12)).toBeTruthy();
  });

  it("blijft geldig bij een rare index", () => {
    // Een negatieve of ontbrekende index mag nooit undefined opleveren: dat zou
    // "undefined" letterlijk in de beeld-prompt zetten.
    expect(kaderVoorScene(-1)).toBeTruthy();
    expect(kaderVoorScene(-7)).toBeTruthy();
  });
});

describe("buildTwoShotBrief", () => {
  it("houdt links links en rechts rechts, ongeacht het kader", () => {
    // De sprekerherkenning hangt aan die plekken; wisselen ze mee met de camera,
    // dan wijst de mondcontrole straks de verkeerde persoon aan.
    for (const i of [0, 1, 2, 3, 4]) {
      const brief = buildTwoShotBrief("a living room", cast, i);
      expect(brief).toContain("Tyrel");
      expect(brief).toContain("on the LEFT");
      expect(brief).toContain("Lily");
      expect(brief).toContain("on the RIGHT");
    }
  });

  it("zegt niets over een eerdere kamer als de plek nieuw is", () => {
    expect(buildTwoShotBrief("a kitchen", cast, 0, false)).not.toContain("SAME room");
  });

  it("vraagt om dezelfde kamer zodra de plek al eerder getekend is", () => {
    const brief = buildTwoShotBrief("a living room", cast, 3, true);
    expect(brief).toContain("SAME room");
    expect(brief).toContain("Only the camera has moved");
  });

  it("verbiedt verzonnen tekst in beeld", () => {
    expect(buildTwoShotBrief("a living room", cast, 0)).toContain("never garbled text");
  });
});

// Een scene met één personage. Sinds het scene-beeld alleen nog de spelers van
// die scene toont, komt dit echt voor — en de eerste versie liep er op stuk:
// zeven van de acht scenes werden geweigerd omdat er "twee personages nodig"
// waren, en het model kreeg de opdracht zich naar iemand te draaien die er niet was.

describe("buildTwoShotBrief met één personage", () => {
  const solo = [lid()];

  it("vraagt niet om iemand die er niet is", () => {
    const brief = buildTwoShotBrief("a dark forest", solo, 0);
    expect(brief).not.toContain("TOWARDS EACH OTHER");
    expect(brief).not.toContain("talking together");
    expect(brief).toContain("nobody else");
  });

  it("zet hem in beeld in plaats van links of rechts", () => {
    const brief = buildTwoShotBrief("a dark forest", solo, 0);
    expect(brief).toContain("in the frame");
    expect(brief).not.toContain("on the LEFT");
  });

  it("houdt bij twee personages de oude opstelling aan", () => {
    const brief = buildTwoShotBrief("a living room", cast, 0);
    expect(brief).toContain("on the LEFT");
    expect(brief).toContain("on the RIGHT");
    expect(brief).toContain("TOWARDS EACH OTHER");
  });
});

// Een pratend personage zonder luisteraar. Sinds het scene-beeld alleen de
// spelers van die scene bevat, komt dit voor bij elke scene waarin één iemand
// praat — en dat liet zeven regels stuklopen op "Geen luisteraar in de cast".

describe("buildTurnShotPrompt zonder luisteraar", () => {
  const spreker = lid();

  it("praat niet over iemand die er niet is", () => {
    const p = buildTurnShotPrompt(spreker, [], "blij", "flat-vector");
    expect(p).not.toContain("Everyone else keeps their mouth CLOSED");
    expect(p).not.toContain("listens");
    expect(p).not.toContain("listen in silence");
    expect(p).toContain("NOBODY ELSE");
  });

  it("laat geen halve zin achter waar de luisteraar stond", () => {
    const p = buildTurnShotPrompt(spreker, [], "", null);
    expect(p).not.toMatch(/talks,\s+listen/);
    expect(p).not.toContain("  ");
  });

  it("houdt met een luisteraar de oude tekst aan", () => {
    const ander = lid({ id: "char-2", name: "Lily", position: "right" });
    const p = buildTurnShotPrompt(spreker, [ander], "blij", null);
    expect(p).toContain("Everyone else keeps their mouth CLOSED");
    expect(p).toContain("Lily");
  });
});

// Een shot dat VANAF NUL wordt getekend in plaats van als bewerking van het
// scenebeeld. Dit is de reparatie voor het wegdrijvende uiterlijk: een bewerking
// waarin ook de camera verschuift dwingt het model bijna alles opnieuw te tekenen,
// en dan verzint het het haar er ook bij.

describe("buildShotPrompt", () => {
  const tyrel = lid();
  const lily = lid({ id: "char-2", name: "Lily", position: "right", appearance: "grote bruine afro, geel T-shirt" });

  it("beschrijft de plek, want er is geen beeld om te verbouwen", () => {
    const p = buildShotPrompt({ setting: "a warm living room", inBeeld: [tyrel], kader: "close" });
    expect(p).toContain("a warm living room");
    expect(p).not.toContain("Edit this illustration");
  });

  it("noemt iedereen met uiterlijk, en verbiedt de rest", () => {
    const p = buildShotPrompt({ setting: "a kitchen", inBeeld: [tyrel, lily], spreker: lily, kader: "medium" });
    expect(p).toContain("Lily");
    expect(p).toContain("grote bruine afro");
    expect(p).toContain("nobody else in the frame");
  });

  it("laat bij één personage geen luisteraar bijtekenen", () => {
    const p = buildShotPrompt({ setting: "a forest", inBeeld: [lily], spreker: lily, kader: "close" });
    expect(p).toContain("nobody else in this shot");
    expect(p).not.toContain("Everyone else listens");
  });

  it("houdt bij een actiebeeld alle monden dicht", () => {
    const p = buildShotPrompt({ setting: "a garden", inBeeld: [tyrel, lily], actie: "they run to the tree", kader: "totaal" });
    expect(p).toContain("they run to the tree");
    expect(p).toContain("every mouth stays closed");
  });

  it("zet de cameraregie van het gevraagde kader erin", () => {
    const dichtbij = buildShotPrompt({ setting: "a room", inBeeld: [lily], spreker: lily, kader: "extreme-close" });
    const wijd = buildShotPrompt({ setting: "a room", inBeeld: [lily], kader: "totaal" });
    expect(dichtbij).toContain("EXTREME CLOSE-UP");
    expect(wijd).toContain("WIDE ESTABLISHING");
  });

  // Een beeld dat van een eerder beeld werd afgeleid, kwam fel en overscherp terug
  // naast het zachte plekbeeld. Het shot wordt dus vanaf de omschrijving getekend.
  it("verwijst niet naar een eerder beeld, want dat gaat niet meer mee", () => {
    const p = buildShotPrompt({ setting: "a room", inBeeld: [lily], kader: "close", spreker: lily });
    expect(p).not.toContain("this same location earlier");
    expect(p).not.toContain("source image");
  });

  it("zet de lichtregie van de scène erin", () => {
    expect(buildShotPrompt({ setting: "a room", inBeeld: [lily], kader: "hoog", licht: "nacht" })).toContain("moonlight");
  });

  // Tyrell zei "deze bloem heet een bosanemoon" en er stond geen bloem in beeld:
  // het beeld kreeg de zin niet mee. Wat je ziet komt nu uit de beeldregie.
  it("tekent wat de beeldregie voor dit shot vastlegde", () => {
    const p = buildShotPrompt({
      setting: "a forest", inBeeld: [tyrel], spreker: tyrel, kader: "close",
      beeld: "Tyrell crouches next to a white wood anemone",
    });
    expect(p).toContain("white wood anemone");
    expect(p).toContain("clearly visible");
  });

  it("zet bij een detail geen personages in beeld, hooguit een hand", () => {
    const p = buildShotPrompt({ setting: "a forest", inBeeld: [tyrel, lily], actie: "a white flower", kader: "detail" });
    expect(p).toContain("no faces");
    expect(p).not.toContain("IN THIS SHOT: 2 characters");
  });

  // Bij haar eigen zin stond Lilly links, bij die van Tyrell rechts.
  it("zet de personages van links naar rechts, ook als de rechter praat", () => {
    const p = buildShotPrompt({ setting: "a forest", inBeeld: [lily, tyrel], spreker: lily, kader: "medium" });
    expect(p).toContain("from left to right");
    expect(p.indexOf("Tyrel —")).toBeLessThan(p.indexOf("Lily —"));
  });
});

describe("buildTurnShotPrompt met beeldregie", () => {
  it("laat de bewerking toevoegen wat het shot moet laten zien", () => {
    const [spreker, luisteraar] = cast;
    const p = buildTurnShotPrompt(spreker, [luisteraar], "blij", null, null, "Tyrel holds up a small white flower");
    expect(p).toContain("small white flower");
    expect(p).not.toContain("the same background and props");
  });

  it("verandert niets aan een bewerking zonder beeldregie", () => {
    const [spreker, luisteraar] = cast;
    expect(buildTurnShotPrompt(spreker, [luisteraar], "blij", null, null)).toContain("the same background and props");
  });
});

// Het beeld per shot ligt vast in het storyboard. Wat de beweging daarna nog
// toevoegt, heeft niemand gezien.
describe("bewegingsprompts voegen niets nieuws toe", () => {
  it("bij een gesprek", () => {
    const [spreker, luisteraar] = cast;
    expect(buildDialogueMotionPrompt(spreker, [luisteraar], null, "inzoomen")).toContain("NOTHING NEW");
  });

  it("bij een actiebeeld, dat de handeling al in het eerste frame toont", () => {
    const p = buildActionMotionPrompt("they walk along the forest path", null, "meelopen");
    expect(p).toContain("NOTHING NEW");
    expect(p).toContain("The first frame already shows");
  });
});
