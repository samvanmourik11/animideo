// Data-video (verbeterplan idee 11): cijfers uit Excel of CSV als tabel in het gesprek met de
// regisseur. Zo zien de regisseur, de scriptschrijver en de tekenaar precies dezelfde waarden;
// de tekenaar maakt er grafieken en tellers van die op de stem bewegen.
import ExcelJS from "exceljs";

export const MAX_RIJEN = 40;
export const MAX_KOLOMMEN = 10;

const cel = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return cel(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
    return "";
  }
  return String(v);
};

/** Eén CSV-regel splitsen, met aanhalingstekens; ; of , of tab als scheiding. */
function csvRegel(regel: string, sep: string): string[] {
  const uit: string[] = [];
  let veld = "", inQ = false;
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i];
    if (inQ) {
      if (c === '"' && regel[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') inQ = false;
      else veld += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { uit.push(veld); veld = ""; }
    else veld += c;
  }
  uit.push(veld);
  return uit;
}

export async function leesTabel(naam: string, buf: Buffer): Promise<string[][]> {
  let rijen: string[][];
  if (/\.xlsx$/i.test(naam)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const blad = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!blad) throw new Error("Dit Excel-bestand is leeg.");
    rijen = [];
    blad.eachRow({ includeEmpty: false }, (r) => {
      const waarden = (r.values as unknown[]).slice(1).map(cel);
      rijen.push(waarden);
    });
  } else if (/\.(csv|tsv|txt)$/i.test(naam)) {
    const tekst = buf.toString("utf8").replace(/^﻿/, "");
    const regels = tekst.split(/\r?\n/).filter((r) => r.trim());
    const eerste = regels[0] ?? "";
    const sep = eerste.includes("\t") ? "\t" : (eerste.match(/;/g)?.length ?? 0) >= (eerste.match(/,/g)?.length ?? 0) ? ";" : ",";
    rijen = regels.map((r) => csvRegel(r, sep));
  } else throw new Error("Kies een Excel-bestand (.xlsx) of een CSV-bestand.");
  rijen = rijen
    .map((r) => r.slice(0, MAX_KOLOMMEN).map((c) => c.replace(/\s+/g, " ").trim().slice(0, 40)))
    .filter((r) => r.some((c) => c));
  if (rijen.length < 2) throw new Error("Er staan te weinig rijen in dit bestand: minstens een kopregel en één rij cijfers.");
  return rijen.slice(0, MAX_RIJEN + 1);
}

/** De tabel als tekst voor het gesprek (Markdown-tabel). */
export function tabelTekst(rijen: string[][]): string {
  const breedte = Math.max(...rijen.map((r) => r.length));
  const vul = (r: string[]) => [...r, ...Array(breedte - r.length).fill("")];
  const [kop, ...rest] = rijen.map(vul);
  return [`| ${kop.join(" | ")} |`, `| ${kop.map(() => "---").join(" | ")} |`, ...rest.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}
