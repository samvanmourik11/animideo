import { describe, it, expect, vi } from "vitest";
import { isVerbindingsHapering, maakFetchMetHerkansing } from "./netwerk-herkansing";

// "Unauthorized" terwijl Sam ingelogd was: de inlogcontrole kreeg door een haperende
// HTTP/2-verbinding geen antwoord. Lezen mag opnieuw, schrijven nooit.

const hapering = () => Object.assign(new TypeError("fetch failed"), {
  cause: Object.assign(new Error("Stream closed with error code NGHTTP2_ENHANCE_YOUR_CALM"), { code: "ERR_HTTP2_STREAM_ERROR" }),
});
const geenWachten = async () => {};

describe("isVerbindingsHapering", () => {
  it("herkent een afgebroken HTTP/2-stroom", () => {
    expect(isVerbindingsHapering(hapering())).toBe(true);
  });

  it("ziet een afgebroken verzoek of een gewone fout niet als hapering", () => {
    expect(isVerbindingsHapering(Object.assign(new Error("gestopt"), { name: "AbortError" }))).toBe(false);
    expect(isVerbindingsHapering(new Error("boem"))).toBe(false);
    expect(isVerbindingsHapering("fetch failed")).toBe(false);
  });
});

describe("maakFetchMetHerkansing", () => {
  it("probeert een lezend verzoek opnieuw na een hapering en geeft dan het antwoord", async () => {
    const basis = vi.fn().mockRejectedValueOnce(hapering()).mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const f = maakFetchMetHerkansing(basis, [1, 1], geenWachten);
    const r = await f("https://x/auth/v1/user");
    expect(r.status).toBe(200);
    expect(basis).toHaveBeenCalledTimes(2);
  });

  it("probeert een schrijvend verzoek nooit opnieuw", async () => {
    const basis = vi.fn().mockRejectedValue(hapering());
    const f = maakFetchMetHerkansing(basis, [1, 1], geenWachten);
    await expect(f("https://x/rest/v1/rpc/deduct", { method: "POST" })).rejects.toThrow("fetch failed");
    expect(basis).toHaveBeenCalledTimes(1);
  });

  it("geeft het op na de herkansingen en gooit dan de fout", async () => {
    const basis = vi.fn().mockRejectedValue(hapering());
    const f = maakFetchMetHerkansing(basis, [1, 1], geenWachten);
    await expect(f("https://x/auth/v1/user")).rejects.toThrow("fetch failed");
    expect(basis).toHaveBeenCalledTimes(3);
  });

  it("probeert een echt antwoord van de server niet opnieuw, ook geen 401", async () => {
    const basis = vi.fn().mockResolvedValue(new Response("nee", { status: 401 }));
    const f = maakFetchMetHerkansing(basis, [1, 1], geenWachten);
    expect((await f("https://x/auth/v1/user")).status).toBe(401);
    expect(basis).toHaveBeenCalledTimes(1);
  });
});
