"use client";

import { useEffect, useRef, useState } from "react";
import { ICON_NAMES, ExIcon } from "./icons";

// Visuele icoon-kiezer: toont de echte iconen in een raster i.p.v. een tekst-dropdown.
export default function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-slate-900/60 border border-white/10 rounded-md px-2.5 py-1.5 w-[128px]"
      >
        <span className="text-amber-300 shrink-0">
          <svg width={20} height={20} viewBox="0 0 24 24"><ExIcon name={value} x={0} y={0} size={24} color="currentColor" strokeWidth={2} /></svg>
        </span>
        <span className="text-xs text-slate-300 truncate">{value}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 max-h-64 overflow-auto bg-[#0c1428] border border-white/10 rounded-lg p-2 shadow-2xl grid grid-cols-7 gap-1">
          {ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              title={n}
              onClick={() => { onChange(n); setOpen(false); }}
              className={`flex items-center justify-center h-9 rounded-md hover:bg-white/10 ${
                n === value ? "bg-amber-500/20 text-amber-300" : "text-slate-200"
              }`}
            >
              <svg width={20} height={20} viewBox="0 0 24 24"><ExIcon name={n} x={0} y={0} size={24} color="currentColor" strokeWidth={2} /></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
