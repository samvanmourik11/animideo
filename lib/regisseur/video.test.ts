import { describe, expect, it, vi } from "vitest";

// Alleen de rekenstukjes; de echte aanroepen (OpenAI, opslag) laden we niet.
vi.mock("@/lib/openai", () => ({ transcribeWords: vi.fn() }));
vi.mock("@/lib/creaties/wachtrij", () => ({ uploadNaarOpslag: vi.fn() }));
import { formaatVan, leesKop, momenten, regelsUitWoorden, tijd } from "./video";

describe("video-bijlage", () => {
  it("leest duur, afmetingen en geluid uit de ffmpeg-kop", () => {
    const kop = leesKop(`  Duration: 00:01:05.40, start: 0.000000, bitrate: 2000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080, 1900 kb/s, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s`);
    expect(kop).toEqual({ duur: 65.4, breedte: 1920, hoogte: 1080, geluid: true });
  });

  it("draait de afmetingen om bij een staand gefilmde telefoonvideo", () => {
    const kop = leesKop(`  Duration: 00:00:10.00
  Stream #0:0: Video: hevc (Main), yuv420p, 1920x1080, 30 fps
      displaymatrix: rotation of -90.00 degrees`);
    expect([kop.breedte, kop.hoogte, kop.geluid]).toEqual([1080, 1920, false]);
    expect(formaatVan(kop.breedte, kop.hoogte)).toBe("9:16");
  });

  it("pakt 4 tot 12 beelden, midden in gelijke stukken", () => {
    expect(momenten(8)).toEqual([1, 3, 5, 7]);
    expect(momenten(600)).toHaveLength(12);
    expect(momenten(30)).toHaveLength(6);
  });

  it("maakt regels per zin met tijden", () => {
    const w = (word: string, start: number) => ({ word, start, end: start + 0.4 });
    expect(regelsUitWoorden([w("Hallo", 0.2), w("allemaal.", 0.7), w("Welkom", 61), w("hier!", 61.5)])).toBe("[0:00] Hallo allemaal.\n[1:01] Welkom hier!");
    expect(tijd(125.9)).toBe("2:05");
  });
});
