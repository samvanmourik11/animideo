"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeamOverzicht } from "@/lib/team/types";

// De teampagina. Drie gevallen: nog geen team (aanmaken, of uitleg dat het vanaf Pro
// kan), eigenaar (collega's uitnodigen, verbruik zien) en lid (wie zit erin, verlaten).

const PLAN: Record<string, string> = { free: "Gratis", starter: "Starter", pro: "Pro", agency: "Agency" };

async function vraag(pad: string, init?: RequestInit): Promise<TeamOverzicht & { link?: string; gemaild?: boolean }> {
  const res = await fetch(pad, { ...init, headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data;
}

export default function TeamBeheer() {
  const [o, setO] = useState<TeamOverzicht | null>(null);
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  useEffect(() => {
    vraag("/api/team").then(setO).catch((e) => setFout(e.message));
  }, []);

  async function doe(actie: () => Promise<TeamOverzicht & { link?: string; gemaild?: boolean }>, klaar?: (d: { gemaild?: boolean }) => string) {
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const d = await actie();
      setO(d);
      if (klaar) setMelding(klaar(d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  function kopieer(link: string) {
    navigator.clipboard.writeText(link);
    setGekopieerd(link);
    setTimeout(() => setGekopieerd(null), 1500);
  }

  if (!o) return <p className="text-sm text-tekst-3">{fout ?? "Laden…"}</p>;

  const kop = (
    <div>
      <h1 className="text-3xl font-extrabold text-tekst tracking-tight">👥 Team</h1>
      <p className="text-tekst-3 mt-1">Werk samen met je collega&apos;s: één pot credits, en je ziet elkaars werk in de bibliotheek.</p>
    </div>
  );
  const meldingen = (
    <>
      {fout && <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">{fout}</p>}
      {melding && <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-xl px-3 py-2">{melding}</p>}
    </>
  );

  // ── Nog geen team ──
  if (!o.team) {
    return (
      <div className="max-w-2xl space-y-6">
        {kop}
        {o.plaatsen > 0 ? (
          <div className="n-kaart space-y-3">
            <h2 className="font-bold text-tekst">Maak je team aan</h2>
            <p className="text-sm text-tekst-2">
              Met {PLAN[o.plan] ?? o.plan} nodig je tot {o.plaatsen} collega&apos;s uit. Zij maken op jouw credits; jij ziet wie hoeveel gebruikt.
            </p>
            <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam van je team, bijv. Marketing Bakkerij Jansen" className="n-invoer" />
            <button
              onClick={() => doe(() => vraag("/api/team", { method: "POST", body: JSON.stringify({ naam }) }), () => "Je team is aangemaakt.")}
              disabled={bezig}
              className="btn-primary disabled:opacity-50"
            >
              Team aanmaken
            </button>
          </div>
        ) : (
          <div className="n-kaart space-y-2">
            <h2 className="font-bold text-tekst">Samenwerken kan vanaf Pro</h2>
            <p className="text-sm text-tekst-2">Met Pro nodig je 3 collega&apos;s uit, met Agency 10. Allemaal op één pot credits.</p>
            <Link href="/pricing" className="btn-primary inline-block">Bekijk de abonnementen</Link>
            <p className="text-xs text-tekst-3 pt-2">Uitgenodigd door een collega? Open de link uit de uitnodigingsmail.</p>
          </div>
        )}
        {meldingen}
      </div>
    );
  }

  const eigenaar = o.rol === "eigenaar";
  const collegas = o.leden.length - 1;
  const vrij = o.plaatsen - collegas - o.uitnodigingen.length;
  const totaal = o.leden.reduce((s, l) => s + l.verbruik, 0);

  return (
    <div className="max-w-3xl space-y-6">
      {kop}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="n-kaart">
          <div className="text-xs text-tekst-3">Team</div>
          <div className="font-bold text-tekst mt-1">{o.team.naam}</div>
        </div>
        <div className="n-kaart">
          <div className="text-xs text-tekst-3">Gedeelde pot</div>
          <div className="font-bold text-tekst mt-1">⚡ {o.saldo} credits</div>
        </div>
        <div className="n-kaart">
          <div className="text-xs text-tekst-3">Deze maand verbruikt</div>
          <div className="font-bold text-tekst mt-1">{totaal} credits</div>
        </div>
      </div>

      <div className="n-kaart space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-tekst">Wie zit erin</h2>
          <span className="text-xs text-tekst-3">{collegas} van {o.plaatsen} collega&apos;s ({PLAN[o.plan] ?? o.plan})</span>
        </div>
        <div className="divide-y divide-rand">
          {o.leden.map((l) => (
            <div key={l.user_id} className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 flex items-center justify-center text-sm font-bold">
                {(l.naam || l.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-tekst truncate">{l.naam || l.email}</div>
                <div className="text-xs text-tekst-3">{l.rol === "eigenaar" ? "Eigenaar" : "Collega"} · {l.verbruik} credits deze maand</div>
              </div>
              {eigenaar && l.rol !== "eigenaar" && (
                <button
                  onClick={() => {
                    if (!confirm(`${l.email ?? "Deze collega"} uit het team halen? Het gemaakte werk blijft van hem of haar.`)) return;
                    doe(() => vraag(`/api/team/leden/${l.user_id}`, { method: "DELETE" }), () => "Collega is uit het team gehaald.");
                  }}
                  className="text-xs text-red-500 hover:text-red-400"
                >
                  Weghalen
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {eigenaar && (
        <div className="n-kaart space-y-3">
          <h2 className="font-bold text-tekst">Collega uitnodigen</h2>
          {vrij > 0 ? (
            <div className="flex gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="collega@bedrijf.nl"
                className="n-invoer flex-1"
              />
              <button
                onClick={() =>
                  doe(
                    () => vraag("/api/team/uitnodigen", { method: "POST", body: JSON.stringify({ email }) }),
                    (d) => {
                      setEmail("");
                      return d.gemaild
                        ? "Uitnodiging verstuurd. Je kunt de link hieronder ook zelf doorsturen."
                        : "De mail kon niet worden verstuurd. Stuur de link hieronder zelf door.";
                    },
                  )
                }
                disabled={bezig || !email.trim()}
                className="btn-primary shrink-0 disabled:opacity-50"
              >
                Uitnodigen
              </button>
            </div>
          ) : (
            <p className="text-sm text-tekst-2">
              Je team zit vol.{" "}
              {o.plan !== "agency" && (
                <>
                  Met <Link href="/pricing" className="underline">Agency</Link> nodig je tot 10 collega&apos;s uit.
                </>
              )}
            </p>
          )}
          {o.uitnodigingen.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-tekst-3 uppercase tracking-wide">Wacht op antwoord</div>
              {o.uitnodigingen.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-rand px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-tekst truncate">{u.email}</div>
                    <div className="text-xs text-tekst-3">
                      Geldig tot {new Date(u.verloopt_op).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}
                    </div>
                  </div>
                  <button onClick={() => kopieer(u.link)} className="text-xs text-blue-500 hover:text-blue-400">
                    {gekopieerd === u.link ? "Gekopieerd ✓" : "Kopieer link"}
                  </button>
                  <button
                    onClick={() => doe(() => vraag(`/api/team/uitnodigingen/${u.id}`, { method: "DELETE" }))}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Intrekken
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {meldingen}

      <div className="text-xs text-tekst-3 space-y-1">
        <p>Alles wat collega&apos;s in de nieuwe app maken (beeld, video, effecten, apps, reclames) gaat van de gedeelde pot af. In de oude Studio&apos;s gebruikt ieder nog zijn eigen credits.</p>
        {eigenaar ? (
          <button
            onClick={() => {
              if (!confirm("Team opheffen? Iedereen gaat terug naar zijn eigen credits. Het gemaakte werk blijft van wie het maakte.")) return;
              doe(() => vraag("/api/team", { method: "DELETE" }), () => "Het team is opgeheven.");
            }}
            className="text-red-500 hover:text-red-400"
          >
            Team opheffen
          </button>
        ) : (
          <button
            onClick={() => {
              if (!confirm("Team verlaten? Je maakt daarna weer op je eigen credits.")) return;
              doe(() => vraag("/api/team/leden/ik", { method: "DELETE" }), () => "Je hebt het team verlaten.");
            }}
            className="text-red-500 hover:text-red-400"
          >
            Team verlaten
          </button>
        )}
      </div>
    </div>
  );
}
