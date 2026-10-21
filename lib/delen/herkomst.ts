// Waarmee een creatie gemaakt is, in gewone taal, plus waar je hetzelfde maakt. Voor de
// openbare deelpagina ("Gemaakt met Jij als Vermeer · Maak dit ook"). Client-veilig.

import { recept, receptPad } from "@/lib/creaties/recepten";
import type { Creatie } from "@/lib/creaties/types";

export function herkomst(c: Pick<Creatie, "maker" | "invoer" | "soort">): { naam: string; pad: string } {
  if (c.maker === "recept") {
    const r = recept((c.invoer as { receptId?: string }).receptId);
    if (r) return { naam: r.naam, pad: receptPad(r) };
  }
  if (c.maker === "reclame") return { naam: "Link → reclame", pad: "/apps/reclame" };
  if (c.maker === "montage") return { naam: "Regisseur", pad: "/regisseur" };
  if (c.maker === "trailer") return { naam: "Trailerstudio", pad: "/studios/trailer" };
  if (c.maker === "ugc") return { naam: "UGC-studio", pad: "/studios/ugc" };
  if (c.maker === "ugc-creator") return { naam: "UGC-creator", pad: "/studios/ugc" };
  if (c.maker === "storytelling") return { naam: "Storytelling", pad: "/studios/storytelling" };
  if (c.maker === "dialoog") return { naam: "Dialoog", pad: "/studios/dialoog" };
  if (c.soort === "video") return { naam: "Animideo Video", pad: "/maak/video" };
  return { naam: "Animideo Beeld", pad: "/maak/beeld" };
}

/**
 * Staat er (waarschijnlijk) een herkenbaar gezicht op? Dan vragen we bij het delen
 * opnieuw om toestemming: iets maken voor jezelf is wat anders dan het openbaar zetten.
 */
export function heeftGezicht(c: Pick<Creatie, "maker" | "invoer">): boolean {
  if (c.maker === "gezicht") return true;
  if (c.maker === "recept") return !!recept((c.invoer as { receptId?: string }).receptId)?.gezicht;
  return false;
}
