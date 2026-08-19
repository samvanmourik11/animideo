import { describe, it, expect } from "vitest";
import { buildManifest, manifestAlsTekst, tijdstip, zoekInTekst } from "./manifest";
import { mainVideoTrack } from "../core/invariants";
import { createEmptyTimeline, DEFAULT_TEXT_STYLE, type TextClip, type TimelineDoc, type VideoClip } from "../timeline";

// Het manifest is alles wat de AI van de montage ziet. Twee eisen: de clip-id's
// moeten er letterlijk in staan (daarmee wijst het model een clip aan) en het
// moet compact blijven — het gaat bij elke chat-beurt mee.

function doc(): TimelineDoc {
  const d = createEmptyTimeline("9:16");
  mainVideoTrack(d)!.clips = [
    {
      id: "clp_1", type: "video", src: "x", start: 0, duration: 4,
      meta: { sceneIndex: 1, transcript: "Elke ondernemer kent dit probleem", genPrompt: "kantoor, vrouw achter laptop, ochtendlicht" },
    } as VideoClip,
    {
      id: "clp_2", type: "video", src: "x", start: 4, duration: 6,
      meta: { sceneIndex: 2, label: "De oplossing", transcript: "Daarom bieden we een gratis proefperiode aan" },
    } as VideoClip,
  ];
  d.tracks.find((t) => t.kind === "text")!.clips = [
    { id: "txt_1", type: "text", text: "Gratis proberen", style: DEFAULT_TEXT_STYLE, start: 2, duration: 3 } as TextClip,
  ];
  return d;
}

describe("buildManifest", () => {
  it("neemt id, tijd en inhoud per clip mee", () => {
    const m = buildManifest(doc());
    const video = m.sporen.find((s) => s.kind === "video")!;
    expect(video.clips[0]).toMatchObject({
      id: "clp_1",
      start: 0,
      duration: 4,
      tekst: "Elke ondernemer kent dit probleem",
    });
    expect(m.totaal).toBe(10);
  });

  it("gebruikt het label uit meta, anders het scènenummer", () => {
    const m = buildManifest(doc());
    const video = m.sporen.find((s) => s.kind === "video")!;
    expect(video.clips[0].label).toBe("Scène 1");
    expect(video.clips[1].label).toBe("De oplossing");
  });

  it("laat lege sporen weg", () => {
    const m = buildManifest(doc());
    expect(m.sporen.map((s) => s.kind)).toEqual(["video", "text"]);
  });

  it("kort lange teksten af zodat het manifest compact blijft", () => {
    const d = createEmptyTimeline("16:9");
    mainVideoTrack(d)!.clips = [
      { id: "clp_lang", type: "video", src: "x", start: 0, duration: 3, meta: { transcript: "woord ".repeat(80) } } as VideoClip,
    ];
    const clip = buildManifest(d).sporen[0].clips[0];
    expect(clip.tekst!.length).toBeLessThanOrEqual(90);
    expect(clip.tekst!.endsWith("…")).toBe(true);
  });
});

describe("manifestAlsTekst", () => {
  it("noemt elke clip-id letterlijk, want daarmee wijst het model ze aan", () => {
    const tekst = manifestAlsTekst(doc());
    expect(tekst).toContain("clp_1");
    expect(tekst).toContain("clp_2");
    expect(tekst).toContain("txt_1");
  });

  it("zet tijden in leesbare vorm naast de seconden", () => {
    const tekst = manifestAlsTekst(doc());
    expect(tekst).toContain("0:00-0:04");
    expect(tekst).toContain("totale lengte 0:10");
  });

  it("blijft klein: een montage van 20 clips past ruim in een prompt", () => {
    const d = createEmptyTimeline("16:9");
    mainVideoTrack(d)!.clips = Array.from({ length: 20 }, (_, i) => ({
      id: `clp_${i}`, type: "video", src: "x", start: i * 5, duration: 5,
      meta: { sceneIndex: i + 1, transcript: "Een normale gesproken zin van een stuk of tien woorden hier." },
    })) as VideoClip[];
    // Ruwweg 4 tekens per token: ~2.000 tekens is ~500 tokens.
    expect(manifestAlsTekst(d).length).toBeLessThan(3000);
  });

  it("zegt het eerlijk als er nog niets staat", () => {
    expect(manifestAlsTekst(createEmptyTimeline("16:9"))).toContain("nog geen clips");
  });
});

describe("zoekInTekst", () => {
  it("vindt de clip waarin iets gezegd wordt", () => {
    const treffers = zoekInTekst(doc(), "proefperiode");
    expect(treffers.map((c) => c.id)).toEqual(["clp_2"]);
  });

  it("zoekt ook in de beeld-prompt en het label", () => {
    expect(zoekInTekst(doc(), "ochtendlicht").map((c) => c.id)).toEqual(["clp_1"]);
    expect(zoekInTekst(doc(), "oplossing").map((c) => c.id)).toEqual(["clp_2"]);
  });

  it("geeft niets terug bij een lege zoekterm", () => {
    expect(zoekInTekst(doc(), "   ")).toEqual([]);
  });
});

describe("tijdstip", () => {
  it("rekent seconden om naar minuten:seconden", () => {
    expect(tijdstip(0)).toBe("0:00");
    expect(tijdstip(74.5)).toBe("1:15");
    expect(tijdstip(600)).toBe("10:00");
  });
});
