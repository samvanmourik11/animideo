"use client";

import Link from "next/link";

interface Props {
  credits: number;
  required: number;
  onClose: () => void;
}

export default function InsufficientCreditsModal({ credits, required, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0c1428] border border-white/[0.08] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-8 max-w-sm w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">💸</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Credits op!</h2>
          <p className="text-slate-400 text-sm">
            Je hebt <strong className="text-white">{credits}</strong> credit{credits !== 1 ? "s" : ""} over, maar
            deze actie kost <strong className="text-white">{required}</strong> credit{required !== 1 ? "s" : ""}.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/pricing"
            className="block w-full text-center btn-primary py-3"
          >
            Upgrade nu →
          </Link>
          <button
            onClick={onClose}
            className="block w-full text-center text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
