// Client-side composite voor de eindscene van een studio-project.
// Plakt logo + contactgegevens als overlay op een gegenereerde scene image.
// Werkt volledig in de browser (Canvas API) — geen server-side image deps nodig.

import { OutroContact } from "@/lib/types";

interface OutroOverlayInput {
  baseImageUrl:  string;
  logoUrl?:      string | null;
  contact:       OutroContact;
  format:        "16:9" | "9:16";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

function fitContain(srcW: number, srcH: number, maxW: number, maxH: number): { w: number; h: number } {
  const r = Math.min(maxW / srcW, maxH / srcH);
  return { w: srcW * r, h: srcH * r };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildOutroImage({ baseImageUrl, logoUrl, contact, format }: OutroOverlayInput): Promise<Blob> {
  const base = await loadImage(baseImageUrl);
  const logo = logoUrl ? await loadImage(logoUrl).catch(() => null) : null;

  const targetW = format === "9:16" ? 1080 : 1920;
  const targetH = format === "9:16" ? 1920 : 1080;

  const canvas = document.createElement("canvas");
  canvas.width  = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context niet beschikbaar");

  // Base scene as background (cover-fit)
  const baseRatio   = base.width / base.height;
  const targetRatio = targetW / targetH;
  let drawW: number, drawH: number, drawX: number, drawY: number;
  if (baseRatio > targetRatio) {
    drawH = targetH;
    drawW = baseRatio * drawH;
    drawX = (targetW - drawW) / 2;
    drawY = 0;
  } else {
    drawW = targetW;
    drawH = drawW / baseRatio;
    drawX = 0;
    drawY = (targetH - drawH) / 2;
  }
  ctx.drawImage(base, drawX, drawY, drawW, drawH);

  // Dark veil so the overlay is readable on any image
  const veil = ctx.createLinearGradient(0, 0, 0, targetH);
  veil.addColorStop(0,    "rgba(0,0,0,0.55)");
  veil.addColorStop(0.4,  "rgba(0,0,0,0.65)");
  veil.addColorStop(1,    "rgba(0,0,0,0.75)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, targetW, targetH);

  // Layout: logo (optional) + company/tagline + contact lines, vertically centered
  const PAD       = format === "9:16" ? 80 : 120;
  const innerW    = targetW - PAD * 2;
  const lines: { text: string; size: number; weight: string; opacity: number; gapAfter: number }[] = [];

  const company = contact.company_name?.trim();
  const tagline = contact.tagline?.trim();
  const website = contact.website?.trim();
  const email   = contact.email?.trim();
  const phone   = contact.phone?.trim();
  const socials = contact.socials?.trim();

  if (company) lines.push({ text: company, size: format === "9:16" ? 76 : 88, weight: "700", opacity: 1,    gapAfter: 16 });
  if (tagline) lines.push({ text: tagline, size: format === "9:16" ? 38 : 44, weight: "400", opacity: 0.92, gapAfter: 56 });

  const contactLines: string[] = [];
  if (website) contactLines.push(website);
  if (email)   contactLines.push(email);
  if (phone)   contactLines.push(phone);
  if (socials) contactLines.push(socials);

  for (let i = 0; i < contactLines.length; i++) {
    lines.push({
      text:     contactLines[i],
      size:     format === "9:16" ? 32 : 38,
      weight:   "500",
      opacity:  0.85,
      gapAfter: i < contactLines.length - 1 ? 14 : 0,
    });
  }

  // Measure logo
  const logoBox = logo
    ? fitContain(logo.width, logo.height, innerW * 0.6, targetH * (format === "9:16" ? 0.18 : 0.22))
    : null;
  const logoGap = logo ? (format === "9:16" ? 56 : 72) : 0;

  // Measure text block
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  let textBlockH = 0;
  const measured: { text: string; lines: string[]; size: number; weight: string; opacity: number; gapAfter: number }[] = [];
  for (const l of lines) {
    ctx.font = `${l.weight} ${l.size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    const wrapped = wrapText(ctx, l.text, innerW);
    const blockH  = wrapped.length * l.size * 1.2;
    measured.push({ ...l, lines: wrapped });
    textBlockH += blockH + l.gapAfter;
  }

  const totalH = (logoBox?.h ?? 0) + logoGap + textBlockH;
  let cursorY  = (targetH - totalH) / 2;

  // Draw logo
  if (logo && logoBox) {
    const logoX = (targetW - logoBox.w) / 2;
    ctx.drawImage(logo, logoX, cursorY, logoBox.w, logoBox.h);
    cursorY += logoBox.h + logoGap;
  }

  // Draw text lines
  ctx.fillStyle = "#FFFFFF";
  for (const l of measured) {
    ctx.font = `${l.weight} ${l.size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    ctx.globalAlpha = l.opacity;
    for (const wrapped of l.lines) {
      ctx.fillText(wrapped, targetW / 2, cursorY);
      cursorY += l.size * 1.2;
    }
    cursorY += l.gapAfter;
  }
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Canvas toBlob mislukt")), "image/jpeg", 0.92);
  });
}
