"use client";

import { ReactNode } from "react";

/** Standaard donkere kaart in de huisstijl. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5 ${className}`}>{children}</div>
  );
}

/** Sectietitel + optionele rechterkant. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-slate-300">{children}</h2>
      {right}
    </div>
  );
}

/** Grote KPI-tegel met label, waarde en optionele delta. */
export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-white";
  const deltaTone =
    delta === undefined ? "" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-slate-400";
  const arrow = delta === undefined ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
  return (
    <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-4 flex flex-col justify-between">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 ${toneClass} tabular-nums`}>{value}</p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${deltaTone} tabular-nums`}>
          {arrow} {delta > 0 ? "+" : ""}
          {deltaLabel}
        </p>
      )}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "slate" | "blue"; children: ReactNode }) {
  const map: Record<string, string> = {
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    slate: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[tone]}`}>
      {children}
    </span>
  );
}

/** Kleine stat binnen een panel. */
export function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
