import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { leesTabel, tabelTekst } from "./cijfers";

describe("cijfers lezen", () => {
  it("leest een Nederlandse CSV met puntkomma en aanhalingstekens", async () => {
    const rijen = await leesTabel("omzet.csv", Buffer.from('﻿Jaar;Omzet;"Klanten, totaal"\n2023;"1.200.000";340\n2024;1.450.000;410\n'));
    expect(rijen).toEqual([["Jaar", "Omzet", "Klanten, totaal"], ["2023", "1.200.000", "340"], ["2024", "1.450.000", "410"]]);
    expect(tabelTekst(rijen)).toContain("| 2024 | 1.450.000 | 410 |");
  });

  it("leest het eerste gevulde blad van een Excel-bestand, ook formules", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Leeg");
    const ws = wb.addWorksheet("Cijfers");
    ws.addRow(["Maand", "Bezoekers"]);
    ws.addRow(["Jan", 120]);
    ws.addRow(["Feb", { formula: "B2*2", result: 240 }]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await leesTabel("data.xlsx", buf)).toEqual([["Maand", "Bezoekers"], ["Jan", "120"], ["Feb", "240"]]);
  });

  it("weigert een bestand zonder cijfers", async () => {
    await expect(leesTabel("x.csv", Buffer.from("alleen een kop\n"))).rejects.toThrow(/te weinig/);
  });
});
