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
    <div className="bg-paneel border border-rand rounded-2xl p-5">
      <p className="text-sm font-semibold text-tekst mb-1">Betaalbewijzen</p>
      <p className="text-sm text-tekst-3 mb-4">
        Download een bonnetje (incl. 21% btw) van elke betaling voor je administratie.
      </p>

      {error && (
        <p className="text-sm text-tekst-3">Kon je betalingen even niet ophalen. Probeer het later opnieuw.</p>
      )}

      {!error && payments === null && (
        <p className="text-sm text-tekst-3">Laden…</p>
      )}

      {!error && payments?.length === 0 && (
        <p className="text-sm text-tekst-3">Je hebt nog geen betalingen.</p>
      )}

      {!error && payments && payments.length > 0 && (
        <ul className="divide-y divide-rand">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-tekst truncate">{p.description}</p>
                <p className="text-xs text-tekst-3">{formatDate(p.date)}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-sm text-tekst-2">{formatAmount(p.amount)}</span>
                <a
                  href={`/api/account/receipt/${p.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors text-sm font-medium"
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
