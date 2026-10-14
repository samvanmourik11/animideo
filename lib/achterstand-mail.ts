// Mails voor teruggeboekte incasso's. Puur: geen database, geen Mollie — alles
// wat de mail nodig heeft komt binnen als `Dossier`, zodat de tekst los te
// testen is en precies te zien is wat een klant krijgt.
//
// Twee tonen (Sam, 14-10-2026):
//  - "bewust": de klant heeft zelf laten terugboeken (MD06, MS02, MD01). Stevig,
//    met het hele bewijs: hoe het abonnement tot stand kwam en wanneer de dienst
//    is gebruikt. Aanleiding was een klant die schreef nooit akkoord te hebben
//    gegeven en de software nooit te hebben gebruikt, terwijl ze het vinkje voor
//    het doorlopende abonnement had gezet en twee video's had gemaakt.
//  - "mislukt": de incasso ging mis zonder dat de klant erom vroeg (onvoldoende
//    saldo, geblokkeerde rekening). Zakelijk maar vriendelijk, zonder bewijslast.

import { SELLER } from "@/lib/receipt";

export type Toon = "bewust" | "mislukt";
export type MailSoort = "eerste" | "herinnering" | "laatste";

/** Bankredenen waarbij de klant zelf om de terugboeking heeft gevraagd. */
const BEWUSTE_REDENEN = new Set(["MD06", "MS02", "MD01"]);

const REDEN_NL: Record<string, string> = {
  AM04: "onvoldoende saldo",
  AC04: "de rekening is opgeheven",
  AC06: "de rekening is geblokkeerd",
  AG01: "incasso is niet toegestaan op deze rekening",
  MS03: "de bank heeft de incasso geweigerd",
};

export function toonVoorReden(code: string | null | undefined): Toon {
  return code && BEWUSTE_REDENEN.has(code.toUpperCase()) ? "bewust" : "mislukt";
}

export function redenInGewoneTaal(code: string | null | undefined): string {
  return (code && REDEN_NL[code.toUpperCase()]) || "de incasso is niet gelukt";
}

/** De tekst van het verplichte vinkje op de webinar-checkout (sinds 24-06-2026). */
export const WEBINAR_VINKJE =
  "Ik begrijp dat dit een doorlopend maandelijks abonnement is: ik betaal nu €1 voor de eerste maand " +
  "en daarna automatisch €49 per maand, totdat ik opzeg. Ik kan op elk moment maandelijks opzeggen.";

export interface Dossier {
  naam: string | null;
  email: string;
  toon: Toon;
  redenCode: string | null;
  /** De eerste betaling, waarmee het abonnement en de machtiging ontstonden. */
  aanmelding: {
    datum: string;
    omschrijving: string;
    bedrag: number;
    methode: string | null;
    rekeninghouder: string | null;
    rekening: string | null;
    /** Uit de checkout-metadata; alleen aanwezig als de checkout het vastlegde. */
    akkoord: { op: string; abonnement: boolean; voorwaarden: boolean } | null;
    webinar: boolean;
  } | null;
  betalingen: { datum: string; bedrag: number; status: "betaald" | "teruggeboekt" | "mislukt" | "open" }[];
  gebruik: {
    laatstIngelogd: string | null;
    aantalProjecten: number;
    afgerond: number;
    /** Een paar voorbeelden, afgeronde eerst. */
    voorbeelden: { titel: string; datum: string }[];
    keerGebruikt: number;
    creditsGebruikt: number;
    laatstGebruikt: string | null;
    /** Gebruik binnen de maanden waarvan de incasso is teruggeboekt. */
    keerInTeruggeboektePeriode: number;
  };
  /** De teruggeboekte incasso's die nu openstaan. */
  open: { incassoDatum: string; bedrag: number }[];
  /** Data waarop eerdere mails over deze posten zijn verstuurd. */
  eerderGemaild: string[];
  betaalUrl: string;
}

// ── Opmaak ────────────────────────────────────────────────────────────────

const TZ = "Europe/Amsterdam";

export function datum(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
}

export function datumTijd(iso: string): string {
  const tijd = new Date(iso).toLocaleTimeString("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return `${datum(iso)} om ${tijd} uur`;
}

export function euro(bedrag: number): string {
  return "€ " + bedrag.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Alleen de laatste vier cijfers: genoeg om de rekening te herkennen. */
export function rekeningKort(iban: string | null): string | null {
  if (!iban) return null;
  const schoon = iban.replace(/\s+/g, "");
  return schoon.length >= 4 ? `eindigend op ${schoon.slice(-4)}` : null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function lijstVanDatums(datums: string[]): string {
  const d = datums.map(datum);
  return d.length <= 1 ? (d[0] ?? "") : `${d.slice(0, -1).join(", ")} en ${d[d.length - 1]}`;
}

// ── Inhoud ────────────────────────────────────────────────────────────────

/** Eén blok van de mail: kop + alinea's of opsommingstekens. */
interface Blok {
  kop?: string;
  alineas?: string[];
  punten?: string[];
}

export function totaal(d: Dossier): number {
  return Math.round(d.open.reduce((s, p) => s + p.bedrag, 0) * 100) / 100;
}

export function onderwerp(d: Dossier, soort: MailSoort): string {
  const bedrag = euro(totaal(d));
  if (soort === "herinnering") return `Herinnering: openstaand bedrag ${bedrag}`;
  if (soort === "laatste") return `Laatste herinnering: openstaand bedrag ${bedrag}`;
  return d.toon === "bewust"
    ? `Teruggeboekte incasso: openstaand bedrag ${bedrag}`
    : `Incasso niet gelukt: openstaand bedrag ${bedrag}`;
}

function inleiding(d: Dossier, soort: MailSoort): string[] {
  const bedrag = euro(totaal(d));
  const datums = lijstVanDatums(d.open.map((p) => p.incassoDatum));
  const meer = d.open.length > 1;

  if (soort === "herinnering") {
    return [
      `Op ${lijstVanDatums(d.eerderGemaild)} hebben we u gemaild over een openstaand bedrag van ${bedrag}. ` +
        `We hebben uw betaling nog niet ontvangen.`,
    ];
  }
  if (soort === "laatste") {
    return [
      `Dit is onze laatste herinnering. Ondanks onze e-mails van ${lijstVanDatums(d.eerderGemaild)} ` +
        `staat het bedrag van ${bedrag} nog altijd open.`,
    ];
  }
  if (d.toon === "bewust") {
    return [
      `U heeft ${meer ? `de incasso's van ${datums}` : `de incasso van ${datums}`} voor uw abonnement op ` +
        `JouwAnimatieVideo A.I. via uw bank laten terugboeken.`,
      `Uw abonnement liep in die periode gewoon door en de dienst stond voor u klaar. ` +
        `${meer ? "Deze bedragen zijn" : "Dit bedrag is"} daarmee niet betaald en ${meer ? "staan" : "staat"} nog open.`,
    ];
  }
  return [
    `${meer ? `De incasso's van ${datums}` : `De incasso van ${datums}`} voor uw abonnement op ` +
      `JouwAnimatieVideo A.I. ${meer ? "zijn" : "is"} niet gelukt (${redenInGewoneTaal(d.redenCode)}).`,
    `Dat kan gebeuren. U kunt het openstaande bedrag eenvoudig zelf betalen via de knop hieronder.`,
  ];
}

function betaalVerzoek(d: Dossier, soort: MailSoort): string {
  const bedrag = euro(totaal(d));
  if (soort === "laatste") {
    return `Betaal het openstaande bedrag van ${bedrag} binnen 14 dagen na deze e-mail. ` +
      `Blijft betaling uit, dan nemen wij verdere stappen om het bedrag te innen.`;
  }
  return `Wij verzoeken u het openstaande bedrag van ${bedrag} binnen 14 dagen te betalen.`;
}

function blokAanmelding(d: Dossier): Blok | null {
  const a = d.aanmelding;
  if (!a) return null;
  const punten: string[] = [];
  punten.push(`Op ${datumTijd(a.datum)} is met uw e-mailadres (${d.email}) een abonnement afgesloten: "${a.omschrijving}".`);
  const rekening = rekeningKort(a.rekening);
  const vanaf = a.rekeninghouder
    ? ` vanaf de rekening op naam van ${a.rekeninghouder}${rekening ? ` (${rekening})` : ""}`
    : "";
  punten.push(
    `De eerste betaling van ${euro(a.bedrag)} is voldaan${a.methode === "ideal" ? " via iDEAL" : ""}${vanaf}. ` +
      `Daarmee is ook de machtiging afgegeven voor de maandelijkse incasso.`
  );
  if (a.akkoord?.abonnement) {
    punten.push(
      `Afrekenen kan alleen na het zetten van een vinkje. Dat vinkje is gezet op ${datumTijd(a.akkoord.op)}` +
        `${a.webinar ? `, bij deze tekst: "${WEBINAR_VINKJE}"` : ", als akkoord met een doorlopend maandelijks abonnement."}`
    );
  }
  if (a.akkoord?.voorwaarden) {
    punten.push(
      `Ook is akkoord gegeven op onze algemene voorwaarden. Daarin staat dat het abonnement maandelijks ` +
        `automatisch wordt verlengd tot u opzegt.`
    );
  }
  return { kop: "Zo is uw abonnement tot stand gekomen", punten };
}

function blokGebruik(d: Dossier): Blok {
  const g = d.gebruik;
  const punten: string[] = [];
  if (g.aantalProjecten > 0) {
    const vb = g.voorbeelden.map((v) => `"${v.titel}" (${datum(v.datum)})`).join(", ");
    punten.push(
      `U heeft ${g.aantalProjecten} ${g.aantalProjecten === 1 ? "project" : "projecten"} aangemaakt` +
        `${g.afgerond > 0 ? `, waarvan ${g.afgerond} als video afgerond` : ""}` +
        `${vb ? `, waaronder ${vb}` : ""}.`
    );
  }
  if (g.keerGebruikt > 0) {
    punten.push(
      `De AI-functies zijn ${g.keerGebruikt} keer gebruikt (${g.creditsGebruikt} credits)` +
        `${g.laatstGebruikt ? `, voor het laatst op ${datum(g.laatstGebruikt)}` : ""}.`
    );
  }
  if (g.keerInTeruggeboektePeriode > 0) {
    punten.push(
      `In de periode waarvan u de incasso heeft laten terugboeken, is de dienst ${g.keerInTeruggeboektePeriode} keer gebruikt.`
    );
  }
  if (g.laatstIngelogd) punten.push(`Laatst ingelogd: ${datumTijd(g.laatstIngelogd)}.`);
  if (punten.length === 0) {
    punten.push(`Uw account en het maandelijkse creditsaldo stonden de hele periode voor u klaar.`);
  }
  return { kop: "Zo is de dienst gebruikt", punten };
}

const STATUS_NL = { betaald: "betaald", teruggeboekt: "teruggeboekt", mislukt: "mislukt", open: "in behandeling" };

function blokBetalingen(d: Dossier): Blok | null {
  if (d.betalingen.length === 0) return null;
  return {
    kop: "Overzicht van uw betalingen",
    punten: d.betalingen.map((b) => `${datum(b.datum)}: ${euro(b.bedrag)} (${STATUS_NL[b.status]})`),
  };
}

function blokVervolg(): Blok {
  return {
    kop: "Wat er nu gebeurt",
    punten: [
      "Uw account staat op slot tot het openstaande bedrag is betaald. Na betaling werkt alles meteen weer en loopt uw abonnement gewoon door.",
      `Wilt u stoppen? Opzeggen kan via uw account (Account → Abonnement) of door te mailen naar ${SELLER.email}. ` +
        "Opzeggen stopt toekomstige incasso's; het openstaande bedrag blijft verschuldigd.",
    ],
  };
}

/** De volledige mail als blokken, in volgorde. Gedeeld door de tekst- en HTML-versie. */
function blokken(d: Dossier, soort: MailSoort): { voor: Blok[]; na: Blok[] } {
  const voor: Blok[] = [{ alineas: [...inleiding(d, soort), betaalVerzoek(d, soort)] }];
  const na: Blok[] = [];
  if (d.toon === "bewust") {
    const a = blokAanmelding(d);
    if (a) na.push(a);
    na.push(blokGebruik(d));
  }
  const b = blokBetalingen(d);
  if (b) na.push(b);
  na.push(blokVervolg());
  return { voor, na };
}

function aanhef(d: Dossier): string {
  return d.naam ? `Beste ${d.naam},` : "Beste klant,";
}

const AFSLUITING = [
  "Heeft u vragen? Antwoord gerust op deze e-mail.",
  "Met vriendelijke groet,",
  "JouwAnimatieVideo",
];

export function bouwMail(d: Dossier, soort: MailSoort): { onderwerp: string; text: string; html: string } {
  const { voor, na } = blokken(d, soort);
  const knop = `Betaal ${euro(totaal(d))} met iDEAL`;

  const tekstBlok = (b: Blok) =>
    [
      b.kop ? b.kop.toUpperCase() : null,
      ...(b.alineas ?? []),
      ...(b.punten ?? []).map((p) => `- ${p}`),
    ].filter(Boolean).join("\n");

  const text = [
    aanhef(d),
    ...voor.map(tekstBlok),
    `${knop}:\n${d.betaalUrl}`,
    ...na.map(tekstBlok),
    AFSLUITING.join("\n"),
    `${SELLER.name} · ${SELLER.address}, ${SELLER.postalCity} · KvK ${SELLER.kvk}`,
  ].join("\n\n");

  const p = (s: string) => `<p style="margin:0 0 12px">${esc(s)}</p>`;
  const htmlBlok = (b: Blok) =>
    [
      b.kop ? `<h3 style="margin:24px 0 8px;font-size:15px">${esc(b.kop)}</h3>` : "",
      ...(b.alineas ?? []).map(p),
      b.punten?.length
        ? `<ul style="margin:0 0 12px;padding-left:20px">${b.punten.map((x) => `<li style="margin:0 0 6px">${esc(x)}</li>`).join("")}</ul>`
        : "",
    ].join("");

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:600px">` +
    p(aanhef(d)) +
    voor.map(htmlBlok).join("") +
    `<p style="margin:20px 0 24px"><a href="${esc(d.betaalUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;` +
    `text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(knop)}</a></p>` +
    na.map(htmlBlok).join("") +
    `<p style="margin:24px 0 12px">${AFSLUITING.map(esc).join("<br>")}</p>` +
    `<p style="margin:24px 0 0;font-size:12px;color:#64748b">${esc(`${SELLER.name} · ${SELLER.address}, ${SELLER.postalCity} · KvK ${SELLER.kvk} · btw ${SELLER.vat}`)}</p>` +
    `</div>`;

  return { onderwerp: onderwerp(d, soort), text, html };
}

/** Korte bevestiging na betaling — de klant vroeg erom, en het voorkomt een tweede storno-ronde. */
export function bouwBevestiging(naam: string | null, bedrag: number): { onderwerp: string; text: string; html: string } {
  const regels = [
    naam ? `Beste ${naam},` : "Beste klant,",
    `We hebben uw betaling van ${euro(bedrag)} ontvangen. Daarmee staat er niets meer open en is uw account weer volledig actief.`,
    "Dank u wel.",
    AFSLUITING.slice(1).join("\n"),
  ];
  return {
    onderwerp: `Betaling ontvangen: ${euro(bedrag)}`,
    text: regels.join("\n\n"),
    html:
      `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#0f172a;max-width:600px">` +
      regels.map((r) => `<p style="margin:0 0 12px">${esc(r).replace(/\n/g, "<br>")}</p>`).join("") +
      `</div>`,
  };
}
