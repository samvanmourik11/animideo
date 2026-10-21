import { beforeEach, describe, expect, test, vi } from "vitest";

// Een nep-database (één regieproject + creaties) en een nep-Claude met vooraf
// klaargezette antwoorden. Zo testen we de lus: pauzeren, bevestigen, volgorde.
const db = { project: null as Record<string, unknown> | null, creaties: [] as Record<string, unknown>[] };
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
        eq: (k: string, v: unknown) => (filters.push([k, v]), keten),
        in: (k: string, v: unknown[]) => (filters.push([k + ":in", v]), keten),
        single: async () => resultaat(),
        maybeSingle: async () => resultaat(),
        then: (ok: (r: unknown) => void) => ok(resultaat()),
      };
      function resultaat() {
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
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic {
    static APIError = APIError;
    beta = { messages: { stream: (v: Record<string, unknown>) => (verzoeken.push(structuredClone(v)), { finalMessage: async () => antwoorden.shift() }) } };
  }
  return { default: Anthropic };
});

process.env.ANTHROPIC_API_KEY = "test";
const { draai, beantwoord, bevestig, controleerMaken } = await import("./agent");

const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const tool = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });
const zegt = (...content: unknown[]) => ({ stop_reason: content.some((c) => (c as { type: string }).type === "tool_use") ? "tool_use" : "end_turn", content, usage });

beforeEach(() => {
  db.project = { id: "p1", user_id: "u1", titel: "t", berichten: [{ role: "user", content: "Maak een reclame" }], status: "denkt", wachtend: null, galerij: [], automatisch: false, gebruik: {} };
  db.creaties = [];
  antwoorden.length = 0;
  verzoeken.length = 0;
  gestart.length = 0;
});

describe("de Regisseur", () => {
  test("een vraag pauzeert; het antwoord gaat terug als tool-resultaat en hij gaat verder", async () => {
    antwoorden.push(zegt({ type: "text", text: "Even checken." }, tool("v1", "vraag_keuze", { vraag: "Welke stijl?", opties: ["Strak", "Vrolijk"] })));
    await draai("p1");
    expect(db.project!.status).toBe("wacht_op_antwoord");
    expect((db.project!.wachtend as { opties: string[] }).opties).toEqual(["Strak", "Vrolijk"]);

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
