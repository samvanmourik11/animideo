"use client";

import { useEffect, useState } from "react";

interface Payment {
  id: string;
  description: string;
  date: string;
  amount: string;
  currency: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAmount(value: string): string {
  return "€ " + parseFloat(value).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PaymentsSection() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/account/payments")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPayments(d.payments ?? []))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5">
      <p className="text-sm font-semibold text-white mb-1">Betaalbewijzen</p>
      <p className="text-sm text-slate-500 mb-4">
        Download een bonnetje (incl. 21% btw) van elke betaling voor je administratie.
      </p>

      {error && (
        <p className="text-sm text-slate-500">Kon je betalingen even niet ophalen. Probeer het later opnieuw.</p>
      )}

      {!error && payments === null && (
        <p className="text-sm text-slate-500">Laden…</p>
      )}

      {!error && payments?.length === 0 && (
        <p className="text-sm text-slate-500">Je hebt nog geen betalingen.</p>
      )}

      {!error && payments && payments.length > 0 && (
        <ul className="divide-y divide-white/[0.06]">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{p.description}</p>
                <p className="text-xs text-slate-500">{formatDate(p.date)}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-sm text-slate-300">{formatAmount(p.amount)}</span>
                <a
                  href={`/api/account/receipt/${p.id}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium"
                >
                  Download PDF
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
