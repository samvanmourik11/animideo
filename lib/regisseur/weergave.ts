// Het gesprek van de Regisseur in leesbare regels: tekst van beide kanten, wat hij deed en
// bijlagen. Gedeeld door het Regisseur-scherm in de app en het Animideo-scherm in de
// Claude-app (lib/mcp), zodat ze precies hetzelfde laten zien. Geen server-code hier.

type Blok = { type: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown; tool_use_id?: string; source?: { url?: string }; title?: string };
type Bericht = { role: "user" | "assistant"; content: string | Blok[] };

export interface Regel {
  wie: "jij" | "regisseur" | "actie" | "bijlage";
  tekst: string;
  url?: string;
  video?: boolean;
}

export const ICOON: Record<string, string> = {
  maak_beeld: "🖼️ Beeld maken",
  maak_video: "🎬 Video maken",
  gebruik_app: "🧩 App gebruiken",
  monteer: "✂️ Monteren",
  lees_webpagina: "🌐 Pagina lezen",
  mijn_werk: "📚 Je werk bekijken",
  wacht_op: "⏳ Wachten op resultaten",
  vaste_taak: "🔁 Vaste taak",
  social_kanalen: "📣 Je kanalen bekijken",
  lees_huisstijl: "🎨 Huisstijl bekijken",
  maak_contentkalender: "📅 Contentkalender opzetten",
};

/** Het gesprek in leesbare regels: tekst van beide kanten, en wat de Regisseur deed. */
export function regels(berichten: unknown[], openVraag = false): Regel[] {
  const lijst = berichten as Bericht[];
  const uit: Regel[] = [];
  for (const b of lijst) {
    if (typeof b.content === "string") {
      // De opdracht van een vaste taak is voor Claude; in beeld alleen welke taak het is.
      const taak = b.role === "user" ? b.content.match(/^Vaste taak "([^"]+)" \(([^,)]+)/) : null;
      if (taak) {
        uit.push({ wie: "actie", tekst: `🔁 Vaste taak "${taak[1]}" (${taak[2]}), automatisch gestart` });
        continue;
      }
      uit.push({ wie: b.role === "user" ? "jij" : "regisseur", tekst: b.content });
      continue;
    }
    for (const blok of b.content) {
      // Een video-bijlage gaat naar Claude als losse beelden; in beeld tonen we de video zelf.
      const video = b.role === "user" && blok.type === "text" ? blok.text?.match(/^\(Bijlage: video "[^"]*", adres (\S+) /) : null;
      if (video) uit.push({ wie: "bijlage", tekst: "", url: video[1], video: true });
      if (b.role === "user" && blok.type === "image" && blok.source?.url && !blok.source.url.endsWith(".still.jpg")) uit.push({ wie: "bijlage", tekst: "", url: blok.source.url });
      if (b.role === "user" && blok.type === "document") uit.push({ wie: "bijlage", tekst: `📄 ${blok.title ?? "document"}` });
      // De uitleg bij een bijlage is voor Claude, niet voor in beeld.
      if (blok.type === "text" && blok.text?.startsWith("(Bijlage: ")) continue;
      if (blok.type === "text" && blok.text === "(Zie de bijlage.)") continue;
      if (blok.type === "text" && blok.text?.trim()) uit.push({ wie: b.role === "user" ? "jij" : "regisseur", tekst: blok.text });
      // De vraag die nu openstaat, staat al boven het keuzemenu; niet nog eens als ballon.
      const laatste = b === lijst[lijst.length - 1];
      if (blok.type === "tool_use" && blok.name === "vraag_keuze") {
        if (!(openVraag && laatste)) uit.push({ wie: "regisseur", tekst: String(blok.input?.vraag ?? "") });
      }
      else if (blok.type === "tool_use" && blok.name === "begroting") {
        const posten = (Array.isArray(blok.input?.posten) ? blok.input.posten : []) as { credits?: number }[];
        uit.push({ wie: "actie", tekst: `💶 Begroting: ${posten.reduce((s, x) => s + (Number(x.credits) || 0), 0)} credits` });
      }
      else if (blok.type === "tool_use" && blok.name && ICOON[blok.name]) {
        const i = blok.input ?? {};
        const extra = String(i.prompt ?? i.beweging ?? i.url ?? i.titel ?? i.app_id ?? "").slice(0, 80);
        uit.push({ wie: "actie", tekst: `${ICOON[blok.name]}${extra ? `: ${extra}` : ""}` });
      }
      if (blok.type === "tool_result" && typeof blok.content === "string" && blok.content.startsWith("Antwoord van de gebruiker: ")) {
        // De precieze waarde voor Claude ("(creator-id chantal)") hoort niet in beeld.
        uit.push({ wie: "jij", tekst: blok.content.slice("Antwoord van de gebruiker: ".length).replace(/ \[waarde: [\s\S]*\]$/, "") });
      }
    }
  }
  return uit;
}

