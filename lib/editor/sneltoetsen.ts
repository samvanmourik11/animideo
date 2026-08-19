// ── Sneltoetsen ──────────────────────────────────────────────────────────────
//
// De vertaling van een toetsaanslag naar een handeling staat hier apart, los van
// de editor zelf. Twee redenen: het is de enige plek waar je alle combinaties
// naast elkaar ziet (en dus merkt dat er twee dingen op dezelfde toets zitten),
// en het is te testen zonder browser.
//
// Toetsen die met een teken te maken hebben lezen we via `code` en niet via
// `key`. Op een Mac levert Option+] namelijk "’" op en Shift+. levert ">", en
// dan zou de sneltoets van je toetsenbordindeling afhangen.

export type Actie =
  // Elementen toevoegen
  | "tekst" | "rechthoek" | "cirkel" | "lijn" | "zoeken"
  // Tekst bewerken
  | "vet" | "cursief" | "onderstrepen" | "hoofdletters"
  | "groter" | "kleiner" | "regelafstand-op" | "regelafstand-neer"
  // Algemeen
  | "kopieer" | "kopieer-stijl" | "plak" | "knip" | "dupliceer"
  | "ongedaan" | "opnieuw" | "verwijder" | "selecteer-alles"
  // Rangschikken
  | "laag-voor" | "laag-achter" | "laag-vooraan" | "laag-achteraan"
  | "groepeer" | "degroepeer" | "vergrendel"
  | "links" | "rechts" | "omhoog" | "omlaag"
  // Weergave
  | "zoom-in" | "zoom-uit" | "zoom-100" | "zoom-passend"
  | "nieuwe-scene" | "presentatie" | "escape" | "afspelen";

export interface Aanslag {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface Uitkomst {
  actie: Actie;
  /** Bij verplaatsen: grotere stap (Shift ingedrukt). */
  groot?: boolean;
}

/**
 * Op een Mac is Command de bedieningstoets, op Windows Control. We behandelen ze
 * als hetzelfde: anders werkt de helft van de lijst op één van beide niet.
 */
function bedien(a: Aanslag): boolean {
  return a.ctrlKey || a.metaKey;
}

export function toetsNaarActie(a: Aanslag): Uitkomst | null {
  const cmd = bedien(a);

  // ── Zonder bedieningstoets: losse letters om iets neer te zetten ──────────
  if (!cmd && !a.altKey) {
    if (a.code === "Escape") return { actie: "escape" };
    if (a.code === "Space") return { actie: "afspelen" };
    if (a.code === "Delete" || a.code === "Backspace") return { actie: "verwijder" };
    if (!a.shiftKey) {
      switch (a.code) {
        case "KeyT": return { actie: "tekst" };
        case "KeyR": return { actie: "rechthoek" };
        case "KeyC": return { actie: "cirkel" };
        case "KeyL": return { actie: "lijn" };
        case "Slash": return { actie: "zoeken" };
      }
    }
    // Pijltjes verplaatsen het element; met Shift in grotere stappen.
    switch (a.code) {
      case "ArrowLeft": return { actie: "links", groot: a.shiftKey };
      case "ArrowRight": return { actie: "rechts", groot: a.shiftKey };
      case "ArrowUp": return { actie: "omhoog", groot: a.shiftKey };
      case "ArrowDown": return { actie: "omlaag", groot: a.shiftKey };
    }
    return null;
  }

  // ── Alt zonder bedieningstoets: regelafstand ──────────────────────────────
  if (!cmd && a.altKey) {
    if (a.code === "ArrowUp") return { actie: "regelafstand-op" };
    if (a.code === "ArrowDown") return { actie: "regelafstand-neer" };
    return null;
  }

  // ── Met bedieningstoets ───────────────────────────────────────────────────
  // Laagvolgorde: met Alt erbij ga je in één keer helemaal door.
  if (a.code === "BracketRight") return { actie: a.altKey ? "laag-vooraan" : "laag-voor" };
  if (a.code === "BracketLeft") return { actie: a.altKey ? "laag-achteraan" : "laag-achter" };

  if (a.code === "Equal" || a.code === "NumpadAdd") return { actie: "zoom-in" };
  if (a.code === "Minus" || a.code === "NumpadSubtract") return { actie: "zoom-uit" };
  if (a.code === "Digit0" || a.code === "Numpad0") {
    return { actie: a.shiftKey ? "zoom-passend" : "zoom-100" };
  }
  if (a.code === "Enter" || a.code === "NumpadEnter") return { actie: "nieuwe-scene" };

  if (a.altKey && a.code === "KeyP") return { actie: "presentatie" };
  if (a.altKey && a.shiftKey && a.code === "KeyL") return { actie: "vergrendel" };

  switch (a.code) {
    case "KeyB": return { actie: "vet" };
    case "KeyI": return { actie: "cursief" };
    case "KeyU": return { actie: "onderstrepen" };
    case "KeyK": return a.shiftKey ? { actie: "hoofdletters" } : null;
    case "KeyC": return { actie: a.altKey ? "kopieer-stijl" : "kopieer" };
    case "KeyV": return { actie: "plak" };
    case "KeyX": return { actie: "knip" };
    case "KeyD": return { actie: "dupliceer" };
    case "KeyA": return { actie: "selecteer-alles" };
    case "KeyG": return { actie: a.shiftKey ? "degroepeer" : "groepeer" };
    case "KeyZ": return { actie: a.shiftKey ? "opnieuw" : "ongedaan" };
    case "KeyY": return { actie: "opnieuw" };
  }

  // Tekst groter/kleiner. Shift+. geeft ">" en Shift+, geeft "<"; we kijken naar
  // de toets zelf, zodat het ook klopt op een indeling waar die tekens elders
  // zitten.
  if (a.shiftKey && (a.code === "Period" || a.key === ">")) return { actie: "groter" };
  if (a.shiftKey && (a.code === "Comma" || a.key === "<")) return { actie: "kleiner" };

  return null;
}

/**
 * Hoort deze aanslag genegeerd te worden omdat je in een invoerveld zit?
 *
 * Zonder dit zou het typen van de letter "c" in een zoekveld een cirkel op de
 * video zetten. De bewerkings-sneltoetsen (kopiëren, plakken) laten we juist
 * wél door: die horen bij het veld zelf.
 */
export function inInvoerveld(tag: string | undefined): boolean {
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
