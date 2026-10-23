import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
import { feedbackUit } from "./leren";

describe("leerronde: feedback van klanten verzamelen", () => {
  it("neemt echte reacties mee, en laat techniek, knopjes en bijlagen weg", () => {
    const berichten = [
      { role: "user", content: "Maak een reclame voor mijn bakkerij met een taart" },
      { role: "assistant", content: [{ type: "text", text: "Prima!" }] },
      {
        role: "user",
        content: [
          { type: "tool_result", content: "Antwoord van de gebruiker: Storyboard: ik wil iets aanpassen [waarde: x]" },
          { type: "tool_result", content: "Gestart: creatie 123. Gebruik wacht_op." },
          { type: "tool_result", content: "Antwoord van de gebruiker: Ja" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "(Bijlage: foto \"logo.png\", creatie-id 1.)" }, { type: "text", text: "De handen van de bakker zien er raar uit" }] },
      { role: "user", content: "Vaste taak \"Posts\" (elke maandag om 08:00, taak-id 1), uitvoering…" },
    ];
    expect(feedbackUit(berichten)).toEqual([
      "Maak een reclame voor mijn bakkerij met een taart",
      "Storyboard: ik wil iets aanpassen",
      "De handen van de bakker zien er raar uit",
    ]);
  });
});
