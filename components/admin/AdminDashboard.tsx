"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/admin/metrics";
import { Card, SectionTitle, KpiTile, MiniStat, Badge } from "./primitives";
import { SignupsChart, PlanDonut, MethodDonut } from "./charts";
import { SubscribersTable } from "./SubscribersTable";
import { eur, pct, dateNL, dateShort, timeNL, relTime } from "./format";

const POLL_MS = 60_000;

type Payload = DashboardData & { cached?: boolean; stale?: boolean };

export default function AdminDashboard({ endpoint = "/api/admin/dashboard" }: { endpoint?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [, forceTick] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async (force = false) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Fout ${res.status}`);
      }
      const j: Payload = await res.json();
      setData(j);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(), POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    // "laatst bijgewerkt (x min geleden)" laten meelopen
    const tick = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(iv);
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Abonnementen-dashboard</h1>
          <p className="text-sm text-slate-500">Live overzicht van je software-abonnementen · bron: Mollie + Supabase</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end text-xs text-slate-400">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
              {updatedAt ? `bijgewerkt ${timeNL(updatedAt)}` : "laden…"}
            </div>
            {data?.stale && <div className="text-[11px] text-amber-400">verouderd (Mollie onbereikbaar)</div>}
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/25 hover:bg-blue-500/25 disabled:opacity-50 transition-colors"
          >
            {loading ? "Verversen…" : "↻ Nu verversen"}
          </button>
        </div>
      </div>

      {error && !data && (
        <Card className="border-red-500/20">
          <p className="text-red-400 text-sm">Kon dashboard niet laden: {error}</p>
          <p className="text-slate-500 text-xs mt-1">
            Controleer of <code>MOLLIE_API_KEY</code> geldig is (in <code>.env.local</code> staat lokaal een placeholder).
          </p>
        </Card>
      )}

      {!data && !error && <SkeletonGrid />}

      {data && (
        <>
          {/* KPI-balk */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiTile label="MRR" value={eur(data.kpi.mrr)} delta={data.kpi.mrrChangeThisMonth} deltaLabel={`${eur(data.kpi.mrrChangeThisMonth)} deze maand`} />
            <KpiTile label="ARR" value={eur(data.kpi.arr)} />
            <KpiTile label="Actieve abonnees" value={String(data.kpi.activePaying)} delta={data.kpi.netGrowthThisMonth} deltaLabel={`${data.kpi.netGrowthThisMonth} deze maand`} />
            <KpiTile
              label="Netto groei (maand)"
              value={`${data.kpi.netGrowthThisMonth > 0 ? "+" : ""}${data.kpi.netGrowthThisMonth}`}
              tone={data.kpi.netGrowthThisMonth >= 0 ? "good" : "bad"}
            />
            <KpiTile label="Churn (30d)" value={pct(data.kpi.churnRate30)} tone={data.kpi.churnRate30 > 0.1 ? "bad" : "neutral"} />
            <KpiTile label="ARPU" value={eur(data.kpi.arpu, true)} />
          </div>

          {/* Aanmeldingen/afmeldingen */}
          <Card>
            <SignupsChart daily={data.daily} />
            <div className="grid grid-cols-3 gap-4 mt-2 pt-3 border-t border-white/[0.06]">
              <MiniStat label="Nieuw deze maand" value={String(data.kpi.newThisMonth)} />
              <MiniStat label="Opgezegd deze maand" value={String(data.kpi.canceledThisMonth)} />
              <MiniStat label="Totaal abonnementen" value={`${data.totals.totalSubs}`} sub={`${data.totals.active} actief · ${data.totals.canceled} opgezegd`} />
            </div>
          </Card>

          {/* Plan-mix + Betalingen */}
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <SectionTitle>Plan-mix</SectionTitle>
              <div className="grid grid-cols-2 gap-2 items-center">
                <PlanDonut planMix={data.planMix} />
                <div className="space-y-2">
                  {data.planMix.map((p) => (
                    <div key={p.plan} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{p.label}</span>
                      <span className="text-slate-400 tabular-nums">
                        {p.count} · <span className="text-white font-semibold">{eur(p.mrr)}</span>/mnd
                      </span>
                    </div>
                  ))}
                  {data.totals.comp > 0 && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-white/[0.06]">
                      <span className="text-slate-500">Intern/comp (geen incasso)</span>
                      <span className="text-slate-500 tabular-nums">{data.totals.comp}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <PaymentsPanel data={data} />
          </div>

          {/* Aandacht + Engagement/Activiteit */}
          <div className="grid lg:grid-cols-2 gap-5">
            <AttentionPanel data={data} />
            <div className="space-y-5">
              <EngagementPanel data={data} />
              <ActivityFeed data={data} />
            </div>
          </div>

          {/* Abonnee-tabel */}
          <SubscribersTable rows={data.subscribers} />

          <p className="text-center text-[11px] text-slate-600">
            Automatisch verversd elke 60s · gegenereerd {data.generatedAt ? dateNL(data.generatedAt) : ""} {updatedAt ? timeNL(updatedAt) : ""}
            {data.cached ? " · uit cache" : ""}
          </p>
        </>
      )}
    </div>
  );
}

function PaymentsPanel({ data }: { data: DashboardData }) {
  const sr = data.payments.successRate;
  return (
    <Card>
      <SectionTitle>Betalingen &amp; incasso</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          <MiniStat label="Omzet deze maand" value={eur(data.payments.revenueThisMonth)} sub="netto, abonnementen" />
          <div>
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Incasso-succesratio (90d)</p>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden flex">
              <div className="bg-emerald-500" style={{ width: `${sr.rate * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(1 - sr.rate) * 100}%` }} />
            </div>
            <p className="text-xs text-slate-400 mt-1 tabular-nums">
              {pct(sr.rate)} geslaagd · <span className="text-slate-500">{sr.paid} betaald, {sr.failed} mislukt/verlopen</span>
            </p>
          </div>
          <MiniStat
            label="Incasso komende 30 dagen"
            value={eur(data.payments.upcoming30.total)}
            sub={`${data.payments.upcoming30.count} abonnementen`}
          />
        </div>
        <div>
          <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 text-center">Betaalmethode</p>
          <MethodDonut methodMix={data.payments.methodMix} />
        </div>
      </div>
    </Card>
  );
}

function AttentionPanel({ data }: { data: DashboardData }) {
  const { failedPayments, canceledStillActive, reconciliation } = data.attention;
  const nothing = !failedPayments.length && !canceledStillActive.length && !reconciliation.length;
  return (
    <Card>
      <SectionTitle
        right={
          nothing ? <Badge tone="green">alles in orde</Badge> : <Badge tone="amber">{failedPayments.length + canceledStillActive.length + reconciliation.length} punten</Badge>
        }
      >
        Aandacht vereist
      </SectionTitle>

      {nothing && <p className="text-sm text-slate-500">Geen mislukte incasso&apos;s, openstaande opzeggingen of afwijkingen.</p>}

      {failedPayments.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-red-400 mb-1.5">Mislukte incasso&apos;s ({failedPayments.length})</p>
          <ul className="space-y-1.5">
            {failedPayments.slice(0, 6).map((f, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate mr-2">{f.email}</span>
                <span className="text-slate-500 whitespace-nowrap">
                  {eur(f.amount)} · {f.reason} · {dateShort(f.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canceledStillActive.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-amber-400 mb-1.5">Opgezegd, loopt nog ({canceledStillActive.length})</p>
          <ul className="space-y-1.5">
            {canceledStillActive.slice(0, 6).map((c, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate mr-2">{c.email}</span>
                <span className="text-slate-500 whitespace-nowrap">{c.plan} · t/m {dateShort(c.endsAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reconciliation.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-violet-400 mb-1.5">Status-afwijking Supabase↔Mollie ({reconciliation.length})</p>
          <ul className="space-y-1.5">
            {reconciliation.slice(0, 6).map((r, i) => (
              <li key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate mr-2">{r.email}</span>
                <span className="text-slate-500 whitespace-nowrap">
                  db: {r.supabase} · mollie: {r.mollie}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function EngagementPanel({ data }: { data: DashboardData }) {
  const e = data.engagement;
  return (
    <Card>
      <SectionTitle>Gebruik &amp; engagement</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <MiniStat label="Actieve makers (7d)" value={String(e.activeCreators7d)} />
        <MiniStat label="Actieve makers (30d)" value={String(e.activeCreators30d)} />
        <MiniStat label="Projecten (7d)" value={String(e.projectsCreated7d)} />
        <MiniStat label="Projecten (30d)" value={String(e.projectsCreated30d)} />
      </div>
    </Card>
  );
}

function ActivityFeed({ data }: { data: DashboardData }) {
  const dot: Record<string, string> = {
    signup: "bg-emerald-400",
    cancel: "bg-red-400",
    payment_paid: "bg-blue-400",
    payment_failed: "bg-amber-400",
  };
  return (
    <Card>
      <SectionTitle>Recente activiteit</SectionTitle>
      <ul className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
        {data.activity.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot[a.type]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-300">
                  {a.label}
                  {a.amount ? ` · ${eur(a.amount)}` : ""}
                </span>
                <span className="text-slate-600 whitespace-nowrap">{relTime(a.ts)}</span>
              </div>
              <div className="text-slate-500 truncate">{a.email}</div>
            </div>
          </li>
        ))}
        {!data.activity.length && <li className="text-sm text-slate-500">Nog geen recente activiteit.</li>}
      </ul>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[#0c1428] border border-white/[0.05]" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-[#0c1428] border border-white/[0.05]" />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="h-56 rounded-2xl bg-[#0c1428] border border-white/[0.05]" />
        <div className="h-56 rounded-2xl bg-[#0c1428] border border-white/[0.05]" />
      </div>
    </div>
  );
}
