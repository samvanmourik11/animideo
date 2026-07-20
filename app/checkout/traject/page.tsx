import Link from "next/link";
import TrajectCheckoutForm from "./TrajectCheckoutForm";

export const dynamic = "force-dynamic";

const FEATURES = [
  "Onboardingcall + 2 extra calls: je 1e video in 1 uur",
  "Wekelijkse trainingscalls",
  "Toegang tot alle workshops",
  "Direct aan de slag zonder zorgen",
];

export default function TrajectCheckoutPage() {
  return (
    <div
      className="min-h-screen bg-[#060d1f] flex items-start sm:items-center justify-center px-4 py-8"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(34,197,94,0.15) 0%, transparent 70%)" }}
    >
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Terug
        </Link>

        {/* Aanbod-kaart (zoals de afbeelding) */}
        <div className="relative rounded-[28px] p-[3px] mb-6" style={{ background: "#3aa76d" }}>
          <div className="rounded-[26px] bg-[#0e1b33] overflow-hidden">
            <div className="bg-[#e0993f] px-6 py-3">
              <p className="text-center text-white font-extrabold tracking-wide text-sm">MEEST GEKOZEN</p>
            </div>
            <div className="p-6 sm:p-7">
              <p className="text-[#4bb37c] font-extrabold tracking-wide text-sm mb-2">HET STARTTRAJECT</p>
              <p className="text-white font-black text-5xl leading-none mb-2">€246</p>
              <p className="text-slate-400 text-sm mb-6">6 mnd software vooruit · begeleiding inbegrepen</p>
              <ul className="space-y-3.5">
                {FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-white font-bold text-[15px] leading-snug">
                    <span className="text-[#4bb37c] mt-0.5 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Checkout */}
        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6 shadow-[0_16px_60px_rgba(0,0,0,0.5)]">
          <h1 className="text-xl font-bold text-white mb-1">Het Starttraject afrekenen</h1>
          <p className="text-sm text-slate-400 mb-4">
            Eenmalig <strong className="text-white">€246</strong> · je krijgt direct <strong className="text-white">3000 credits</strong> ingeladen.
            Vul je e-mail in om door te gaan naar de betaling.
          </p>

          <TrajectCheckoutForm />

          <p className="text-xs text-slate-400 text-center mt-4">
            Beveiligd via Mollie, iDEAL / SEPA. Eenmalige betaling van €246 — geen abonnement.
          </p>
        </div>
      </div>
    </div>
  );
}
