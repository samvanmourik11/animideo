import { beforeEach, describe, expect, test, vi } from "vitest";

// Een nep-database (één regieproject + creaties) en een nep-Claude met vooraf
// klaargezette antwoorden. Zo testen we de lus: pauzeren, bevestigen, volgorde.
const db = { project: null as Record<string, unknown> | null, creaties: [] as Record<string, unknown>[], geheugen: "" };
const antwoorden: Record<string, unknown>[] = [];
const verzoeken: Record<string, unknown>[] = [];
const gestart: { maker: string; invoer: Record<string, unknown> }[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabel: string) => {
      let wijziging: Record<string, unknown> | null = null;
      const filters: [string, unknown][] = [];
      const keten = {
        select: () => keten,
        update: (w: Record<string, unknown>) => ((wijziging = w), keten),
        upsert: async (rij: { tekst: string }) => ((db.geheugen = rij.tekst), { error: null }),
        eq: (k: string, v: unknown) => (filters.push([k, v]), keten),
        in: (k: string, v: unknown[]) => (filters.push([k + ":in", v]), keten),
        limit: () => keten,
        single: async () => resultaat(),
        maybeSingle: async () => resultaat(),
        then: (ok: (r: unknown) => void) => ok(resultaat()),
      };
      function resultaat() {
        if (tabel === "regie_geheugen") return { data: db.geheugen ? { tekst: db.geheugen } : null };
        if (tabel === "creaties") {
          const ids = filters.find(([k]) => k === "id:in")?.[1] as string[] | undefined;
          return { data: db.creaties.filter((c) => !ids || ids.includes(c.id as string)) };
        }
        const statusIn = filters.find(([k]) => k === "status:in")?.[1] as string[] | undefined;
        if (wijziging) {
          if (statusIn && !statusIn.includes(db.project!.status as string)) return { data: [] };
          Object.assign(db.project!, wijziging);
          return { data: [db.project] };
        }
        return { data: db.project };
      }
      return keten;
    },
  }),
}));
vi.mock("@/lib/creaties/wachtrij", () => ({
  verversLopende: async (l: unknown[]) => l,
  startCreatie: async (_u: string, maker: string, invoer: Record<string, unknown>) => {
    gestart.push({ maker, invoer });
    return { id: `c${gestart.length}`, status: "bezig" };
  },
}));
vi.mock("@/lib/reclame/pagina", () => ({ leesProductpagina: async () => ({ naam: "Mok", fotos: [] }) }));
vi.mock("./montage", () => ({ montageCredits: () => 0, leesMontage: (x: { clipIds: string[] }) => ({ ...x, clipIds: x.clipIds }) }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/openai", () => ({ openai: {}, transcribeWords: async () => ({ words: [] }) }));
vi.mock("@/lib/team/team", () => ({}));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { stream: (v: Record<string, unknown>) => (verzoeken.push(structuredClone(v)), { finalMessage: async () => antwoorden.shift() }) } };
  }
  return { default: Anthropic };
});

process.env.ANTHROPIC_API_KEY = "test";
const { draai, beantwoord, bevestig, controleerMaken, maakInhoud } = await import("./agent");

const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const tool = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });
const zegt = (...content: unknown[]) => ({ stop_reason: content.some((c) => (c as { type: string }).type === "tool_use") ? "tool_use" : "end_turn", content, usage });

beforeEach(() => {
  db.project = { id: "p1", user_id: "u1", titel: "t", berichten: [{ role: "user", content: "Maak een reclame" }], status: "denkt", wachtend: null, galerij: [], automatisch: false, gebruik: {} };
  db.creaties = [];
  db.geheugen = "";
  antwoorden.length = 0;
  verzoeken.length = 0;
  gestart.length = 0;
});

describe("de Regisseur", () => {
  test("een vraag pauzeert; het antwoord gaat terug als tool-resultaat en hij gaat verder", async () => {
    antwoorden.push(zegt({ type: "text", text: "Even checken." }, tool("v1", "vraag_keuze", { vraag: "Welke stijl?", opties: ["Strak", "Vrolijk"] })));
    await draai("p1");
    expect(db.project!.status).toBe("wacht_op_antwoord");
    expect((db.project!.wachtend as { opties: { label: string }[] }).opties.map((o) => o.label)).toEqual(["Strak", "Vrolijk"]);

    antwoorden.push(zegt({ type: "text", text: "Top, strak dus." }));
    await beantwoord(db.project as never, "Strak");
    const berichten = db.project!.berichten as { role: string; content: unknown }[];
    const res = berichten[2].content as { tool_use_id: string; content: string }[];
    expect(res[0]).toMatchObject({ tool_use_id: "v1", content: "Antwoord van de gebruiker: Strak" });
    expect(db.project!.status).toBe("klaar");
    expect(db.project!.gebruik).toMatchObject({ input: 2000, output: 200 });
  });

  test("betaalde stappen eerst bevestigen; gratis stappen meteen; resultaten in volgorde", async () => {
    antwoorden.push(
      zegt(
        tool("a", "lees_webpagina", { url: "https://x.nl" }),
        tool("b", "maak_beeld", { prompt: "a mug", formaat: "1:1", kwaliteit: "pro", voorbeelden: ["https://x.nl/f.jpg"] }),
        tool("c", "maak_beeld", { prompt: "a cup", formaat: "1:1", kwaliteit: "standaard" }),
      ),
    );
    await draai("p1");
    expect(db.project!.status).toBe("wacht_op_bevestiging");
    const w = db.project!.wachtend as { totaal: number; stappen: unknown[] };
    expect(w.stappen).toHaveLength(2);
    expect(w.totaal).toBe(3); // pro 2 + standaard 1
    expect(gestart).toHaveLength(0);

    antwoorden.push(zegt({ type: "text", text: "Gestart!" }));
    await bevestig(db.project as never, true);
    expect(gestart.map((g) => g.maker)).toEqual(["beeld", "beeld"]);
    expect(gestart[0].invoer.referentieUrls).toEqual(["https://x.nl/f.jpg"]);
    const res = (db.project!.berichten as { content: { tool_use_id: string }[] }[])[2].content;
    expect(res.map((r) => r.tool_use_id)).toEqual(["a", "b", "c"]);
    expect(db.project!.galerij).toEqual(["c1", "c2"]);
  });

  test("nee zeggen: niets gestart, Claude hoort dat het niet mocht", async () => {
    antwoorden.push(zegt(tool("b", "maak_beeld", { prompt: "x", formaat: "1:1", kwaliteit: "pro" })));
    await draai("p1");
    antwoorden.push(zegt({ type: "text", text: "Oké." }));
    await bevestig(db.project as never, false, "te duur");
    expect(gestart).toHaveLength(0);
    const res = (db.project!.berichten as { content: { content: string; is_error?: boolean }[] }[])[2].content[0];
    expect(res.is_error).toBe(true);
    expect(res.content).toContain("te duur");
  });

  test("automatisch: geen bevestiging; wachten tot klaar, dan krijgt Claude de beelden te zien", async () => {
    db.project!.automatisch = true;
    antwoorden.push(zegt(tool("b", "maak_beeld", { prompt: "x", formaat: "1:1", kwaliteit: "pro" })));
    antwoorden.push(zegt(tool("w", "wacht_op", { creatie_ids: ["c1"] })));
    await draai("p1");
    expect(db.project!.status).toBe("wacht_op_maken");

    db.creaties = [{ id: "c1", status: "bezig", soort: "beeld" }];
    expect(await controleerMaken(db.project as never)).toBe(false);

    db.creaties = [{ id: "c1", status: "klaar", soort: "beeld", url: "https://cdn/x.jpg" }];
    antwoorden.push(zegt({ type: "text", text: "Mooi!" }));
    expect(await controleerMaken(db.project as never)).toBe(true);
    const laatste = verzoeken.at(-1)!.messages as { content: { content: { type: string }[] }[] }[];
    const blokken = laatste.at(-1)!.content[0].content;
    expect(blokken.some((b) => b.type === "image")).toBe(true);
    expect(db.project!.status).toBe("klaar");
  });

  test("onbekende app of verwijzing: foutresultaat terug naar Claude, geen credits", async () => {
    antwoorden.push(zegt(tool("x", "gebruik_app", { app_id: "bestaat-niet" })));
    antwoorden.push(zegt({ type: "text", text: "Sorry." }));
    await draai("p1");
    const res = (db.project!.berichten as { content: { is_error?: boolean; content: string }[] }[])[2].content[0];
    expect(res.is_error).toBe(true);
    expect(res.content).toMatch(/Onbekende app/);
    expect(gestart).toHaveLength(0);
  });

  test("het verzoek aan Claude: juiste model, caching van de systeemtekst en de fallback", async () => {
    antwoorden.push(zegt({ type: "text", text: "Hoi" }));
    await draai("p1");
    expect(verzoeken[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect((verzoeken[0].system as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("bijlagen", () => {
  test("eigen foto en eigen pdf gaan mee; een vreemd pdf-adres en een onbekende foto niet", async () => {
    db.creaties = [{ id: "f1", url: "https://x.supabase.co/storage/v1/object/public/scene-assets/u1/creaties/a.jpg", prompt: "logo.jpg" }];
    const { inhoud, fotoIds } = await maakInhoud("u1", "Maak hier iets mee", [
      { soort: "beeld", id: "f1", naam: "logo.jpg" },
      { soort: "beeld", id: "bestaat-niet", naam: "x.jpg" },
      { soort: "document", url: "https://x.supabase.co/storage/v1/object/public/scene-assets/u1/creaties/b.pdf", naam: "briefing.pdf" },
      { soort: "document", url: "https://kwaadaardig.nl/c.pdf", naam: "c.pdf" },
      { soort: "document", url: "https://x.supabase.co/storage/v1/object/public/scene-assets/ANDER/creaties/d.pdf", naam: "d.pdf" },
    ]);
    const blokken = inhoud as { type: string; text?: string; title?: string }[];
    expect(fotoIds).toEqual(["f1"]);
    expect(blokken.filter((b) => b.type === "image")).toHaveLength(1);
    expect(blokken.filter((b) => b.type === "document").map((b) => b.title)).toEqual(["briefing.pdf"]);
    expect(blokken.at(-1)).toMatchObject({ type: "text", text: "Maak hier iets mee" });
  });
  test("zonder bijlagen blijft het gewoon tekst", async () => {
    expect((await maakInhoud("u1", "hoi")).inhoud).toBe("hoi");
  });
});

describe("geheugen", () => {
  test("onthoud gebeurt meteen (gratis) en gaat bij de volgende ronde mee naar Claude, met caching", async () => {
    antwoorden.push(zegt(tool("o", "onthoud", { feit: "Bakkerij De Zoete Zwaan, huisstijl goud en crème" })));
    antwoorden.push(zegt({ type: "text", text: "Genoteerd." }));
    await draai("p1");
    expect(db.geheugen).toBe("- Bakkerij De Zoete Zwaan, huisstijl goud en crème");
    expect(db.project!.status).toBe("klaar");
    const systeem = verzoeken[1].system as { text: string }[];
    expect(systeem[1].text).toContain("De Zoete Zwaan");
    expect(verzoeken[1].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("keuzemenu's", () => {
  test("creator: de app vult zelf alle creators met portret; het antwoord gaat met id naar Claude", async () => {
    antwoorden.push(zegt(tool("v", "vraag_keuze", { vraag: "Welke creator?", soort: "creator" })));
    await draai("p1");
    const opties = (db.project!.wachtend as { opties: { label: string; waarde: string; beeld?: string }[] }).opties;
    expect(opties.length).toBeGreaterThanOrEqual(10);
    expect(opties.every((o) => o.beeld)).toBe(true);
    const chantal = opties.find((o) => o.label === "Chantal")!;
    antwoorden.push(zegt({ type: "text", text: "Top." }));
    await beantwoord(db.project as never, chantal.label, [], chantal.waarde);
    const res = (db.project!.berichten as { content: { content: string }[] }[])[2].content[0];
    expect(res.content).toBe("Antwoord van de gebruiker: Chantal [waarde: Chantal (creator-id chantal, vaste stem Mia)]");
  });
  test("stem: alle stemmen met een luistervoorbeeld", async () => {
    antwoorden.push(zegt(tool("v", "vraag_keuze", { vraag: "Welke stem?", soort: "stem" })));
    await draai("p1");
    const opties = (db.project!.wachtend as { opties: { geluid?: string }[] }).opties;
    expect(opties.every((o) => o.geluid?.startsWith("/voice-previews/"))).toBe(true);
  });
});

describe("stemmen", () => {
  test("zoek_stemmen geeft de bibliotheek, gefilterd", async () => {
    const { gratis } = await import("./tools");
    const lijst = JSON.parse(await gratis("u1", { name: "zoek_stemmen", input: { geslacht: "vrouw", accent: "Vlaams" } } as never)) as { geslacht: string; accent: string }[];
    expect(lijst.length).toBeGreaterThan(0);
    expect(lijst.every((s) => s.geslacht === "vrouw" && s.accent === "Vlaams")).toBe(true);
  });

  test("het stemmenmenu toont Claudes aanraders met reden en Nederlands voorbeeld", async () => {
    const { bouwOpties } = await import("./tools");
    const { BIBLIOTHEEK } = await import("@/lib/stem/bibliotheek");
    const [a, b] = BIBLIOTHEEK;
    const opties = await bouwOpties("u1", { soort: "stem", stemmen: [{ id: a.id, waarom: "Warm en rustig" }, { id: "bestaat-niet", waarom: "x" }, { id: b.id, waarom: "Speels" }] });
    expect(opties.map((o) => o.label)).toEqual([a.naam, b.naam]);
    expect(opties[0].waarde).toContain(a.id);
    expect(opties[0].uitleg).toMatch(/^Warm en rustig/);
    expect(opties[0].geluid).toBe(a.voorbeeld);
  });

  test("maak_voiceover: bibliotheekstem wordt een betaalde voice-over-stap, onbekende stem niet", async () => {
    const { bereidVoor } = await import("./tools");
    const { BIBLIOTHEEK } = await import("@/lib/stem/bibliotheek");
    const s = BIBLIOTHEEK[0];
    const stap = await bereidVoor("u1", { id: "t1", name: "maak_voiceover", input: { tekst: "Er was eens een uiltje.", stem: s.id, snelheid: 0.9 } } as never);
    expect(stap.maker).toBe("voice-over");
    expect(stap.invoer).toMatchObject({ stemId: s.id, stemNaam: s.naam, snelheid: 0.9 });
    expect(stap.credits).toBeGreaterThan(0);
    await expect(bereidVoor("u1", { id: "t2", name: "maak_voiceover", input: { tekst: "x", stem: "verzonnen" } } as never)).rejects.toThrow(/zoek_stemmen/);
  });

  test("monteer accepteert een bibliotheekstem op id of naam", async () => {
    const { leesMontage } = await vi.importActual<typeof import("./montage")>("./montage");
    const { BIBLIOTHEEK } = await import("@/lib/stem/bibliotheek");
    const s = BIBLIOTHEEK.find((x) => x.naam === "Melanie")!;
    expect(leesMontage({ clipIds: ["c1"], stem: s.id }).stem).toBe(s.id);
    expect(leesMontage({ clipIds: ["c1"], stem: "Melanie" }).stem).toBe(s.id);
  });
});
