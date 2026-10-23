import { describe, expect, it, vi } from "vitest";

const gestart = vi.fn(async () => "c1");
vi.mock("@/lib/regisseur/tools", () => ({
  TOOLS: [
    { name: "vraag_keuze", description: "x", input_schema: { type: "object", properties: {} } },
    { name: "wacht_op", description: "x", input_schema: { type: "object", properties: {} } },
    { name: "maak_beeld", description: "Maak een beeld.", input_schema: { type: "object", properties: { prompt: { type: "string" } } } },
    { name: "zoek_stemmen", description: "Stemmen.", input_schema: { type: "object", properties: {} } },
  ],
  BETAALDE_TOOLS: new Set(["maak_beeld"]),
  GRATIS_TOOLS: new Set(["zoek_stemmen"]),
  bereidVoor: async () => ({ credits: 2, omschrijving: "Beeld: een taart", maker: "beeld", invoer: {} }),
  voerUit: (...a: unknown[]) => gestart(...(a as [])),
  gratis: async () => "[stemmen]",
}));
vi.mock("@/lib/film/tools", () => ({ FILM_BETAALD: new Set(), FILM_GRATIS: new Set() }));
vi.mock("@/lib/regisseur/regieboek", () => ({ regieboekTekst: async () => "Regieboek: …" }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/creaties/wachtrij", () => ({ verversLopende: vi.fn() }));
vi.mock("@/lib/credits", () => ({ getCredits: async () => 42 }));
vi.mock("@/lib/team/team", () => ({ betalerVan: async (id: string) => id }));
vi.mock("sharp", () => ({ default: vi.fn() }));
import { verwerk } from "./server";
import { hash, nieuweSleutel } from "./sleutels";

const vraag = (method: string, params: Record<string, unknown> = {}) => verwerk("u1", { jsonrpc: "2.0", id: 1, method, params });

describe("MCP-server", () => {
  it("begroet met een protocolversie, en het regieboek als handleiding", async () => {
    const r = (await vraag("initialize", { protocolVersion: "2025-03-26" }))!.result as { protocolVersion: string; instructions: string };
    expect(r.protocolVersion).toBe("2025-03-26");
    expect(r.instructions).toContain("Regieboek");
    expect(((await vraag("initialize", { protocolVersion: "1999" }))!.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
  });

  it("biedt de gereedschappen aan, zonder de chatknoppen; betaalde met akkoord_credits", async () => {
    const tools = ((await vraag("tools/list"))!.result as { tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(["maak_beeld", "zoek_stemmen", "status", "saldo"]);
    expect(tools[0].inputSchema.properties.akkoord_credits).toBeTruthy();
    expect(tools[1].inputSchema.properties.akkoord_credits).toBeUndefined();
  });

  it("een betaalde stap noemt eerst de prijs; pas met akkoord start hij", async () => {
    const eerst = (await vraag("tools/call", { name: "maak_beeld", arguments: { prompt: "taart" } }))!.result as { content: { text: string }[] };
    expect(eerst.content[0].text).toContain("Dit kost 2 credits");
    expect(gestart).not.toHaveBeenCalled();
    const teWeinig = (await vraag("tools/call", { name: "maak_beeld", arguments: { prompt: "taart", akkoord_credits: 1 } }))!.result as { content: { text: string }[] };
    expect(teWeinig.content[0].text).toContain("Dit kost 2 credits");
    const dan = (await vraag("tools/call", { name: "maak_beeld", arguments: { prompt: "taart", akkoord_credits: 2 } }))!.result as { content: { text: string }[] };
    expect(dan.content[0].text).toContain("Gestart: creatie c1");
  });

  it("weigert de chatknoppen en onbekende methodes; meldingen krijgen geen antwoord", async () => {
    expect(((await vraag("tools/call", { name: "vraag_keuze", arguments: {} }))!.result as { isError?: boolean }).isError).toBe(true);
    expect((await vraag("onzin"))!.error).toMatchObject({ code: -32601 });
    expect(await verwerk("u1", { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(((await vraag("tools/call", { name: "saldo", arguments: {} }))!.result as { content: { text: string }[] }).content[0].text).toBe("Saldo: 42 credits.");
  });

  it("sleutels: herkenbaar voorvoegsel, nooit twee dezelfde, hash is vast", () => {
    const a = nieuweSleutel();
    expect(a).toMatch(/^anm_[A-Za-z0-9_-]{40}$/);
    expect(nieuweSleutel()).not.toBe(a);
    expect(hash(a)).toBe(hash(a));
    expect(hash(a)).not.toContain(a.slice(4, 12));
  });
});
