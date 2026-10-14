import { createHmac, timingSafeEqual } from "crypto";

// Controle van de handtekening op webhooks van Resend (die lopen via Svix).
// Met de hand in plaats van het svix-pakket: het zijn tien regels, en zo komt
// er geen extra afhankelijkheid bij voor één route.
// Algoritme: HMAC-SHA256 over "id.tijdstip.body", sleutel = base64 na "whsec_".

const MAX_AFWIJKING_S = 5 * 60;

export function svixGeldig(
  geheim: string,
  kop: { id: string | null; tijd: string | null; handtekening: string | null },
  body: string,
  nuS = Math.floor(Date.now() / 1000)
): boolean {
  if (!kop.id || !kop.tijd || !kop.handtekening) return false;
  const tijd = Number(kop.tijd);
  // Oude berichten weigeren, zodat een onderschept verzoek niet later opnieuw kan.
  if (!Number.isFinite(tijd) || Math.abs(nuS - tijd) > MAX_AFWIJKING_S) return false;

  const sleutel = Buffer.from(geheim.replace(/^whsec_/, ""), "base64");
  const verwacht = createHmac("sha256", sleutel).update(`${kop.id}.${kop.tijd}.${body}`).digest();
  return kop.handtekening.split(" ").some((deel) => {
    const [versie, sig] = deel.split(",");
    if (versie !== "v1" || !sig) return false;
    const gekregen = Buffer.from(sig, "base64");
    return gekregen.length === verwacht.length && timingSafeEqual(gekregen, verwacht);
  });
}
