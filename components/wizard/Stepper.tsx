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
            className={`flex items-center gap-2 py-2 px-3 text-sm font-medium transition-colors whitespace-nowrap
              ${active ? "text-[#3b82f6]" : done ? "text-gray-500 hover:text-[#3b82f6]" : "text-gray-300 cursor-default"}
            `}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0
                ${active
                  ? "border-[#3b82f6] text-[#3b82f6] bg-white"
                  : done
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-gray-200 text-gray-300"
                }
              `}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {i < steps.length - 1 && (
              <span className="ml-2 text-gray-200 select-none">›</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
