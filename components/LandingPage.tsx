"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Leg uit hoe ons boekhoudprogramma werkt voor kleine bedrijven",
  "Promoot onze nieuwe sportschool in Amsterdam voor jongeren",
  "Uitleg video over hoe zonnepanelen werken voor huiseigenaren",
  "Introductievideo voor ons restaurant voor nieuwe klanten",
];

const STEPS = [
  { icon: "✍️", title: "Beschrijf je idee", desc: "Typ in één zin waar je video over moet gaan." },
  { icon: "🤖", title: "AI doet de rest", desc: "Script, afbeeldingen en video worden automatisch gegenereerd." },
  { icon: "⬇️", title: "Download & deel", desc: "Exporteer je video en deel hem direct op elk platform." },
];

export default function LandingPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleExample(text: string) {
    setIdea(text);
    textareaRef.current?.focus();
  }

  async function handleSubmit() {
    if (!idea.trim()) return;
    setLoading(true);
    localStorage.setItem("pending_idea", idea.trim());
    router.push("/signup");
  }

  return (
    <div className="min-h-screen" style={{ background: "#060d1f" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
          Animideo
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2">
            Inloggen
          </Link>
          <Link href="/signup" className="btn-primary text-sm px-4 py-2">
            Gratis beginnen →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Geen video-ervaring nodig
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight mb-5">
          Maak professionele
          <span className="bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent"> animatievideo's</span>
          <br />in minuten
        </h1>

        <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
          Typ je idee. AI schrijft het script, genereert de beelden en monteert de video automatisch.
        </p>

        {/* Idea input bar */}
        <div className="relative bg-[#0c1428] border border-white/10 rounded-2xl shadow-[0_0_60px_rgba(59,130,246,0.1)] overflow-hidden">
          <textarea
            ref={textareaRef}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Beschrijf je video-idee… bijv. 'Leg uit hoe ons product werkt voor nieuwe klanten'"
            rows={3}
            className="w-full bg-transparent text-white placeholder-slate-500 text-base px-6 pt-5 pb-4 resize-none outline-none"
          />
          <div className="flex items-center justify-between px-4 pb-4 gap-3">
            <div className="flex gap-2 flex-wrap">
              {EXAMPLES.slice(0, 2).map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExample(ex)}
                  className="text-xs text-slate-500 hover:text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full transition-all truncate max-w-[200px]"
                >
                  {ex}
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!idea.trim() || loading}
              className="btn-primary shrink-0 px-6 py-2.5 text-sm disabled:opacity-40"
            >
              {loading ? "Bezig…" : "Maak mijn video →"}
            </button>
          </div>
        </div>

        {/* More examples */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {EXAMPLES.slice(2).map((ex) => (
            <button
              key={ex}
              onClick={() => handleExample(ex)}
              className="text-xs text-slate-500 hover:text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Hoe het werkt</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <div key={i} className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6 text-center">
              <div className="text-3xl mb-3">{s.icon}</div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</span>
                <h3 className="font-semibold text-white text-sm">{s.title}</h3>
              </div>
              <p className="text-slate-500 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Alles wat je nodig hebt</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { icon: "📝", title: "AI Script", desc: "GPT-4 schrijft automatisch een professioneel script" },
            { icon: "🎨", title: "AI Afbeeldingen", desc: "DALL-E 3 genereert unieke visuals per scene" },
            { icon: "🎬", title: "AI Beweging", desc: "Runway geeft elke scene vloeiende videomotion" },
            { icon: "🎙️", title: "Voice-over", desc: "Realistische AI-stemmen in meerdere talen" },
            { icon: "✂️", title: "Video Editor", desc: "Timeline editor met transitions en muziek" },
            { icon: "💧", title: "Geen watermark", desc: "Professionele exports zonder branding (betaald)" },
          ].map((f) => (
            <div key={f.title} className="bg-[#0c1428] border border-white/[0.07] rounded-xl p-4">
              <div className="text-xl mb-2">{f.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-white/[0.06]">
        <h2 className="text-2xl font-bold text-white text-center mb-2">Kies jouw plan</h2>
        <p className="text-slate-500 text-center text-sm mb-10">Begin gratis. Upgrade wanneer je wilt.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { name: "Gratis", price: "€0", credits: "100 credits/maand", features: ["Script genereren", "Afbeeldingen genereren", "Video beweging", "Watermark op exports"], cta: "Begin gratis", href: "/signup", highlight: false },
            { name: "Starter", price: "€49", period: "/maand", credits: "500 credits/maand", features: ["Script genereren", "Afbeeldingen genereren", "Video beweging", "Geen watermark", "Email support"], cta: "Probeer Starter", href: "/signup", highlight: false },
            { name: "Pro", price: "€99", period: "/maand", credits: "1.500 credits/maand", badge: "MEEST GEKOZEN", features: ["Script genereren", "Afbeeldingen genereren", "Video beweging", "Geen watermark", "HD exports", "Prioriteit support"], cta: "Probeer Pro", href: "/signup", highlight: true },
            { name: "Agency", price: "€249", period: "/maand", credits: "5.000 credits/maand", features: ["Script genereren", "Afbeeldingen genereren", "Video beweging", "Geen watermark", "4K exports", "Dedicated support"], cta: "Probeer Agency", href: "/signup", highlight: false },
          ].map((plan) => (
            <div key={plan.name} className={`relative flex flex-col rounded-2xl border p-6 ${plan.highlight ? "bg-gradient-to-b from-blue-600/10 to-blue-500/5 border-blue-500/40 shadow-[0_0_40px_rgba(59,130,246,0.15)]" : "bg-[#0c1428] border-white/[0.07]"}`}>
              {"badge" in plan && plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-[0_0_12px_rgba(59,130,246,0.5)]">
                    {plan.badge}
                  </span>
                </div>
              )}
              <h3 className="text-base font-bold text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                {"period" in plan && <span className="text-slate-500 text-sm">{plan.period}</span>}
              </div>
              <p className="text-xs font-semibold text-blue-400 mb-4">{plan.credits}</p>
              <ul className="flex-1 space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="text-blue-400 shrink-0">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-center transition-all ${plan.highlight ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]" : "bg-white/10 hover:bg-white/15 text-white border border-white/10"}`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center border-t border-white/[0.06]">
        <h2 className="text-3xl font-extrabold text-white mb-4">
          Klaar om je eerste video te maken?
        </h2>
        <p className="text-slate-400 mb-8">Gratis beginnen. Geen creditcard nodig.</p>
        <Link href="/signup" className="btn-primary px-8 py-3 text-base">
          Begin gratis →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 text-center text-slate-600 text-sm">
        © 2026 Animideo · <Link href="/login" className="hover:text-slate-400">Inloggen</Link> · <Link href="/pricing" className="hover:text-slate-400">Prijzen</Link>
      </footer>
    </div>
  );
}
