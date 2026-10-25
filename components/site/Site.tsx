import Link from "next/link";
import { DOELGROEP_IDS, DOELGROEPEN, PAKKETTEN, VIDEO_BASIS, type Doelgroep } from "@/lib/site/inhoud";
import { Lus, ProcesVideo, Vragen, Voorbeeld } from "./VideoSpeler";

// De bouwstenen van animideo.com. De site draait in dezelfde app als ai.animideo.com; op
// animideo.com zet de middleware de paden om naar /site/…. Links naar de app zijn daarom
// altijd volledig (met het app-adres), anders blijven ze op animideo.com hangen.

export const APP = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.animideo.com").replace(/\/$/, "");

/** De aanmeldlink voor de gratis week, met de bron erbij voor de advertentiecijfers. */
export function startLink(bron: string, plan?: string) {
  return `${APP}/start?bron=${bron}${plan ? `&plan=${plan}` : ""}`;
}

export function video(naam: string) {
  return `${VIDEO_BASIS}/${naam}`;
}

export function Logo({ licht }: { licht?: boolean }) {
  return (
    <span className={`text-xl font-extrabold tracking-tight ${licht ? "text-white" : "text-slate-900"}`}>
      Animideo<span className="text-blue-500">.</span>
    </span>
  );
}

export function Kop({ bron }: { bron: string }) {
  return (
    <header className="sticky top-0 z-40 bg-[#050b1f]/85 backdrop-blur-md border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" aria-label="Animideo, naar de voorpagina"><Logo licht /></Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          {DOELGROEP_IDS.map((id) => (
            <Link key={id} href={`/${id}`} className="hover:text-white transition">{DOELGROEPEN[id].menu}</Link>
          ))}
          <a href="#prijzen" className="hover:text-white transition">Prijzen</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href={`${APP}/login`} className="hidden sm:inline text-sm text-slate-300 hover:text-white">Inloggen</a>
          <a href={startLink(bron)} className="rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 transition">7 dagen gratis</a>
        </div>
      </div>
    </header>
  );
}

function Vinkjes({ licht }: { licht?: boolean }) {
  const kleur = licht ? "text-slate-300" : "text-slate-600";
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${kleur}`}>
      <li>✓ 7 dagen gratis, 200 credits</li>
      <li>✓ Daarna vanaf €49 per maand</li>
      <li>✓ Maandelijks opzegbaar</li>
    </ul>
  );
}

export function Held({ d }: { d: Pick<Doelgroep, "id" | "bovenkop" | "kop" | "kopAccent" | "sub" | "video" | "poster"> }) {
  const [voor, na] = d.kop.split(d.kopAccent);
  return (
    <section className="relative overflow-hidden bg-[#050b1f] text-white">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(37,99,235,0.35), transparent 70%), radial-gradient(40% 40% at 90% 30%, rgba(147,51,234,0.18), transparent 70%)" }} />
      <div className="relative max-w-6xl mx-auto px-4 pt-14 sm:pt-20 pb-16 sm:pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs sm:text-sm text-blue-200">{d.bovenkop}</p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
            {voor}
            <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-violet-300 bg-clip-text text-transparent">{d.kopAccent}</span>
            {na}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed">{d.sub}</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={startLink(d.id)} className="w-full sm:w-auto rounded-full bg-blue-600 hover:bg-blue-500 px-7 py-4 text-base font-bold shadow-[0_10px_30px_rgba(37,99,235,0.5)] transition">
              Probeer 7 dagen gratis →
            </a>
            <a href="#zo-werkt-het" className="w-full sm:w-auto rounded-full border border-white/20 hover:bg-white/10 px-7 py-4 text-base font-semibold transition">Zo werkt het</a>
          </div>
          <div className="mt-5 flex justify-center"><Vinkjes licht /></div>
        </div>
        <div className="mt-12 sm:mt-16 max-w-5xl mx-auto">
          <ProcesVideo src={video(d.video)} poster={video(d.poster)} />
        </div>
      </div>
    </section>
  );
}

export function Stappen({ d }: { d: Pick<Doelgroep, "stappen"> }) {
  return (
    <section id="zo-werkt-het" className="bg-white py-20 sm:py-28 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <p className="text-sm font-semibold text-blue-600 text-center">Zo werkt het</p>
        <h2 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-slate-900 text-center">Van idee naar video in {d.stappen.length} stappen</h2>
        <div className="mt-14 space-y-16 sm:space-y-24">
          {d.stappen.map((s, i) => (
            <div key={s.titel} className={`grid md:grid-cols-2 gap-8 md:gap-14 items-center ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.35)] bg-slate-100 aspect-video">
                <Lus src={video(s.clip)} className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="grid place-items-center h-10 w-10 rounded-full bg-blue-600 text-white font-bold">{i + 1}</span>
                <h3 className="mt-4 text-2xl sm:text-3xl font-extrabold text-slate-900">{s.titel}</h3>
                <p className="mt-3 text-lg text-slate-600 leading-relaxed">{s.tekst}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Voorbeelden({ d }: { d: Pick<Doelgroep, "voorbeeldenKop" | "voorbeelden"> }) {
  const staand = d.voorbeelden.filter((v) => v.vorm === "staand");
  const liggend = d.voorbeelden.filter((v) => v.vorm === "liggend");
  return (
    <section className="bg-slate-50 py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4">
        <p className="text-sm font-semibold text-blue-600 text-center">Geen beloftes, echte video&apos;s</p>
        <h2 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-slate-900 text-center">{d.voorbeeldenKop}</h2>
        <p className="mt-4 text-center text-slate-600 max-w-2xl mx-auto">Rechtstreeks uit de app, niet nabewerkt. Klik om met geluid te kijken.</p>
        {liggend.length > 0 && (
          <div className={`mt-12 grid gap-6 ${liggend.length > 1 ? "md:grid-cols-2" : "max-w-3xl mx-auto"}`}>
            {liggend.map((v) => <Voorbeeld key={v.url} src={v.url} titel={v.titel} staand={false} />)}
          </div>
        )}
        {staand.length > 0 && (
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto">
            {staand.map((v) => <Voorbeeld key={v.url} src={v.url} titel={v.titel} staand />)}
          </div>
        )}
      </div>
    </section>
  );
}

export function Prijzen({ d, bron }: { d?: Pick<Doelgroep, "rekensommen" | "advies" | "adviesReden">; bron: string }) {
  const advies = d?.advies ?? "pro";
  return (
    <section id="prijzen" className="bg-white py-20 sm:py-28 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <p className="text-sm font-semibold text-blue-600 text-center">Wat kost het, en wat krijg je</p>
        <h2 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-slate-900 text-center">Begin met een gratis week</h2>
        <p className="mt-4 text-center text-slate-600 max-w-2xl mx-auto">
          Kies je pakket, krijg 200 credits en probeer alles 7 dagen. Pas daarna betaal je, en opzeggen kan per maand.
        </p>

        {d && (
          <div className="mt-12 max-w-3xl mx-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <p className="font-bold text-slate-900">Zo ver kom je met je credits</p>
            <ul className="mt-3 divide-y divide-slate-200">
              {d.rekensommen.map((r) => (
                <li key={r.wat} className="flex items-center justify-between gap-4 py-2.5 text-sm sm:text-base">
                  <span className="text-slate-700">{r.wat}</span>
                  <span className="shrink-0 font-semibold text-slate-900">± {r.credits} credits</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-500">Script schrijven en de Regisseur om advies vragen zijn altijd gratis. Bij elke knop zie je vooraf wat het kost.</p>
          </div>
        )}

        <div className="mt-10 grid md:grid-cols-3 gap-5 items-stretch">
          {PAKKETTEN.map((p) => {
            const uit = p.id === advies;
            const voorbeeld = d?.rekensommen[0];
            return (
              <div key={p.id} className={`relative rounded-3xl p-6 sm:p-7 flex flex-col ${uit ? "bg-[#050b1f] text-white ring-2 ring-blue-500 shadow-[0_25px_60px_-20px_rgba(37,99,235,0.6)]" : "bg-white ring-1 ring-slate-200"}`}>
                {uit && <span className="absolute -top-3 left-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">Aanrader</span>}
                <p className={`font-bold ${uit ? "text-blue-300" : "text-blue-600"}`}>{p.naam}</p>
                <p className="mt-2"><span className="text-4xl font-black">€{p.prijs}</span><span className={uit ? "text-slate-300" : "text-slate-500"}>/maand</span></p>
                <p className={`text-sm ${uit ? "text-slate-300" : "text-slate-500"}`}>{p.credits.toLocaleString("nl-NL")} credits per maand</p>
                {voorbeeld && (
                  <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${uit ? "bg-white/10 text-white" : "bg-blue-50 text-blue-900"}`}>
                    ≈ {Math.floor(p.credits / voorbeeld.credits)}× {voorbeeld.wat.split(" (")[0].replace(/^([A-Z])([a-z])/, (_, a: string, b: string) => a.toLowerCase() + b)} per maand
                  </p>
                )}
                <ul className={`mt-5 space-y-2 text-sm flex-1 ${uit ? "text-slate-200" : "text-slate-600"}`}>
                  {p.punten.map((x) => <li key={x} className="flex gap-2"><span className="text-blue-500">✓</span>{x}</li>)}
                </ul>
                <a href={startLink(bron, p.id)} className={`mt-6 rounded-full py-3 text-center font-bold transition ${uit ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-900 hover:bg-slate-700 text-white"}`}>
                  Start gratis met {p.naam}
                </a>
                <p className={`mt-2 text-center text-xs ${uit ? "text-slate-400" : "text-slate-500"}`}>7 dagen gratis, daarna €{p.prijs}/m</p>
              </div>
            );
          })}
        </div>
        {d?.adviesReden && <p className="mt-6 text-center text-slate-600 max-w-2xl mx-auto">{d.adviesReden}</p>}
      </div>
    </section>
  );
}

export function Support() {
  const punten = [
    { icoon: "💬", titel: "Echte mensen, in het Nederlands", tekst: "Loop je vast? Stuur een bericht via de app of mail, met Pro en Agency ook via WhatsApp." },
    { icoon: "🎓", titel: "Academy met 25 videolessen", tekst: "Van je eerste beeld tot een complete reclame, in korte lessen met een opdracht erbij." },
    { icoon: "🇳🇱", titel: "Gemaakt in Nederland", tekst: "Nederlandse stemmen, Nederlandse teksten, betalen met iDEAL en facturen met btw." },
  ];
  return (
    <section className="bg-[#050b1f] text-white py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-center">Je staat er niet alleen voor</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {punten.map((p) => (
            <div key={p.titel} className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
              <div className="text-3xl">{p.icoon}</div>
              <p className="mt-3 text-lg font-bold">{p.titel}</p>
              <p className="mt-2 text-slate-300 leading-relaxed">{p.tekst}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VragenBlok({ vragen }: { vragen: { v: string; a: string }[] }) {
  return (
    <section className="bg-slate-50 py-20 sm:py-28">
      <div className="max-w-3xl mx-auto px-4">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 text-center">Veelgestelde vragen</h2>
        <div className="mt-10"><Vragen vragen={vragen} /></div>
      </div>
    </section>
  );
}

export function Slot({ bron, kop = "Probeer het zelf, 7 dagen gratis" }: { bron: string; kop?: string }) {
  return (
    <section className="relative overflow-hidden bg-blue-600 text-white py-20 sm:py-24">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(50% 80% at 50% 0%, rgba(255,255,255,0.25), transparent 70%)" }} />
      <div className="relative max-w-3xl mx-auto px-4 text-center">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight">{kop}</h2>
        <p className="mt-4 text-blue-100 text-lg">200 credits om mee te maken. Opzeggen in de proefweek kost niets.</p>
        <a href={startLink(bron)} className="mt-8 inline-block rounded-full bg-white text-blue-700 hover:bg-blue-50 px-8 py-4 text-lg font-bold shadow-xl transition">Start mijn gratis week →</a>
      </div>
    </section>
  );
}

export function Voet() {
  return (
    <footer className="bg-[#050b1f] text-slate-400 text-sm">
      <div className="max-w-6xl mx-auto px-4 py-12 grid sm:grid-cols-3 gap-8">
        <div>
          <Logo licht />
          <p className="mt-3">De Nederlandse AI-video-app.</p>
          <p className="mt-1">Powered by JouwAnimatieVideo</p>
        </div>
        <div className="flex flex-col gap-2">
          {DOELGROEP_IDS.map((id) => <Link key={id} href={`/${id}`} className="hover:text-white">{DOELGROEPEN[id].menu}</Link>)}
        </div>
        <div className="flex flex-col gap-2">
          <a href={`${APP}/login`} className="hover:text-white">Inloggen</a>
          <a href={`${APP}/algemene-voorwaarden`} className="hover:text-white">Algemene voorwaarden</a>
          <a href={`${APP}/privacybeleid`} className="hover:text-white">Privacybeleid</a>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs">© {new Date().getFullYear()} Animideo · Betalingen en facturen via JouwAnimatieVideo</div>
    </footer>
  );
}
