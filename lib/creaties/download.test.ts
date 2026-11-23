import { describe, expect, it } from "vitest";
import { downloadLink, downloadNaam } from "./download";

const OPSLAG = "https://x.supabase.co/storage/v1/object/public/scene-assets/u1/creaties/abc.mp4";

describe("downloadLink", () => {
  it("zet ?download= met een nette bestandsnaam achter een opslag-url", () => {
    expect(downloadLink(OPSLAG, "animideo-video-abc12345")).toBe(`${OPSLAG}?download=animideo-video-abc12345.mp4`);
  });
  it("vervangt een bestaande query", () => {
    expect(downloadLink(`${OPSLAG}?t=1`, "clip")).toBe(`${OPSLAG}?download=clip.mp4`);
  });
  it("laat urls van buiten onze opslag met rust", () => {
    expect(downloadLink("https://fal.media/files/a.mp4", "clip")).toBe("https://fal.media/files/a.mp4");
  });
});

describe("downloadNaam", () => {
  it("neemt de extensie van de bron over en haalt vreemde tekens weg", () => {
    expect(downloadNaam("https://x/y/stem.MP3", "Mijn stem: versie 2!")).toBe("Mijn-stem-versie-2.mp3");
  });
  it("valt terug op een vaste naam", () => {
    expect(downloadNaam("https://x/y/z.png", "***")).toBe("animideo.png");
  });
});
