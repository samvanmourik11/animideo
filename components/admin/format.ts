// Gedeelde formatters voor het admin-dashboard (nl-NL).

export function eur(n: number, cents = false): string {
  return (
    "€" +
    n.toLocaleString("nl-NL", {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  );
}

export function pct(fraction: number, digits = 1): string {
  return (fraction * 100).toFixed(digits) + "%";
}

export function dateNL(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function dateShort(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
}

export function timeNL(d: string | Date): string {
  return new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function relTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const dd = Math.floor(h / 24);
  return `${dd} d geleden`;
}

// Dashboard-kleurenpalet
export const COLORS = {
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  green: "#22c55e",
  greenLight: "#4ade80",
  red: "#ef4444",
  redLight: "#f87171",
  amber: "#f59e0b",
  slate: "#64748b",
  violet: "#a78bfa",
};

// Vaste kleur per plan (voor consistente donut/legenda)
export const PLAN_COLOR: Record<string, string> = {
  Starter: "#3b82f6",
  Pro: "#a78bfa",
  Agency: "#f59e0b",
  Gratis: "#64748b",
};
