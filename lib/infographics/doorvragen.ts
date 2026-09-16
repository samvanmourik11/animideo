import { openai } from "@/lib/openai";

/**
 * Vraagt door als het eerste bericht te weinig zegt om een verhaal van te maken.
 *
 * Een opzet uitwerken (verhaal, personages tekenen, redactie) duurt al gauw een minuut.
 * Wie "hoi, ik wil een video met twee pratende paarden" typt, zat die minuut te wachten
 * op een verhaal dat hij niet had omschreven, terwijl hij een gesprek verwachtte — Sam
 * liep er tegenaan tijdens het opnemen van een training. Een kleine, snelle vraag
 * vooraf: null = genoeg om mee verder te gaan (of de check faalde).
 */
export async function vraagDoor(text: string, language: string): Promise<string | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Je bent de assistent van een tool die korte animatievideo's maakt waarin personages met elkaar praten. De gebruiker beschrijft wat hij wil; daarna schrijft de tool er een heel verhaal bij.
Beoordeel of dit eerste bericht genoeg zegt om een goed verhaal te maken. Genoeg is: je weet wie er meedoen EN waar het over gaat of wat er gebeurt (een onderwerp, situatie, boodschap of probleem). Een doelgroep of toon mag ontbreken. Een uitgewerkt verhaal, een script of een duidelijke situatie is altijd genoeg.
Is het niet genoeg, stel dan in het ${language} hooguit drie korte, vriendelijke vragen die het verhaal beter maken, bijvoorbeeld: waar het gesprek over gaat of wat er gebeurt, voor wie de video is, en welke sfeer. Sluit aan bij wat de gebruiker al noemde (vraag bij paarden niet wie de personages zijn).
Antwoord als JSON: {"genoeg": true} of {"genoeg": false, "vragen": "alleen de vragen, genummerd, elk op een eigen regel"}.`,
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
    });
    const uit = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { genoeg?: boolean; vragen?: string };
    if (uit.genoeg !== false || !uit.vragen?.trim()) return null;
    // Opening en afsluiting vast: het kleine model liet ze in de proef steeds weg.
    return `Leuk idee! Vertel me iets meer, dan wordt het verhaal beter:\n\n${uit.vragen.trim()}\n\n` +
      "Je mag ook gewoon \"maak maar\" zeggen, dan verzin ik de rest.";
  } catch (e) {
    console.warn("[dialogue-setup] doorvragen mislukt, gewoon verder:", e instanceof Error ? e.message : e);
    return null;
  }
}
