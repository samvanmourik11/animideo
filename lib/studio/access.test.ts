import { describe, it, expect } from "vitest";
import { canUseDialoog, DIALOOG_OPEN_TO_ALL } from "./access";

// De dialoogtool ging eerst live voor alleen Sam. Na zijn test op productie
// (15-09-2026) staat hij voor iedereen open; wat hier vastligt is dat elk account erin kan.
describe("canUseDialoog", () => {
  it("staat voor iedereen open", () => {
    expect(DIALOOG_OPEN_TO_ALL).toBe(true);
  });

  it("laat elk account erin, niet alleen Sam", () => {
    expect(canUseDialoog("sam@jouwanimatievideo.nl")).toBe(true);
    expect(canUseDialoog("klant@example.com")).toBe(true);
  });
});
