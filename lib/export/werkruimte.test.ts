import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSchijfVol, pastNog, ruimAfgebrokenExportsOp } from "./werkruimte";

describe("werkruimte van de export", () => {
  it("ruimt alleen werkmappen van afgebroken exports op, niet die van lopende", async () => {
    const map = await mkdtemp(join(tmpdir(), "werkruimte-test-"));
    await mkdir(join(map, "export-oud"));
    await mkdir(join(map, "export-lopend"));
    await mkdir(join(map, "iets-anders"));
    const lang = new Date(Date.now() - 10 * 60_000);
    await utimes(join(map, "export-oud"), lang, lang);
    await utimes(join(map, "iets-anders"), lang, lang);

    expect(await ruimAfgebrokenExportsOp(Date.now(), map)).toBe(1);
    expect((await readdir(map)).sort()).toEqual(["export-lopend", "iets-anders"]);
  });

  it("rekent wat de export al op de schijf heeft mee als al gebruikt", () => {
    // Film van 2:59 met ~160 MB piek: past op een lege schijf ...
    expect(pastNog({ nodigMB: 160, alGebruiktMB: 10, vrijMB: 470 })).toBe(true);
    // ... maar niet als er nog 300 MB van een afgebroken export staat.
    expect(pastNog({ nodigMB: 160, alGebruiktMB: 10, vrijMB: 170 })).toBe(false);
    // Bijna klaar: alleen het restant moet nog passen.
    expect(pastNog({ nodigMB: 160, alGebruiktMB: 70, vrijMB: 140 })).toBe(true);
  });

  it("herkent een volle schijf aan de foutcode en aan de ffmpeg-tekst", () => {
    expect(isSchijfVol(Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" }))).toBe(true);
    expect(isSchijfVol(new Error("ffmpeg exited 1: ... No space left on device"))).toBe(true);
    expect(isSchijfVol(new Error("Upload mislukt"))).toBe(false);
  });
});
