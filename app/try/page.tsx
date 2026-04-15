"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const LANGUAGES = [
  "Dutch", "English", "Spanish", "French", "German",
  "Portuguese", "Italian", "Japanese", "Chinese",
];

const VISUAL_STYLES = [
  "Flat Illustration", "3D Render", "Realistic", "Whiteboard", "Cinematic",
];

const STEPS = ["Project instellen", "Script", "Afbeeldingen", "Motion", "Voice-over", "Muziek", "Editor"];

function SignupModal({ idea, onClose }: { idea: string; onClose: () => void }) {
  const url = `/signup?idea=${encodeURIComponent(idea)}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Card */}
      <div className="relative w-full max-w-sm bg-[#0c1428] border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.7)] p-7 text-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
          <svg width="24" height="24" fill="none" stroke="#60a5fa" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <path strokeLinecap="round" d="M12 6v6l4 2"/>
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Je hebt 0 credits</h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          Maak een gratis account aan en krijg{" "}
          <span className="text-white font-semibold">100 credits direct</span>.
          Genoeg om meerdere volledige video&apos;s te maken.
        </p>

        {/* Credits visual */}
        <div className="flex items-center justify-center gap-3 bg-[#060d1f] border border-white/[0.06] rounded-xl px-5 py-3 mb-6">
          <div className="text-left">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Na aanmelden</p>
            <p className="text-2xl font-black text-white">100 <span className="text-base font-semibold text-blue-400">credits</span></p>
          </div>
          <div className="w-px h-10 bg-white/[0.06]" />
          <div className="text-left">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Kosten script</p>
            <p className="text-2xl font-black text-white">1 <span className="text-base font-semibold text-slate-400">credit</span></p>
          </div>
        </div>

        <Link
          href={url}
          className="block w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3 rounded-xl text-sm shadow-[0_0_24px_rgba(59,130,246,0.35)] transition-all mb-3"
        >
          Gratis account aanmaken →
        </Link>
        <button
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Terug naar het formulier
        </button>
      </div>
    </div>
  );
}

function TryPage() {
  const searchParams = useSearchParams();
  const rawIdea = searchParams.get("idea") ?? "";

  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState(rawIdea);
  const [targetAudience, setTargetAudience] = useState("");
  const [language, setLanguage] = useState("Dutch");
  const [format, setFormat] = useState("16:9");
  const [visualStyle, setVisualStyle] = useState("Flat Illustration");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  function handleGenerate() {
    if (!title || !goal || !targetAudience) {
      setError("Vul Titel, Doel en Doelgroep in om verder te gaan.");
      return;
    }
    setError("");
    setShowModal(true);
  }

  const currentIdea = goal || rawIdea;

  return (
    <>
      {showModal && (
        <SignupModal idea={currentIdea} onClose={() => setShowModal(false)} />
      )}

      <div className="min-h-screen bg-[#060d1f]">
      {/* Nav */}
      <header className="border-b border-white/[0.07] bg-[#060d1f]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
            Animideo
          </Link>
          <div className="flex items-center gap-3">
            {/* Fake 0-credits badge */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer bg-slate-500/10 text-slate-400 border border-slate-500/20"
              title="Maak een account aan voor 100 gratis credits"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>0 credits</span>
            </div>
            <Link
              href="/login"
              className="text-sm text-slate-500 hover:text-slate-200 transition-colors"
            >
              Inloggen
            </Link>
            <Link
              href={`/signup?idea=${encodeURIComponent(currentIdea)}`}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              Aanmelden
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="mb-8 overflow-x-auto">
          <nav className="flex items-center gap-0">
            {STEPS.map((label, i) => {
              const active = i === 0;
              const locked = i > 0;
              return (
                <button
                  key={label}
                  disabled
                  className={`flex items-center gap-2 py-2 px-3 text-sm font-medium whitespace-nowrap cursor-default
                    ${active ? "text-blue-400" : "text-slate-600"}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                      ${active
                        ? "bg-blue-500/20 border-2 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.4)]"
                        : "border-2 border-white/10 text-slate-600"
                      }`}
                  >
                    {i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                  {i < STEPS.length - 1 && (
                    <span className={`ml-2 select-none ${locked ? "text-slate-800" : "text-slate-700"}`}>›</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Step 1 form */}
        <div className="max-w-2xl mx-auto">
          {/* Demo banner */}
          <div className="mb-6 flex items-center gap-3 bg-blue-500/5 border border-blue-500/15 rounded-2xl px-5 py-3">
            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-sm">✨</span>
            </div>
            <p className="text-sm text-slate-300">
              Je bekijkt een <span className="text-white font-semibold">demo</span>.{" "}
              <Link href={`/signup?idea=${encodeURIComponent(currentIdea)}`} className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2">
                Maak gratis een account aan
              </Link>{" "}
              om je video echt te genereren — 100 credits cadeau.
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Project instellen</h2>
            <p className="text-slate-500 mt-1 text-sm">
              Vul de details in. GPT-4 genereert automatisch een scene-voor-scene script.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label">Video titel</label>
              <input
                className="input"
                placeholder="bijv. Hoe ons product werkt"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Doel / idee</label>
              <input
                className="input"
                placeholder="bijv. Leg onze SaaS onboarding uit aan nieuwe gebruikers"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Doelgroep</label>
              <input
                className="input"
                placeholder="bijv. Kleine ondernemers van 30-50 jaar"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Taal</label>
                <select
                  className="input"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Verhouding</label>
                <select
                  className="input"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="16:9">16:9 — Landscape</option>
                  <option value="9:16">9:16 — Portrait</option>
                </select>
              </div>
              <div>
                <label className="label">Stijl</label>
                <select
                  className="input"
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                >
                  {VISUAL_STYLES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="mt-8">
            <button
              className="btn-primary px-8 py-3 text-base"
              onClick={handleGenerate}
            >
              Genereer script →
            </button>
          </div>
        </div>
      </main>
      </div>
    </>
  );
}

export default function TryPageWrapper() {
  return (
    <Suspense>
      <TryPage />
    </Suspense>
  );
}
