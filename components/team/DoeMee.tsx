"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Een uitnodiging aannemen. Drie situaties: niet ingelogd (eerst inloggen of een account
// maken met het uitgenodigde adres), ingelogd met een ander adres, of goed: meedoen.
export default function DoeMee({
  token,
  teamNaam,
  uitgenodigd,
  ingelogdAls,
}: {
  token: string;
  teamNaam: string;
  uitgenodigd: string;
  ingelogdAls: string | null;
}) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const terug = encodeURIComponent(`/doe-mee/${token}`);

  async function doeMee() {
    setBezig(true);
    setFout(null);
    const res = await fetch("/api/team/accepteren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFout(d.error ?? "Er ging iets mis.");
      setBezig(false);
      return;
    }
    router.push("/team");
    router.refresh();
  }

  async function wisselAccount() {
    await createClient().auth.signOut();
    router.push(`/login?volgende=${terug}`);
  }

  const goedAdres = ingelogdAls?.toLowerCase() === uitgenodigd;

  return (
    <>
      <h1 className="text-2xl font-bold">Doe mee met &ldquo;{teamNaam}&rdquo;</h1>
      <p className="text-slate-600">
        Je maakt dan beelden en video&apos;s op de credits van het team, en je ziet elkaars werk. De uitnodiging is voor{" "}
        <strong>{uitgenodigd}</strong>.
      </p>
      {!ingelogdAls ? (
        <div className="space-y-2">
          <a href={`/login?volgende=${terug}`} className="block text-center rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-500">
            Inloggen
          </a>
          <a href="/signup" className="block text-center rounded-xl border border-slate-200 py-3 hover:bg-slate-50">
            Nog geen account? Maak er een met {uitgenodigd}
          </a>
          <p className="text-xs text-slate-500">Na het aanmaken van je account open je deze link opnieuw.</p>
        </div>
      ) : goedAdres ? (
        <button onClick={doeMee} disabled={bezig} className="w-full rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-500 disabled:opacity-50">
          {bezig ? "Bezig…" : "Doe mee met het team"}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
            Je bent ingelogd als {ingelogdAls}. Log in met {uitgenodigd} om mee te doen.
          </p>
          <button onClick={wisselAccount} className="w-full rounded-xl border border-slate-200 py-3 hover:bg-slate-50">
            Inloggen met een ander account
          </button>
        </div>
      )}
      {fout && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{fout}</p>}
    </>
  );
}
