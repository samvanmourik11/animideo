import Link from "next/link";
import TrialCheckoutForm from "./TrialCheckoutForm";

export const dynamic = "force-dynamic";

export default function TrialCheckoutPage() {
  return (
    <div
      className="min-h-screen bg-vlak flex items-start sm:items-center justify-center px-4 py-8"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 70%)" }}
    >
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-tekst-3 hover:text-tekst transition-colors mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Terug
        </Link>

        <div className="rounded-2xl border border-blue-200 p-5 mb-6 bg-blue-50">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">7 dagen proef</p>
          <p className="text-2xl font-black text-tekst mb-1">7 dagen voor €1</p>
          <p className="text-sm text-tekst-2">Daarna €49/maand Starter, maandelijks opzegbaar</p>
        </div>

        <div className="bg-paneel border border-rand rounded-2xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <h1 className="text-xl font-bold text-tekst mb-1">Animideo, proefperiode</h1>
          <p className="text-sm text-tekst-3 mb-4">Vul je e-mail in om door te gaan naar betaling.</p>

          <ul className="text-sm text-tekst-2 space-y-2 mb-6">
            <li className="flex gap-2"><span className="text-blue-600">✓</span> Volledige toegang tot alle functies</li>
            <li className="flex gap-2"><span className="text-blue-600">✓</span> Alle animatiestijlen, stemmen en muziek</li>
            <li className="flex gap-2"><span className="text-blue-600">✓</span> Video&apos;s downloaden en direct gebruiken</li>
            <li className="flex gap-2"><span className="text-blue-600">✓</span> Na 7 dagen automatisch door als Starter</li>
          </ul>

          <TrialCheckoutForm />

          <p className="text-xs text-tekst-3 text-center mt-4">
            Beveiligd via Mollie, iDEAL / SEPA. €1 nu, daarna €49/maand na 7 dagen.
          </p>
        </div>
      </div>
    </div>
  );
}
