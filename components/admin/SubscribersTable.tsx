"use client";

import { useMemo, useState } from "react";
import type { SubscriberRow } from "@/lib/admin/metrics";
import { Card, SectionTitle, Badge } from "./primitives";
import { eur, dateNL } from "./format";

type SortKey = "email" | "plan" | "status" | "mrr" | "start" | "next" | "credits";

export function SubscribersTable({ rows }: { rows: SubscriberRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("start");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [onlyActive, setOnlyActive] = useState(false);

  const filtered = useMemo(() => {
    let r = rows;
    if (onlyActive) r = r.filter((x) => x.status === "active");
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((x) => x.email.toLowerCase().includes(s) || (x.name ?? "").toLowerCase().includes(s) || x.plan.toLowerCase().includes(s));
    }
    return [...r].sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, q, sort, dir, onlyActive]);

  function toggleSort(k: SortKey) {
    if (sort === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(k === "email" || k === "plan" ? 1 : -1);
    }
  }

  function exportCsv() {
    const head = ["email", "naam", "plan", "status", "mrr", "gestart", "volgende_incasso", "credits", "oorsprong", "subscription_id"];
    const lines = filtered.map((r) =>
      [r.email, r.name ?? "", r.plan, r.status, r.mrr, r.start ?? "", r.next ?? "", r.credits ?? "", r.origin ?? "", r.subscriptionId ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [head.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abonnees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`py-2 px-2 font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-300 ${right ? "text-right" : "text-left"}`}
    >
      {children} {sort === k ? (dir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <Card>
      <SectionTitle
        right={
          <button onClick={exportCsv} className="text-xs px-2.5 py-1 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10">
            ↓ CSV
          </button>
        }
      >
        Abonnees ({filtered.length})
      </SectionTitle>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op e-mail, naam of plan…"
          className="flex-1 min-w-[180px] bg-[#060d1f] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="accent-blue-500" />
          Alleen actief
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10">
              <Th k="email">Klant</Th>
              <Th k="plan">Plan</Th>
              <Th k="status">Status</Th>
              <Th k="mrr" right>MRR</Th>
              <Th k="start" right>Gestart</Th>
              <Th k="next" right>Volgende incasso</Th>
              <Th k="credits" right>Credits</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.subscriptionId} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="py-2 px-2">
                  <div className="text-slate-200">{r.email}</div>
                  <div className="flex gap-1.5 items-center mt-0.5">
                    {r.name && <span className="text-slate-500">{r.name}</span>}
                    {r.origin === "trial" && <Badge tone="amber">trial-start</Badge>}
                    {r.origin === "cursus" && <Badge tone="blue">cursus</Badge>}
                  </div>
                </td>
                <td className="py-2 px-2 text-slate-300">{r.plan}</td>
                <td className="py-2 px-2">
                  {r.status === "active" ? <Badge tone="green">actief</Badge> : r.status === "canceled" ? <Badge tone="red">opgezegd</Badge> : <Badge tone="slate">{r.status}</Badge>}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-300">{r.mrr ? eur(r.mrr) : "—"}</td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-400">{dateNL(r.start)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-400">{dateNL(r.next)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-slate-400">{r.credits ?? "—"}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-600">
                  Geen abonnees gevonden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
