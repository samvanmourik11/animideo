// Regels voor de naam achter de @ (animideo.nl/@bakkerijjansen). Client-veilig: het
// profielscherm controleert al tijdens het typen.

// Woorden die naar ons zelf of naar een pagina van de app zouden kunnen lijken.
const GERESERVEERD = new Set([
  "animideo", "admin", "beheer", "support", "hulp", "help", "info", "team", "api", "app", "apps",
  "login", "signup", "account", "pricing", "prijzen", "ontdek", "effecten", "branches", "profiel",
  "maker", "jouwanimatievideo", "jav", "officieel", "official",
]);

export function controleerHandle(ruw: string): { handle: string; fout: string | null } {
  const handle = ruw.trim().toLowerCase().replace(/^@/, "");
  if (handle.length < 3) return { handle, fout: "Minstens 3 tekens." };
  if (handle.length > 30) return { handle, fout: "Hooguit 30 tekens." };
  if (!/^[a-z0-9-]+$/.test(handle)) return { handle, fout: "Alleen kleine letters, cijfers en streepjes." };
  if (handle.startsWith("-") || handle.endsWith("-") || handle.includes("--")) {
    return { handle, fout: "Geen streepje aan het begin of eind, en niet twee achter elkaar." };
  }
  if (GERESERVEERD.has(handle)) return { handle, fout: "Deze naam is niet beschikbaar." };
  return { handle, fout: null };
}

export function websiteNetjes(ruw: string): string {
  const w = ruw.trim();
  if (!w) return "";
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}
