import { describe, expect, it, vi } from "vitest";
import { metHerkansing } from "./retry-single";

describe("metHerkansing", () => {
  it("herkanst één keer bij PGRST116 en geeft het tweede resultaat terug", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } })
      .mockResolvedValueOnce({ data: { id: "abc" }, error: null });
    const result = await metHerkansing(query);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ id: "abc" });
    expect(result.error).toBeNull();
  });

  it("herkanst niet bij een andere foutcode", async () => {
    const fout = { code: "42501", message: "permission denied" };
    const query = vi.fn().mockResolvedValueOnce({ data: null, error: fout });
    const result = await metHerkansing(query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual(fout);
  });

  it("laat een succesvolle eerste poging ongemoeid", async () => {
    const query = vi.fn().mockResolvedValueOnce({ data: { id: "abc" }, error: null });
    const result = await metHerkansing(query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ id: "abc" });
  });

  it("geeft de tweede fout terug als de herkansing ook mislukt", async () => {
    const fout = { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" };
    const query = vi.fn().mockResolvedValue({ data: null, error: fout });
    const result = await metHerkansing(query);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.error).toEqual(fout);
  });
});
