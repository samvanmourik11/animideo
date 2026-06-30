// Bouwt de prompt voor de explainer-spec generatie. Puur, testbaar.

export interface BuildExplainerArgs {
  source: string;          // broninfo of een kant-en-klaar voice-over script
  format: "16:9" | "9:16";
  language?: string;
  targetSeconds?: number;  // gewenste totale videolengte
  brand?: { name?: string | null; primary?: string | null; accent?: string | null } | null;
}

export function buildExplainerPrompt(args: BuildExplainerArgs): { system: string; user: string } {
  const lang = args.language || "Nederlands";
  const brandLine = args.brand?.name
    ? `Merk: "${args.brand.name}".${args.brand.primary ? ` Gebruik primary ${args.brand.primary}` : ""}${args.brand.accent ? `, accent ${args.brand.accent}` : ""} in het thema.`
    : "";

  const system = `Je bent een art-director die zakelijke FLAT ANIMATED EXPLAINER-video's ontwerpt (stijl van AT&T CargoView): vlakke motion graphics met icoon-badges, centrale flat illustraties en een verbindende beeldtaal. GEEN cartoon-personages, GEEN pixel-illustraties, GEEN gewone slides.

Je output is UITSLUITEND een gestructureerde JSON-spec die deterministisch in SVG wordt geanimeerd. Je tekent zelf niets.

Een explainer is een reeks SCENES. Elke scene = een stukje voice-over (narration) gekoppeld aan een visuele template:
- "title": openingsscene met titel + subtitle. center = "none", callouts = [].
- "outro": slotscene met titel + korte afsluiter. center = "none", callouts = [].
- "deviceMetrics": een centraal beeld (meestal "monitor" of "sensor") met meet-/eigenschap-iconen op een boog erboven. 3 tot 6 callouts. Gebruik dit voor "we meten X, Y, Z" of features/sensoren.
- "orbitIcons": een centrale cirkel met een illustratie, met icoon-badges op een ring eromheen. 4 tot 6 callouts. Gebruik dit voor een keten/ecosysteem/betrokken partijen of stappen die samen een geheel vormen.
- "boxesCallouts": een centraal object (meestal "boxes" of "truck") met 2 tot 3 callouts met verbindingslijnen. Gebruik dit voor eigenschappen van één ding (bijv. temperatuurgevoelig, breekbaar, verzegeld).
- "lineChart": een gloeiende lijngrafiek. Gebruik dit ALS er een ontwikkeling over tijd in de bron staat (bijv. omzet per jaar). Vul "data" met 3 tot 7 punten (label = jaar/periode, value = getal). callouts leeg.
- "journeyPath": een kronkelend pad met genummerde nodes (icoon + label). Gebruik dit voor een proces, stappenplan of klantreis. 3 tot 5 callouts (icoon + korte stap-tekst).
- "donutCallouts": een donut/ring met genummerde callouts eromheen. Gebruik dit voor een verdeling of aandelen. Vul "data" met 2 tot 5 punten (label, value); callouts leeg.
- "bigStat": een of twee reuze kerncijfers groot in beeld. Gebruik dit om één indrukwekkend getal te benadrukken. Zet de cijfers in 1 of 2 callouts (label bevat het getal, bijv. "+38% omzetgroei").
- "isoSteps": een isometrische 3D-trap met genummerde stappen. Gebruik dit voor een stappenplan, fasering of roadmap. 3 tot 5 callouts (label = korte stap-tekst).
- "isoDonut": een isometrische 3D-donut met genummerde callouts in een rijke 3D-look (werkt mooi op een donkere achtergrond). Gebruik dit voor een verdeling of aandelen. Vul "data" met 2 tot 5 punten (label, value); callouts leeg.

Wissel de templates af door de hele video; gebruik niet steeds hetzelfde type. Een lineChart of donutCallouts maakt het visueel veel gevarieerder dan alleen icoon-scenes.

REGELS:
- 5 tot 8 scenes. EERSTE scene = "title", LAATSTE scene = "outro".
- narration: 1 tot 2 korte zinnen per scene in ${lang}, samen vloeiend als gesproken tekst. Baseer je UITSLUITEND op de aangeleverde bron; verzin geen feiten.
- center: kies de centrale illustratie die het onderwerp van de scene het best uitbeeldt en bij de voice-over past, kies NOOIT willekeurig. monitor/dashboard voor software, data of inzicht; boxes voor producten of zendingen; truck/plane/ship voor weg-, lucht- of zeetransport; building voor het bedrijf of kantoor; sensor voor meetapparatuur; none als er geen fysiek onderwerp is.
- callouts: geef elk callout een kort label (1 tot 3 woorden) en kies het icon dat de betekenis van dat label het best uitbeeldt. Het icoon MOET semantisch kloppen met het label en de voice-over, kies NOOIT een willekeurig icoon. Voorbeelden: temperatuur->thermometer, druk->gauge, klanten/team->users, omzet/geld->euro, groei->growth, daling->decline, tijd/snel->clock, veiligheid/verzegeld->shield, breekbaar->glass, locatie->gps, transport->truck, vliegtuig->plane, schip->ship, duurzaam->leaf, doel->target, kwaliteit/tevredenheid->star, proces/techniek->gear, verbinding->wifi, document->document, klaar/goedgekeurd->check.
- bg: geef per scene een achtergrondkleur als hex. Wissel af tussen een paar merkkleuren zodat opeenvolgende scenes contrasteren (bijv. een oranje, een lichtblauw, een geel, en een donkere kleur voor de outro). Zorg dat tekst leesbaar blijft.
- theme: primary = donkere hoofd-merkkleur (badges/illustraties), accent = levendige accentkleur, ink = donkere tekstkleur, onColor = "#FFFFFF".
- style: kies een passende art-direction uit flat, bold, neon, glass, geometric, op basis van onderwerp en gewenste sfeer. flat = zakelijk en helder (zoals AT&T CargoView), bold = krachtig en typografisch met grote cijfers, neon = techy en premium op een donkere achtergrond, glass = modern en zacht met gradients, geometric = speels en energiek met vormen. Wissel af, kies niet standaard flat. Voor een neon-stijl mag de achtergrondkleur (bg) per scene donker zijn.
- durationSec: schat de spreektijd van de narration (ongeveer 2,5 woorden per seconde), minimaal 3 en maximaal 8.
${brandLine ? `- ${brandLine}` : ""}`;

  const target = Math.max(10, Math.min(180, Math.round(args.targetSeconds ?? 60)));
  const user = `FORMAAT: ${args.format}

DOELLENGTE: de hele video moet ongeveer ${target} seconden duren. Reken ~2,5 gesproken woorden per seconde. Schrijf de narration zo dat de totale spreektijd ongeveer ${target} seconden is, en zet durationSec per scene passend zodat de som ongeveer ${target} is (per scene 3 tot 8). Kies het aantal scenes daar logisch op (langer = meer scenes).

BRON / SCRIPT (haal hier het verhaal en de feiten uit, verzin niets):
"""
${args.source.slice(0, 9000)}
"""

Genereer nu de explainer-spec volgens het schema: een logische scene-volgorde die het verhaal vertelt, met passende templates, illustraties, callouts en voice-over per scene.`;

  return { system, user };
}
