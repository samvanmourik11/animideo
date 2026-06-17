import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Verkopergegevens (afzender) op het betaalbewijs.
 *
 * TODO Sam: vul hieronder je echte bedrijfsgegevens in. Deze staan op elk
 * bonnetje zodat een zakelijke koper de btw kan verwerken in zijn administratie.
 * Je kunt ze ook via env vars overschrijven (handig op Vercel).
 */
export const SELLER = {
  name: process.env.RECEIPT_SELLER_NAME ?? "JouwAnimatieVideo",
  legalName: process.env.RECEIPT_SELLER_LEGAL_NAME ?? "",
  address: process.env.RECEIPT_SELLER_ADDRESS ?? "Nijverheidsweg 9D",
  postalCity: process.env.RECEIPT_SELLER_POSTAL_CITY ?? "3433 NP Nieuwegein",
  country: process.env.RECEIPT_SELLER_COUNTRY ?? "Nederland",
  kvk: process.env.RECEIPT_SELLER_KVK ?? "76306933",
  vat: process.env.RECEIPT_SELLER_VAT ?? "NL003074988B57",
  email: process.env.RECEIPT_SELLER_EMAIL ?? "info@jouwanimatievideo.nl",
  website: process.env.RECEIPT_SELLER_WEBSITE ?? "ai.jouwanimatievideo.nl",
};

export const VAT_RATE = 0.21; // 21% btw

/** Bedragen incl. btw -> uitsplitsing in centen (geen floating point fouten). */
export function vatBreakdown(inclCents: number) {
  const excl = Math.round(inclCents / (1 + VAT_RATE));
  const vat = inclCents - excl;
  return { inclCents, exclCents: excl, vatCents: vat };
}

/** Mollie geeft amount.value als string ("49.00") -> centen. */
export function toCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

/** "€ 49,00" in NL-notatie. */
export function euro(cents: number): string {
  return "€ " + (cents / 100).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Datum + Mollie-ID, doorlopend-genoeg en uniek per betaling. Bv. BON-20260617-7UHSN1. */
export function receiptNumber(paymentId: string, createdAt: string): string {
  const d = new Date(createdAt);
  const ymd =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const tail = paymentId.replace(/^tr_/, "").toUpperCase().slice(0, 8);
  return `BON-${ymd}-${tail}`;
}

export function dateLabelNL(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export interface ReceiptData {
  receiptNumber: string;
  dateLabel: string;
  customerEmail: string;
  description: string;
  inclCents: number;
  exclCents: number;
  vatCents: number;
  paymentId: string;
}

/** Genereert een A4 betaalbewijs als PDF (Uint8Array). */
export async function buildReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.05, 0.07, 0.12);
  const grey = rgb(0.45, 0.48, 0.55);
  const line = rgb(0.85, 0.86, 0.9);
  const left = 50;
  const right = 545;

  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    f = font,
    color = ink
  ) => page.drawText(s, { x, y, size, font: f, color });

  const textRight = (s: string, xEnd: number, y: number, size: number, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xEnd - w, y, size, font: f, color });
  };

  const hr = (y: number) =>
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: line });

  // ── Kop ──────────────────────────────────────────────────────────────────
  let hy = 790;
  text(SELLER.name, left, hy, 18, bold);
  hy -= 20;
  if (SELLER.legalName) {
    text(SELLER.legalName, left, hy, 9, font, grey);
    hy -= 12;
  }
  text(SELLER.address, left, hy, 9, font, grey);
  hy -= 12;
  text(`${SELLER.postalCity}, ${SELLER.country}`, left, hy, 9, font, grey);

  textRight("BETAALBEWIJS", right, 790, 16, bold);
  textRight(data.receiptNumber, right, 770, 10, font, grey);
  textRight(`Datum: ${data.dateLabel}`, right, 756, 10, font, grey);

  hr(730);

  // ── Klant ──────────────────────────────────────────────────────────────────
  text("Aan", left, 708, 9, bold, grey);
  text(data.customerEmail, left, 692, 11);

  // ── Regels ─────────────────────────────────────────────────────────────────
  let y = 650;
  text("Omschrijving", left, y, 9, bold, grey);
  textRight("Bedrag", right, y, 9, bold, grey);
  y -= 8;
  hr(y);
  y -= 22;

  text(data.description, left, y, 11);
  textRight(euro(data.inclCents), right, y, 11);
  y -= 24;
  hr(y);
  y -= 24;

  // ── Totalen ──────────────────────────────────────────────────────────────
  const totalsLabelX = 360;
  text("Subtotaal (excl. btw)", totalsLabelX, y, 10, font, grey);
  textRight(euro(data.exclCents), right, y, 10);
  y -= 18;
  text("BTW 21%", totalsLabelX, y, 10, font, grey);
  textRight(euro(data.vatCents), right, y, 10);
  y -= 10;
  page.drawLine({ start: { x: totalsLabelX, y }, end: { x: right, y }, thickness: 1, color: line });
  y -= 20;
  text("Totaal (incl. btw)", totalsLabelX, y, 12, bold);
  textRight(euro(data.inclCents), right, y, 12, bold);

  // ── Voettekst ──────────────────────────────────────────────────────────────
  text("Bedragen zijn inclusief 21% btw. Betaald via Mollie.", left, 120, 9, font, grey);
  text(`Betalingskenmerk: ${data.paymentId}`, left, 108, 9, font, grey);
  hr(92);
  text(`KvK ${SELLER.kvk}`, left, 76, 9, font, grey);
  text(`BTW ${SELLER.vat}`, left, 64, 9, font, grey);
  textRight(SELLER.email, right, 76, 9, font, grey);
  textRight(SELLER.website, right, 64, 9, font, grey);

  return pdf.save();
}
