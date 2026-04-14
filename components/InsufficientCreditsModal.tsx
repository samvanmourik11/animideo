"use client";

import Link from "next/link";

interface Props {
  credits: number;
  required: number;
  onClose: () => void;
}

export default function InsufficientCreditsModal({ credits, required, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">💸</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Je credits zijn op!</h2>
          <p className="text-gray-500 text-sm">
            Je hebt <strong>{credits}</strong> credit{credits !== 1 ? "s" : ""} over, maar
            deze actie kost <strong>{required}</strong> credit{required !== 1 ? "s" : ""}.
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/pricing"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            Upgrade nu →
          </Link>
          <button
            onClick={onClose}
            className="block w-full text-center text-gray-500 hover:text-gray-700 text-sm py-2 transition-colors"
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
