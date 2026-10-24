import { describe, expect, it } from "vitest";
import { bewegingCredits, heeftScene, leesVelden, nogNodig, publiek, trendCredits, type Trend } from "./types";
import { sceneStap, videoStap, vulTekst } from "./opdracht";

function trend(over: Partial<Trend> = {}): Trend {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    titel: "De goal van Özil",
    uitleg: "Jij maakt die volley.",
    icoon: "⚽",
    methode: "beweging",
    velden: { fotos: [{ label: "Een foto van jezelf, van top tot teen" }], tekst: null },
    bron_links: [],
    voorbeeldclip: "https://x.supabase.co/storage/v1/object/public/scene-assets/trends/clip.mp4",
    voorbeeld_url: null,
    voorbeeld_soort: null,
    gezicht: true,
    hotness: 9,
    status: "voorstel",
    live_op: null,
    created_at: "2026-10-24T00:00:00Z",
    waarom_viral: "Iedereen doet het na",
    origineel: "Echte opname",
    opdracht: { scenePrompt: "The person in a red and white football kit on a stadium pitch.", formaat: "9:16" },
    geluid: null,
    clip_sec: 8,
    bron: "speurtocht",
    updated_at: "2026-10-24T00:00:00Z",
    ...over,
  };
}

describe("trends: prijzen", () => {
  it("beweging rekent per seconde met minstens 40% marge, en kapt af op 15 s", () => {
    expect(bewegingCredits(5)).toBe(6);
    expect(bewegingCredits(10)).toBe(12);
    expect(bewegingCredits(60)).toBe(bewegingCredits(15));
    // 1 credit ≈ €0,098 omzet: de inkoop mag hooguit 60% daarvan zijn.
    for (const s of [1, 3, 7, 12, 15]) expect((s * 0.07) / bewegingCredits(s)).toBeLessThanOrEqual(0.098 * 0.6);
  });

  it("een scène vooraf kost een Pro-beeld extra", () => {
    const met = trendCredits(trend());
    const zonder = trendCredits(trend({ opdracht: { formaat: "9:16" } }));
    expect(met - zonder).toBe(2);
  });

  it("elke methode heeft een prijs", () => {
    for (const methode of ["foto", "tekst-foto", "foto-video", "video-effect", "tekst-video", "beweging", "pratend"] as const) {
      expect(trendCredits(trend({ methode }))).toBeGreaterThan(0);
    }
  });
});

describe("trends: klaar om live te gaan", () => {
  it("beweging zonder trendvideo kan niet live", () => {
    expect(nogNodig(trend({ voorbeeldclip: null }))).toMatch(/trendvideo/);
    expect(nogNodig(trend())).toBeNull();
  });
  it("playback zonder geluid kan niet live", () => {
    expect(nogNodig(trend({ methode: "pratend" }))).toMatch(/geluid/);
    expect(nogNodig(trend({ methode: "pratend", geluid: "https://x/g.mp3" }))).toBeNull();
  });
  it("een tekst-trend heeft een invulveld nodig", () => {
    const t = trend({ methode: "tekst-video", velden: { fotos: [], tekst: null }, opdracht: { bewegingPrompt: "A glass apple being sliced, ASMR." } });
    expect(nogNodig(t)).toMatch(/tekstveld/);
  });
});

describe("trends: opdrachten", () => {
  it("vult {tekst} in, of hangt de invulling erachter", () => {
    expect(vulTekst("A poster saying {tekst}.", 'Hoi "jij"')).toBe("A poster saying Hoi 'jij'.");
    expect(vulTekst("A poster.", "rood")).toBe("A poster. Details from the user: rood");
    expect(vulTekst("A poster.", "")).toBe("A poster.");
  });

  it("beweging: scène met heel lichaam, dan motion control met de trendvideo en het geluid", () => {
    const t = trend();
    const k = { fotos: ["https://x/ik.jpg"], tekst: "" };
    const scene = sceneStap(t, k)!;
    expect(scene.endpoint).toBe("fal-ai/nano-banana-pro/edit");
    expect(String(scene.invoer.prompt)).toMatch(/full body/);
    expect(String(scene.invoer.prompt)).toMatch(/exactly recognizable/);
    const video = videoStap(t, k, "https://x/scene.jpg")!;
    expect(video.endpoint).toMatch(/motion-control/);
    expect(video.invoer).toMatchObject({ image_url: "https://x/scene.jpg", video_url: t.voorbeeldclip, keep_original_sound: true });
  });

  it("beweging zonder scène gebruikt de foto van de klant direct", () => {
    const t = trend({ opdracht: { formaat: "9:16" } });
    expect(heeftScene(t.methode, t.opdracht)).toBe(false);
    expect(sceneStap(t, { fotos: ["https://x/ik.jpg"], tekst: "" })).toBeNull();
    expect(videoStap(t, { fotos: ["https://x/ik.jpg"], tekst: "" }, null)!.invoer.image_url).toBe("https://x/ik.jpg");
  });

  it("een fototrend heeft geen videostap", () => {
    const t = trend({ methode: "foto" });
    expect(videoStap(t, { fotos: ["https://x/ik.jpg"], tekst: "" }, "https://x/s.jpg")).toBeNull();
  });

  it("tekst-foto tekent zonder referentie", () => {
    const t = trend({ methode: "tekst-foto", velden: { fotos: [], tekst: { label: "Tekst" } as never } });
    expect(sceneStap(t, { fotos: [], tekst: "hoi" })!.endpoint).toBe("fal-ai/nano-banana-pro");
  });
});

describe("trends: wat de browser ziet", () => {
  it("geen verborgen opdracht, wel een prijs", () => {
    const p = publiek(trend()) as unknown as Record<string, unknown>;
    expect(p.opdracht).toBeUndefined();
    expect(p.waarom_viral).toBeUndefined();
    expect(p.geluid).toBeUndefined();
    expect(p.credits).toBe(trendCredits(trend()));
  });

  it("velden opschonen: max 2 foto's, leeg tekstveld = geen", () => {
    const v = leesVelden({ fotos: [{ label: "a" }, { label: "b" }, { label: "c" }], tekst: { label: "" } });
    expect(v.fotos).toHaveLength(2);
    expect(v.tekst).toBeNull();
  });
});

import { beeldUitPagina, spelerVoor } from "./voorbeelden";
import { lijktOp } from "./types";

describe("trends: voorbeelden", () => {
  it("herkent video's en maakt er een speler van", () => {
    expect(spelerVoor("https://www.tiktok.com/@more.dejankat/video/7695240623485521153")).toMatch(/tiktok\.com\/player\/v1\/7695240623485521153/);
    expect(spelerVoor("https://youtube.com/shorts/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(spelerVoor("https://www.instagram.com/reel/C1x2y3/")).toBe("https://www.instagram.com/reel/C1x2y3/embed");
    expect(spelerVoor("https://www.tiktok.com/discover/jean-phill-dance-trend")).toBeNull();
  });
  it("vindt het beeld in een artikel en de omslag van een TikTok", () => {
    expect(beeldUitPagina("https://a.nl/x", '<meta property="og:image" content="https://a.nl/b.jpg?a=1&amp;b=2"/>')).toBe("https://a.nl/b.jpg?a=1&b=2");
    expect(beeldUitPagina("https://a.nl/x", '<meta content="/rel.png" name="twitter:image">')).toBe("https://a.nl/rel.png");
    expect(beeldUitPagina("https://www.tiktok.com/@a/video/1", '"cover":"https:\\u002F\\u002Fp16.tiktokcdn.com\\u002Fx.image?a=1"')).toBe("https://p16.tiktokcdn.com/x.image?a=1");
  });
});

describe("trends: dubbele trends", () => {
  it("ziet dezelfde trend onder een andere naam", () => {
    expect(lijktOp("Pray For Me slow-mo-opkomst", "Pray For Me: de slow-mo entree")).toBe(true);
    expect(lijktOp("Y2K Halloween-flitsfoto", "Halloween-flitsfoto uit 2003")).toBe(true);
    expect(lijktOp("De Jean Phil-dans", "Stil in het koor")).toBe(false);
  });
});
