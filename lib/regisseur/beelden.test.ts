import { describe, expect, it } from "vitest";
import { beperkBeelden } from "./beelden";

const beeld = (n: number) => ({ type: "image", source: { type: "url", url: `https://x/${n}.jpg` } });

describe("beperkBeelden", () => {
  it("houdt alleen de nieuwste beelden, ook binnen tool-resultaten", () => {
    const berichten = [
      { role: "user", content: [beeld(1), beeld(2)] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [{ type: "text", text: "klaar" }, beeld(3)] }] },
      { role: "user", content: [beeld(4)] },
    ];
    const uit = beperkBeelden(berichten, 2);
    const s = JSON.stringify(uit);
    expect(s).toContain("Eerder getoond beeld: https://x/1.jpg");
    expect(s).toContain("Eerder getoond beeld: https://x/2.jpg");
    expect((s.match(/"type":"image"/g) ?? []).length).toBe(2);
    expect(JSON.stringify(berichten)).not.toContain("Eerder getoond"); // origineel ongemoeid
  });
  it("laat gesprekken met weinig beelden en tekstberichten met rust", () => {
    const berichten = [{ role: "user", content: "hoi" }, { role: "user", content: [beeld(1)] }];
    expect(beperkBeelden(berichten)).toEqual(berichten);
  });
});
