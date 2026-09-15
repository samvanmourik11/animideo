import { describe, it, expect } from "vitest";
import { canUseDialoog, DIALOOG_OPEN_TO_ALL } from "./access";

// De dialoogtool gaat eerst live voor alleen Sam. Wat hier vastligt: zolang de
// schakelaar dicht staat, komt niemand anders erin.
describe("canUseDialoog", () => {
  it("staat nog niet voor iedereen open", () => {
    expect(DIALOOG_OPEN_TO_ALL).toBe(false);
  });

  it("laat Sam erin, ook met hoofdletters in het adres", () => {
    expect(canUseDialoog("sam@jouwanimatievideo.nl")).toBe(true);
    expect(canUseDialoog("Sam@JouwAnimatieVideo.nl")).toBe(true);
  });

  it("houdt andere accounts en een onbekende gebruiker buiten", () => {
    expect(canUseDialoog("klant@example.com")).toBe(false);
    expect(canUseDialoog("")).toBe(false);
    expect(canUseDialoog(null)).toBe(false);
    expect(canUseDialoog(undefined)).toBe(false);
  });
});
