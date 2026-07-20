"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const FB_PIXEL_ID = "7827964890555370";

function SuccessContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const checkoutId = searchParams.get("checkout_id") ?? "";

  const signupUrl = `/signup?guest_email=${encodeURIComponent(email)}&plan=starter`;

  // Meta Pixel: Purchase-event (€246) na geslaagde traject-betaling.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { fbq?: (...args: unknown[]) => void; _fbq?: unknown };

    if (!w.fbq) {
      /* eslint-disable */
      (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      /* eslint-enable */
      w.fbq!("init", FB_PIXEL_ID);
    }

    w.fbq!("track", "PageView");
    w.fbq!(
      "track",
      "Purchase",
      { value: 246.0, currency: "EUR", content_name: "Starttraject" },
      checkoutId ? { eventID: checkoutId } : undefined
    );
  }, [checkoutId]);

  return (
    <div className="min-h-screen bg-[#060d1f] flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(34,197,94,0.12) 0%, transparent 70%)" }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <svg width="36" height="36" fill="none" stroke="#4ade80" strokeWidth="2.5" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Betaling geslaagd!</h1>
        <p className="text-slate-400 text-sm mb-8">
          Je <span className="text-white font-semibold">Starttraject</span> staat klaar.<br />
          Maak nu je account aan — je <span className="text-white font-semibold">3000 credits</span> worden automatisch ingeladen.
        </p>

        <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-5 mb-6 text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <p className="text-sm font-semibold text-white">Betaling verwerkt · €246</p>
          </div>
          <p className="text-xs text-slate-500 ml-5">
            {email && <>{email} · </>}Starttraject · 3000 credits
          </p>
        </div>

        <Link href={signupUrl} className="btn-primary block w-full py-3 text-base">
          Account aanmaken →
        </Link>

        <p className="text-xs text-slate-400 mt-4">
          Je credits worden automatisch gekoppeld na registratie.
        </p>
      </div>
    </div>
  );
}

export default function TrajectSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
