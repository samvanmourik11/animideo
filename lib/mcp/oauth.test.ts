import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
import { geldigTerugadres, metadataResource, metadataServer, s256 } from "./oauth";

describe("inloggen vanuit de Claude-app (OAuth)", () => {
  it("PKCE S256 volgens RFC 7636 (voorbeeld uit de RFC)", () => {
    expect(s256("dBjftJeZ4CVP-mJ92iUQaxRoJt3GhbZwi8dcUJ6OKQs")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("accepteert alleen https of de eigen computer als terugkeeradres", () => {
    expect(geldigTerugadres("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(geldigTerugadres("http://localhost:6274/callback")).toBe(true);
    expect(geldigTerugadres("http://evil.nl/callback")).toBe(false);
    expect(geldigTerugadres("javascript:alert(1)")).toBe(false);
    expect(geldigTerugadres("https://claude.ai/cb#x")).toBe(false);
  });

  it("de ontdekdocumenten wijzen naar elkaar en naar /api/mcp", () => {
    const s = metadataServer("https://ai.jouwanimatievideo.nl");
    expect(s.authorization_endpoint).toBe("https://ai.jouwanimatievideo.nl/oauth/authorize");
    expect(s.code_challenge_methods_supported).toEqual(["S256"]);
    const r = metadataResource("https://ai.jouwanimatievideo.nl");
    expect(r.resource).toBe("https://ai.jouwanimatievideo.nl/api/mcp");
    expect(r.authorization_servers).toEqual([s.issuer]);
  });
});
