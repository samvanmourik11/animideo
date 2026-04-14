interface StepperProps {
  steps: string[];
  current: number;
  onSelect: (index: number) => void;
  maxReached: number;
}

export default function Stepper({ steps, current, onSelect, maxReached }: StepperProps) {
  return (
    <nav className="flex items-center gap-0 overflow-x-auto pb-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxReached;
        return (
          <button
            key={label}
            onClick={() => reachable && onSelect(i)}
            disabled={!reachable}
            className={`flex items-center gap-2 py-2 px-3 text-sm font-medium transition-all duration-200 whitespace-nowrap
              ${active
                ? "text-blue-400"
                : done
                ? "text-slate-400 hover:text-blue-400"
                : "text-slate-600 cursor-default"
              }
            `}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-200
                ${active
                  ? "bg-blue-500/20 border-2 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.4)]"
                  : done
                  ? "bg-blue-600 border-2 border-blue-600 text-white"
                  : "border-2 border-white/10 text-slate-600"
                }
              `}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {i < steps.length - 1 && (
              <span className="ml-2 text-slate-700 select-none">›</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
