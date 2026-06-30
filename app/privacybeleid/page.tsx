import Link from "next/link";
import { SELLER } from "@/lib/receipt";

export const metadata = {
  title: "Privacybeleid — JouwAnimatieVideo A.I.",
};

const LAST_UPDATED = "24 juni 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-bold text-white mb-2">{title}</h2>
      <div className="text-sm text-slate-300 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacybeleidPage() {
  return (
    <div className="min-h-screen bg-[#060d1f] px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Terug
        </Link>

        <h1 className="text-2xl font-black text-white mb-1">Privacybeleid</h1>
        <p className="text-xs text-slate-500 mb-8">Laatst bijgewerkt: {LAST_UPDATED}</p>

        <Section title="Wie zijn wij">
          <p>
            {SELLER.name}, gevestigd aan {SELLER.address}, {SELLER.postalCity}, {SELLER.country} (KvK {SELLER.kvk}), is
            verwerkingsverantwoordelijke voor de verwerking van persoonsgegevens via deze dienst. Contact:{" "}
            <a href={`mailto:${SELLER.email}`} className="text-blue-400 underline">{SELLER.email}</a>.
          </p>
        </Section>

        <Section title="Welke gegevens wij verwerken">
          <ul className="list-disc pl-5 space-y-1">
            <li>Accountgegevens: je e-mailadres en inloggegevens.</li>
            <li>Betaalgegevens: verwerkt door onze betaaldienstverlener Mollie. Wij bewaren geen volledige bankgegevens.</li>
            <li>Gebruiksgegevens: projecten, gegenereerde video&apos;s/beelden en het door jou aangeleverde materiaal.</li>
            <li>Communicatie: berichten die je ons stuurt en, indien je je aanmeldt, je nieuwsbriefvoorkeur.</li>
          </ul>
        </Section>

        <Section title="Waarvoor wij gegevens gebruiken">
          <ul className="list-disc pl-5 space-y-1">
            <li>Het leveren en verbeteren van de dienst.</li>
            <li>Het verwerken van betalingen en het beheren van je abonnement.</li>
            <li>Klantenservice en, met je toestemming, het versturen van onze nieuwsbrief.</li>
            <li>Het voldoen aan wettelijke (administratieve en fiscale) verplichtingen.</li>
          </ul>
        </Section>

        <Section title="Delen met derden">
          <p>
            Wij delen gegevens alleen met dienstverleners die nodig zijn om de dienst te leveren (zoals onze
            betaaldienstverlener, hosting en AI-leveranciers voor het genereren van content), of wanneer de wet ons
            daartoe verplicht. Met deze partijen sluiten wij waar nodig verwerkersovereenkomsten.
          </p>
        </Section>

        <Section title="Bewaartermijn">
          <p>
            Wij bewaren je gegevens zo lang als nodig is voor de doeleinden hierboven, en voor facturen de wettelijke
            bewaartermijn van 7 jaar. Na opzegging verwijderen of anonimiseren wij je accountgegevens binnen een redelijke
            termijn.
          </p>
        </Section>

        <Section title="Je rechten">
          <p>
            Je hebt het recht op inzage, correctie, verwijdering en overdracht van je gegevens, en je kunt bezwaar maken
            tegen verwerking of je toestemming (bijv. voor de nieuwsbrief) intrekken. Stuur hiervoor een e-mail naar{" "}
            <a href={`mailto:${SELLER.email}`} className="text-blue-400 underline">{SELLER.email}</a>. Je kunt ook een
            klacht indienen bij de Autoriteit Persoonsgegevens.
          </p>
        </Section>

        <p className="text-xs text-slate-500 mt-10">
          Zie ook onze{" "}
          <Link href="/algemene-voorwaarden" className="text-blue-400 underline">algemene voorwaarden</Link>.
        </p>
      </div>
    </div>
  );
}
