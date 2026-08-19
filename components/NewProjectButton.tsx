"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { canUseStudio, isAdminAccount } from "@/lib/studio/access";

type Tool =
  | "studio" | "story" | "infographics" | "explainer"
  | "dialogue" | "wizard" | "photo" | "free" | "t2v" | "playground";

export default function NewProjectButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Tijdens soft-launch is de Creator Studio alleen zichtbaar voor toegestane
  // account(s). De server-pagina's blokkeren bovendien directe toegang.
  const [studioAllowed, setStudioAllowed] = useState(false);
  // De tools die uit het menu zijn gehaald (AI Wizard, foto's, upload, T2V,
  // playground) plus de dialoogmodus staan alleen voor interne accounts aan.
  const [adminAllowed, setAdminAllowed] = useState(false);
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setStudioAllowed(canUseStudio(data.user?.email));
      setAdminAllowed(isAdminAccount(data.user?.email));
    });
  }, []);
  const [loading, setLoading] = useState<Tool | null>(null);
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

  function goTo(tool: Tool, path: string) {
    setLoading(tool);
    setOpen(false);
    router.push(path);
  }

  function openStudio() {
    // ?new=1 = expliciet een nieuw project starten (wist het lopende concept).
    goTo("studio", "/studio/new?new=1");
  }

  function openStorytelling() { goTo("story", "/infographics/story"); }
  function openInfographics() { goTo("infographics", "/infographics/new"); }
  function openExplainer()    { goTo("explainer", "/explainer/new"); }
  function openDialogue()     { goTo("dialogue", "/infographics/dialogue"); }
  function openPlayground()   { goTo("playground", "/playground"); }

  /** Maakt een projectrij aan en gaat naar de bijbehorende pagina. */
  async function createProject(
    tool: Tool,
    velden: Record<string, unknown>,
    pad: (id: string) => string
  ) {
    setLoading(tool);
    setOpen(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: "Untitled Project",
        language: "Dutch",
        format: "16:9",
        visual_style: "Cinematic",
        status: "Draft",
        ...velden,
      })
      .select()
      .single();

    if (!error && data) {
      router.push(pad(data.id));
    } else {
      alert("Kon project niet aanmaken: " + error?.message);
      setLoading(null);
    }
  }

  const createWizard = () =>
    createProject("wizard", { language: "English", mode: "wizard" }, (id) => `/project/${id}`);

  const createPhoto = () =>
    createProject("photo", { visual_style: "2D Cartoon", mode: "photo" }, (id) => `/project/${id}`);

  const createT2V = () =>
    createProject("t2v", { mode: "t2v", video_model: "seedance-lite-t2v" }, (id) => `/project/${id}/t2v`);

  const createFree = () => {
    const vandaag = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
    return createProject("free", { title: `Eigen video — ${vandaag}`, mode: "free" }, (id) => `/project/${id}/free`);
  };

  const busy = loading !== null;
  const scheiding = <div className="h-px bg-white/[0.06] mx-3" />;

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
        <div className="absolute right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto bg-[#0c1428] border border-white/[0.09] rounded-xl shadow-2xl z-50">
          {/* Creator Studio blijft open voor alle huidige gebruikers. */}
          <button
            onClick={openStudio}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left bg-gradient-to-r from-cyan-500/10 to-transparent"
          >
            <span className="text-lg leading-none mt-0.5">🎬</span>
            <div>
              <p className="text-sm font-medium text-white">
                Creator Studio
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Karakter en stijl consistent door alle scenes</p>
            </div>
          </button>
          {scheiding}
          <button
            onClick={openStorytelling}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left bg-gradient-to-r from-violet-500/10 to-transparent"
          >
            <span className="text-lg leading-none mt-0.5">📖</span>
            <div>
              <p className="text-sm font-medium text-white">Storytelling-infographic</p>
              <p className="text-xs text-slate-500 mt-0.5">AI-verhaalvideo uit tekst of PDF, met voice-over</p>
            </div>
          </button>
          {studioAllowed && (
            <>
              {scheiding}
              <button
                onClick={openInfographics}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-lg leading-none mt-0.5">📊</span>
                <div>
                  <p className="text-sm font-medium text-white">Infographic</p>
                  <p className="text-xs text-slate-500 mt-0.5">Zakelijk: data, cijfers en grafieken, geen poppetjes</p>
                </div>
              </button>
              {scheiding}
              <button
                onClick={openExplainer}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left bg-gradient-to-r from-amber-500/10 to-transparent"
              >
                <span className="text-lg leading-none mt-0.5">🎞️</span>
                <div>
                  <p className="text-sm font-medium text-white">Explainer-video</p>
                  <p className="text-xs text-slate-500 mt-0.5">Flat animated uitleg-video met voice-over, geen poppetjes</p>
                </div>
              </button>
            </>
          )}

          {/* Alleen intern: de tools die uit het klantmenu zijn gehaald. */}
          {adminAllowed && (
            <>
              <div className="px-4 pt-3 pb-1.5 mt-1 border-t border-white/[0.09]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Alleen voor jou
                </p>
              </div>
              <button
                onClick={openDialogue}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left bg-gradient-to-r from-emerald-500/10 to-transparent"
              >
                <span className="text-lg leading-none mt-0.5">💬</span>
                <div>
                  <p className="text-sm font-medium text-white">Dialoogmodus <span className="text-[10px] text-emerald-400/80 align-middle">bèta</span></p>
                  <p className="text-xs text-slate-500 mt-0.5">Pratende personages met lip-sync</p>
                </div>
              </button>
              {scheiding}
              <button
                onClick={createPhoto}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-lg leading-none mt-0.5">📸</span>
                <div>
                  <p className="text-sm font-medium text-white">Animeer je foto&apos;s</p>
                  <p className="text-xs text-slate-500 mt-0.5">Echte foto&apos;s omzetten naar animatie</p>
                </div>
              </button>
              {scheiding}
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
              {scheiding}
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
              {scheiding}
              <button
                onClick={createT2V}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-lg leading-none mt-0.5">⚡</span>
                <div>
                  <p className="text-sm font-medium text-white">Text to Video</p>
                  <p className="text-xs text-slate-500 mt-0.5">Direct video van tekst, geen afbeeldingen</p>
                </div>
              </button>
              {scheiding}
              <button
                onClick={openPlayground}
                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-lg leading-none mt-0.5">🎨</span>
                <div>
                  <p className="text-sm font-medium text-white">Playground</p>
                  <p className="text-xs text-slate-500 mt-0.5">Vrij spelen met beelden, geen vaste volgorde</p>
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
