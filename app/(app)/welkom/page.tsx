import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import { HOOFDSTUKKEN, posterVan } from "@/lib/academy/lessen";
import { voortgangVan } from "@/lib/academy/voortgang";

export const metadata = { title: "Welkom · Animideo" };
export const dynamic = "force-dynamic";

// De eerste pagina na het aanmaken van een account. Sam (26-10-2026): nieuwe klanten
// kwamen op een lege projectenlijst uit en wisten niet waar te beginnen; ze moeten zo snel
// mogelijk de Academy in. Daarom één grote knop naar les 1 en drie stappen die zichzelf
// afvinken uit de echte Academy-voortgang.
export default async function WelkomPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profiel = await getProfile(user.id);
  // Klanten met de losse cursus zien de Academy niet (zelfde regel als op /academy).
  if (profiel.hide_leren) redirect("/ontdek");

  const { bekeken, gedaan } = await voortgangVan(user.id);
  const basis = HOOFDSTUKKEN[0].lessen;
  const eerste = basis[0];
  const basisGezien = basis.every((l) => bekeken.has(l.slug));
  const stappen = [
    {
      klaar: basisGezien,
      titel: "Kijk de basis",
      tekst: `${basis.length} korte lessen: wat je kunt maken, hoe credits werken en hoe je er geld mee verdient.`,
      href: `/academy/${(basis.find((l) => !bekeken.has(l.slug)) ?? eerste).slug}`,
      knop: basisGezien ? "Bekeken" : "Naar de les",
    },
    {
      klaar: gedaan.has("beeld-maken"),
      titel: "Maak je eerste beeld",
      tekst: "Beschrijf in een zin wat je wilt zien. Binnen een halve minuut staat het er.",
      href: "/academy/beeld-maken",
      knop: "Bekijk hoe het werkt",
    },
    {
      klaar: gedaan.has("regisseur"),
      titel: "Laat de Regisseur iets voor je maken",
      tekst: "Zeg wat je nodig hebt, bijvoorbeeld drie Instagram-posts. De Regisseur regelt de rest.",
      href: "/academy/regisseur",
      knop: "Bekijk hoe het werkt",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-tekst tracking-tight">Welkom bij Animideo 👋</h1>
        <p className="text-tekst-2 mt-2 max-w-2xl">
          Fijn dat je er bent. Je hebt <span className="font-semibold text-tekst">⚡ {profiel.credits} credits</span>{" "}
          om mee te beginnen. Begin in de Academy: in een paar korte video&apos;s zie je precies hoe alles werkt.
        </p>
      </div>

      <Link href={`/academy/${eerste.slug}`} className="group grid md:grid-cols-[1.4fr_1fr] rounded-3xl border border-rand bg-paneel overflow-hidden hover:border-blue-500/60 transition">
        <div className="relative aspect-video bg-paneel-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={posterVan(eerste.slug)} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition">▶</span>
          </span>
        </div>
        <div className="p-6 flex flex-col justify-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">🎓 Academy · Les 1</div>
          <div className="text-xl font-bold text-tekst mt-1 leading-snug">{eerste.titel}</div>
          <p className="text-sm text-tekst-2 mt-2">{eerste.kort}</p>
          <span className="btn-primary text-center mt-5">Start de Academy →</span>
        </div>
      </Link>

      <div>
        <h2 className="text-lg font-bold text-tekst mb-3">Zo kom je snel op gang</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {stappen.map((s, i) => (
            <div key={s.titel} className="n-kaart flex flex-col">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${s.klaar ? "bg-emerald-500 text-white" : "bg-blue-50 text-blue-600"}`}>
                  {s.klaar ? "✓" : i + 1}
                </span>
                <span className="font-bold text-tekst">{s.titel}</span>
              </div>
              <p className="text-sm text-tekst-2 mt-2 flex-1">{s.tekst}</p>
              <Link href={s.href} className="text-sm font-semibold text-blue-600 hover:text-blue-700 mt-3">
                {s.knop} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-tekst-3 border-t border-rand pt-5">
        <span>Je vindt de Academy altijd terug in het menu links.</span>
        <Link href="/ontdek" className="font-semibold text-tekst-2 hover:text-tekst">Liever meteen zelf aan de slag? Naar Ontdek →</Link>
      </div>
    </div>
  );
}
