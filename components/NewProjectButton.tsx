"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewProjectButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"wizard" | "free" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Sluit dropdown bij klik buiten het component
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function createWizard() {
    setLoading("wizard");
    setOpen(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: "Untitled Project",
        language: "English",
        format: "16:9",
        visual_style: "Cinematic",
        status: "Draft",
        mode: "wizard",
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/project/${data.id}`);
    } else {
      alert("Kon project niet aanmaken: " + error?.message);
      setLoading(null);
    }
  }

  async function createFree() {
    setLoading("free");
    setOpen(false);
    const supabase = createClient();
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: `Eigen video — ${today}`,
        language: "Dutch",
        format: "16:9",
        visual_style: "Cinematic",
        status: "Draft",
        mode: "free",
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/project/${data.id}/free`);
    } else {
      alert("Kon project niet aanmaken: " + error?.message);
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !busy && setOpen((o) => !o)}
        disabled={busy}
        className="btn-primary text-sm flex items-center gap-2"
      >
        {loading ? "Aanmaken…" : "+ Nieuw project"}
        {!busy && (
          <svg
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-[#0c1428] border border-white/[0.09] rounded-xl shadow-2xl z-50 overflow-hidden">
          <button
            onClick={createWizard}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
          >
            <span className="text-lg leading-none mt-0.5">✨</span>
            <div>
              <p className="text-sm font-medium text-white">AI Wizard</p>
              <p className="text-xs text-slate-500 mt-0.5">Script en afbeeldingen via AI</p>
            </div>
          </button>
          <div className="h-px bg-white/[0.06] mx-3" />
          <button
            onClick={createFree}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
          >
            <span className="text-lg leading-none mt-0.5">🖼️</span>
            <div>
              <p className="text-sm font-medium text-white">Upload eigen afbeeldingen</p>
              <p className="text-xs text-slate-500 mt-0.5">Eigen foto&apos;s omzetten naar video</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
