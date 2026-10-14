import { describe, expect, it, vi } from "vitest";

// lib/achterstand.ts haalt bij het laden de service-client erbij; die is voor
// deze pure functies niet nodig.
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { bouwMail, rekeningKort, toonVoorReden, type Dossier } from "@/lib/achterstand-mail";
import { isTeruggeboekt, volgendeMail } from "@/lib/achterstand";

const DAG = 24 * 60 * 60 * 1000;

function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    naam: null,
    email: "klant@example.com",
    toon: "bewust",
    redenCode: "MD06",
    aanmelding: {
      datum: "2026-07-14T15:21:25Z",
      omschrijving: "JouwAnimatieVideo A.I., Webinar aanbod (eerste maand €1, daarna €49/m)",
      bedrag: 1,
      methode: "ideal",
      rekeninghouder: "G van Blitterswijk",
      rekening: "NL10INGB0005358896",
      akkoord: { op: "2026-07-14T15:21:03Z", abonnement: true, voorwaarden: true },
      webinar: true,
    },
    betalingen: [
      { datum: "2026-07-14T15:21:25Z", bedrag: 1, status: "betaald" },
      { datum: "2026-09-15T03:00:42Z", bedrag: 49, status: "teruggeboekt" },
    ],
    gebruik: {
      laatstIngelogd: "2026-07-14T19:13:14Z",
      aantalProjecten: 3,
      afgerond: 2,
      voorbeelden: [{ titel: "Balans vinden 1", datum: "2026-07-14T15:25:56Z" }],
      keerGebruikt: 0,
      creditsGebruikt: 0,
      laatstGebruikt: null,
      keerInTeruggeboektePeriode: 0,
    },
    open: [
      { incassoDatum: "2026-09-15T03:00:42Z", bedrag: 49 },
      { incassoDatum: "2026-10-13T23:44:44Z", bedrag: 49 },
    ],
    eerderGemaild: [],
    betaalUrl: "https://ai.jouwanimatievideo.nl/betalen/abc",
    ...over,
  };
}

describe("toon", () => {
  it("is stevig als de klant zelf liet terugboeken, vriendelijk bij te weinig saldo", () => {
    expect(toonVoorReden("MD06")).toBe("bewust");
    expect(toonVoorReden("ms02")).toBe("bewust");
    expect(toonVoorReden("AM04")).toBe("mislukt");
    expect(toonVoorReden(null)).toBe("mislukt");
  });
});

describe("bouwMail", () => {
  it("bewust: totaal, betaallink, het vinkje en het gebruik staan erin", () => {
    const m = bouwMail(dossier(), "eerste");
    expect(m.onderwerp).toBe("Teruggeboekte incasso: openstaand bedrag € 98,00");
    expect(m.text).toContain("https://ai.jouwanimatievideo.nl/betalen/abc");
    expect(m.text).toContain("Ik begrijp dat dit een doorlopend maandelijks abonnement is");
    expect(m.text).toContain("14 juli 2026 om 17:21 uur");
    expect(m.text).toContain("3 projecten aangemaakt, waarvan 2 als video afgerond");
    expect(m.text).toContain("eindigend op 8896");
    expect(m.text).not.toContain("NL10INGB0005358896");
    expect(m.html).toContain('href="https://ai.jouwanimatievideo.nl/betalen/abc"');
  });

  it("mislukt: geen bewijslast, wel de reden in gewone taal", () => {
    const m = bouwMail(dossier({ toon: "mislukt", redenCode: "AM04", open: [{ incassoDatum: "2026-10-13T23:44:44Z", bedrag: 49 }] }), "eerste");
    expect(m.onderwerp).toBe("Incasso niet gelukt: openstaand bedrag € 49,00");
    expect(m.text).toContain("onvoldoende saldo");
    expect(m.text).not.toContain("ZO IS UW ABONNEMENT TOT STAND GEKOMEN");
  });

  it("herinneringen noemen de eerdere mails", () => {
    const m = bouwMail(dossier({ eerderGemaild: ["2026-10-15T07:00:00Z", "2026-10-22T07:00:00Z"] }), "laatste");
    expect(m.onderwerp).toMatch(/^Laatste herinnering/);
    expect(m.text).toContain("15 oktober 2026 en 22 oktober 2026");
    expect(m.text).toContain("verdere stappen");
  });

  it("zet geen klantinvoer ongefilterd in de HTML", () => {
    const m = bouwMail(dossier({ naam: "<script>x</script>" }), "eerste");
    expect(m.html).not.toContain("<script>");
  });
});

describe("volgendeMail", () => {
  const nu = Date.parse("2026-11-01T08:00:00Z");
  const geleden = (d: number) => new Date(nu - d * DAG).toISOString();

  it("volgt de reeks direct → 7 dagen → 14 dagen en stopt dan", () => {
    expect(volgendeMail({ email: "a@b.nl", mail_1_op: null, mail_2_op: null, mail_3_op: null }, nu)).toBe("eerste");
    expect(volgendeMail({ email: "a@b.nl", mail_1_op: geleden(6), mail_2_op: null, mail_3_op: null }, nu)).toBeNull();
    expect(volgendeMail({ email: "a@b.nl", mail_1_op: geleden(7), mail_2_op: null, mail_3_op: null }, nu)).toBe("herinnering");
    expect(volgendeMail({ email: "a@b.nl", mail_1_op: geleden(14), mail_2_op: geleden(7), mail_3_op: null }, nu)).toBe("laatste");
    expect(volgendeMail({ email: "a@b.nl", mail_1_op: geleden(21), mail_2_op: geleden(14), mail_3_op: geleden(7) }, nu)).toBeNull();
  });

  it("zonder e-mailadres valt er niets te sturen", () => {
    expect(volgendeMail({ email: null, mail_1_op: null, mail_2_op: null, mail_3_op: null }, nu)).toBeNull();
  });
});

describe("isTeruggeboekt", () => {
  it("leest Mollies veldnaam met hoofdletter B", () => {
    expect(isTeruggeboekt({ amountChargedBack: { value: "49.00" } })).toBe(true);
    expect(isTeruggeboekt({ amountChargedBack: null })).toBe(false);
    expect(rekeningKort("NL10 INGB 0005 3588 96")).toBe("eindigend op 8896");
  });
});
