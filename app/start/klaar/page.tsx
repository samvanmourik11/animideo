"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const FB_PIXEL_ID = "7827964890555370";
const NAAM: Record<string, string> = { starter: "Starter", pro: "Pro", agency: "Agency" };

// Terug van iDEAL. De webhook van Mollie is soms een paar seconden later dan de klant, dus
// we vragen de status een halve minuut lang na voordat we iets anders dan "bezig" zeggen.
function Klaar() {
  const zoek = useSearchParams();
  const id = zoek.get("checkout_id") ?? "";
  const email = zoek.get("email") ?? "";
  const plan = NAAM[zoek.get("plan") ?? ""] ?? "Pro";
  const [status, setStatus] = useState("open");

  useEffect(() => {
    let n = 0;
    let stop = false;
    async function kijk() {
      const d = await fetch(`/api/gratis-week/status?id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
      if (stop) return;
      setStatus(d.status ?? "onbekend");
      if (d.status === "open" || d.status === "bezig") {
        if (++n < 15) setTimeout(kijk, 2000);
        else setStatus("onbekend");
      }
    }
    kijk();
    return () => { stop = true; };
  }, [id]);

  // Meta Pixel: StartTrial, met het checkout-id als eventID (ontdubbelen met een server-event).
  useEffect(() => {
    if (status !== "gestart") return;
    const w = window as unknown as { fbq?: (...args: unknown[]) => void };
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
    w.fbq!("track", "StartTrial", { value: 0, currency: "EUR", predicted_ltv: 0, content_name: `Gratis week ${plan}` }, id ? { eventID: id } : undefined);
  }, [status, id, plan]);

  const signup = `/signup?guest_email=${encodeURIComponent(email)}&plan=${zoek.get("plan") ?? "pro"}`;

  return (
    <div className="min-h-screen bg-vlak flex items-center justify-center px-4"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 70%)" }}>
      <div className="w-full max-w-sm text-center">
        {status === "gestart" ? (
          <>
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold text-tekst mb-2">Je gratis week is gestart</h1>
            <p className="text-tekst-3 text-sm mb-6">200 credits staan klaar. Het verificatiebedrag krijg je vandaag terug. Na 7 dagen loopt {plan} door, tenzij je eerder opzegt.</p>
            <Link href={signup} className="btn-primary w-full py-3 inline-block">Maak je account aan →</Link>
          </>
        ) : status === "dubbel" ? (
          <>
            <div className="text-5xl mb-4">🙈</div>
            <h1 className="text-2xl font-bold text-tekst mb-2">Deze rekening had al een gratis week</h1>
            <p className="text-tekst-3 text-sm mb-6">Het verificatiebedrag storten we terug. Wil je verder? Kies dan een abonnement.</p>
            <Link href="/checkout" className="btn-primary w-full py-3 inline-block">Bekijk de pakketten →</Link>
          </>
        ) : status === "mislukt" ? (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-tekst mb-2">De verificatie is niet gelukt</h1>
            <p className="text-tekst-3 text-sm mb-6">Er is niets afgeschreven. Probeer het nog eens.</p>
            <Link href="/start" className="btn-primary w-full py-3 inline-block">Opnieuw proberen</Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <h1 className="text-xl font-bold text-tekst mb-2">Even controleren bij je bank…</h1>
            <p className="text-tekst-3 text-sm">Dit duurt meestal een paar seconden.</p>
            {status === "onbekend" && <p className="text-tekst-3 text-xs mt-4">Duurt het lang? <Link href={signup} className="text-blue-600 underline">Ga toch verder</Link>.</p>}
          </>
        )}
        <p className="text-xs text-tekst-3 mt-10">Powered by JouwAnimatieVideo</p>
      </div>
    </div>
  );
}

export default function KlaarPagina() {
  return <Suspense><Klaar /></Suspense>;
}
