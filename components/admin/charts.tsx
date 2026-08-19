"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { DailyPoint, PlanMixItem, PaymentsInfo } from "@/lib/admin/metrics";
import { COLORS, PLAN_COLOR, eur, dateShort } from "./format";

const tooltipStyle = {
  contentStyle: {
    background: "#0c1428",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    fontSize: 12,
    color: "#e2e8f0",
  },
  labelStyle: { color: "#94a3b8" },
};

type Period = { key: string; label: string; days?: number; weeks?: number };
const PERIODS: Period[] = [
  { key: "7d", label: "7 dagen", days: 7 },
  { key: "30d", label: "30 dagen", days: 30 },
  { key: "90d", label: "90 dagen", days: 90 },
  { key: "4w", label: "4 weken", weeks: 4 },
  { key: "8w", label: "8 weken", weeks: 8 },
];

interface Row {
  label: string;
  aanmeldingen: number;
  afmeldingen: number;
  netto: number;
}

function buildRows(daily: DailyPoint[], p: Period): Row[] {
  let base: { label: string; aanmeldingen: number; afmeldingen: number }[];
  if (p.days) {
    base = daily.slice(-p.days).map((d) => ({
      label: dateShort(d.date),
      aanmeldingen: d.aanmeldingen,
      afmeldingen: d.afmeldingen,
    }));
  } else {
    const w = p.weeks!;
    const slice = daily.slice(-w * 7);
    base = [];
    for (let i = 0; i < w; i++) {
      const chunk = slice.slice(i * 7, i * 7 + 7);
      if (!chunk.length) continue;
      base.push({
        label: dateShort(chunk[chunk.length - 1].date),
        aanmeldingen: chunk.reduce((s, c) => s + c.aanmeldingen, 0),
        afmeldingen: chunk.reduce((s, c) => s + c.afmeldingen, 0),
      });
    }
  }
  let run = 0;
  return base.map((b) => {
    run += b.aanmeldingen - b.afmeldingen;
    return { ...b, netto: run };
  });
}

export function SignupsChart({ daily }: { daily: DailyPoint[] }) {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const rows = useMemo(() => buildRows(daily, period), [daily, period]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Aanmeldingen &amp; afmeldingen</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                period.key === p.key
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} iconType="circle" />
          <Bar dataKey="aanmeldingen" name="Aanmeldingen" fill={COLORS.green} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Bar dataKey="afmeldingen" name="Afmeldingen" fill={COLORS.red} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Line
            dataKey="netto"
            name="Netto (cumulatief)"
            type="monotone"
            stroke={COLORS.blueLight}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlanDonut({ planMix }: { planMix: PlanMixItem[] }) {
  const total = planMix.reduce((s, p) => s + p.count, 0);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={planMix}
          dataKey="count"
          nameKey="label"
          innerRadius={48}
          outerRadius={72}
          paddingAngle={2}
          stroke="none"
        >
          {planMix.map((p) => (
            <Cell key={p.plan} fill={PLAN_COLOR[p.label] ?? COLORS.blue} />
          ))}
        </Pie>
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number, _n, item) => [`${v} abo's · ${eur((item?.payload as PlanMixItem).mrr)}/mnd`, (item?.payload as PlanMixItem).label]}
        />
        <text x="50%" y="47%" textAnchor="middle" fill="#e2e8f0" fontSize={22} fontWeight={700}>
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" fill="#64748b" fontSize={11}>
          betalend
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

const METHOD_LABELS: Record<string, string> = {
  ideal: "iDEAL",
  directdebit: "Incasso",
  creditcard: "Creditcard",
  bancontact: "Bancontact",
  kbc: "KBC",
  onbekend: "Onbekend",
};
const METHOD_COLORS = [COLORS.blue, COLORS.violet, COLORS.amber, COLORS.green, COLORS.slate, COLORS.redLight];

export function MethodDonut({ methodMix }: { methodMix: PaymentsInfo["methodMix"] }) {
  const data = methodMix.map((m) => ({ ...m, label: METHOD_LABELS[m.method] ?? m.method }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" innerRadius={40} outerRadius={66} paddingAngle={2} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v: number, _n, item) => [`${v} betalingen`, (item?.payload as { label: string }).label]} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}
