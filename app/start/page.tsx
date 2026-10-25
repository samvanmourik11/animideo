import Link from "next/link";
import { Suspense } from "react";
import GratisWeekFormulier from "./GratisWeekFormulier";

export const metadata = { title: "Probeer Animideo 7 dagen gratis" };

// De aanmeldpagina achter alle advertenties en landingspagina's: pakket kiezen, e-mail, akkoord,
// en dan met iDEAL verifiëren. Wat de klant straks betaalt, staat drie keer in beeld: bij het
// pakket, in het verplichte vinkje en onder de knop. Dat scheelt terugboekingen.
export default function StartPagina() {
  return (
    <div
      className="min-h-screen bg-vlak px-4 py-8 sm:py-12"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 70%)" }}
    >
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <a href="https://animideo.com" className="text-2xl font-bold text-tekst">Animideo<span className="text-blue-500">.</span></a>
          <Link href="/login" className="text-sm text-tekst-3 hover:text-tekst">Al een account? Inloggen</Link>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-tekst leading-tight">Probeer Animideo 7 dagen gratis</h1>
        <p className="text-tekst-2 mt-2 mb-8">200 credits om mee te maken. Kies het pakket dat daarna doorloopt; in de proefweek opzeggen kost niets.</p>

        <Suspense>
          <GratisWeekFormulier />
        </Suspense>

        <p className="text-xs text-tekst-3 text-center mt-8">Powered by JouwAnimatieVideo · betalingen veilig via Mollie</p>
      </div>
    </div>
  );
}
