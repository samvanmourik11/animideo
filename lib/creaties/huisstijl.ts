// De huisstijl als stukje beeldopdracht. Maxims testronde (26-10-2026): bij Beeld maken en
// de branche-sjablonen was geen huisstijl te kiezen, dus verzon het model een eigen
// bedrijfsnaam op de gevel ("Bakkerij De Volendammer") en negeerde het "vermijden". De
// Regisseur deed het wél goed, omdat hij de huisstijl eerst leest; dit doet hetzelfde voor
// de losse tools. Client-veilig: alleen het type en een pure functie.

export interface HuisstijlKort {
  naam: string;
  beschrijving?: string;
  toon?: string;
  kleuren: string[];
  lettertypen: string[];
  omgeving?: string;
  vermijden?: string;
}

/** Engelse aanvulling op de beeldopdracht; de modellen volgen Engels het best. */
export function huisstijlPrompt(h: HuisstijlKort): string {
  const regels = [
    `Brand: "${h.naam}". If a business name, sign, shopfront, packaging or logo text appears, it reads exactly "${h.naam}" — never invent another business name.`,
    h.beschrijving ? `About the brand: ${h.beschrijving}` : "",
    h.kleuren.length ? `Use the brand colors ${h.kleuren.join(", ")} for accents, signage, packaging and any text.` : "",
    h.lettertypen.length ? `Any text in the image is set in a typeface like ${h.lettertypen.join(" or ")}.` : "",
    h.toon ? `Mood and tone: ${h.toon}.` : "",
    h.omgeving ? `Typical setting: ${h.omgeving}.` : "",
    h.vermijden ? `Strictly avoid: ${h.vermijden}.` : "",
  ].filter(Boolean);
  return `\n\n${regels.join("\n")}`;
}
