import Link from "next/link";
import { SELLER } from "@/lib/receipt";

export const metadata = {
  title: "Algemene voorwaarden — JouwAnimatieVideo A.I.",
};

const LAST_UPDATED = "24 juni 2026";

function Article({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-bold text-white mb-2">
        Artikel {n} — {title}
      </h2>
      <div className="text-sm text-slate-300 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function AlgemeneVoorwaardenPage() {
  return (
    <div className="min-h-screen bg-[#060d1f] px-4 py-10">
      <div className="w-full max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Terug
        </Link>

        <h1 className="text-2xl font-black text-white mb-1">Algemene voorwaarden</h1>
        <p className="text-xs text-slate-500 mb-8">Laatst bijgewerkt: {LAST_UPDATED}</p>

        <Article n={1} title="Bedrijfsgegevens">
          <p>
            Deze dienst wordt aangeboden door {SELLER.name}
            {SELLER.legalName ? ` (${SELLER.legalName})` : ""}, gevestigd aan {SELLER.address}, {SELLER.postalCity},
            {" "}{SELLER.country}.
          </p>
          <p>
            KvK: {SELLER.kvk} &middot; BTW: {SELLER.vat} &middot; E-mail:{" "}
            <a href={`mailto:${SELLER.email}`} className="text-blue-400 underline">{SELLER.email}</a> &middot; Website:{" "}
            {SELLER.website}. Hierna: &ldquo;wij&rdquo;, &ldquo;ons&rdquo; of &ldquo;JouwAnimatieVideo&rdquo;.
          </p>
        </Article>

        <Article n={2} title="Toepasselijkheid">
          <p>
            Deze voorwaarden zijn van toepassing op elk gebruik van onze website en software (de &ldquo;Dienst&rdquo;)
            en op elke overeenkomst tussen jou en JouwAnimatieVideo. Door een account aan te maken of een abonnement af
            te sluiten, ga je akkoord met deze voorwaarden.
          </p>
        </Article>

        <Article n={3} title="De Dienst">
          <p>
            JouwAnimatieVideo is een online softwaredienst (SaaS) waarmee je met behulp van AI animatie- en
            uitlegvideo&apos;s genereert. De Dienst werkt met een creditsysteem: je abonnement bevat een maandelijks
            tegoed aan credits waarmee je video&apos;s en beelden genereert.
          </p>
        </Article>

        <Article n={4} title="Abonnement, prijs en automatische verlenging">
          <p>
            <strong className="text-white">Het abonnement is een doorlopend, maandelijks abonnement.</strong> Bij het
            webinar-aanbod betaal je voor de <strong className="text-white">eerste maand een introductieprijs van
            &euro;1</strong>. Daarna wordt het abonnement automatisch verlengd en wordt telkens
            {" "}<strong className="text-white">&euro;49 per maand</strong> in rekening gebracht, totdat je opzegt.
          </p>
          <p>
            De verlenging en incasso gebeuren automatisch aan het begin van elke nieuwe maand. Het abonnement loopt voor
            onbepaalde tijd door tot het door jou wordt opgezegd. Genoemde prijzen zijn inclusief 21% btw.
          </p>
        </Article>

        <Article n={5} title="Betaling">
          <p>
            Betalingen worden veilig verwerkt door onze betaaldienstverlener Mollie (o.a. iDEAL en SEPA-incasso). Voor de
            automatische maandelijkse verlenging geef je bij de eerste betaling een doorlopende machtiging af. Bij een
            mislukte incasso kunnen wij de toegang tot de Dienst opschorten tot de betaling is voldaan.
          </p>
        </Article>

        <Article n={6} title="Opzeggen">
          <p>
            Je kunt het abonnement <strong className="text-white">op elk moment maandelijks opzeggen</strong> via je
            account (onder Account &rarr; Abonnement) of door een e-mail te sturen naar{" "}
            <a href={`mailto:${SELLER.email}`} className="text-blue-400 underline">{SELLER.email}</a>. Na opzegging stopt
            de volgende incasso en behoud je toegang tot de Dienst tot het einde van de reeds betaalde periode. Reeds
            betaalde maanden worden niet (gedeeltelijk) gerestitueerd.
          </p>
        </Article>

        <Article n={7} title="Herroepingsrecht en digitale dienst">
          <p>
            De Dienst is een digitale dienst die direct na betaling beschikbaar wordt gesteld. Door akkoord te gaan en
            de Dienst direct te gebruiken, stem je ermee in dat wij direct beginnen met de levering en erken je dat je
            je wettelijke herroepingsrecht (de 14 dagen bedenktijd voor consumenten) verliest zodra de dienst volledig
            is geleverd. Dit laat onverlet dat je het doorlopende abonnement maandelijks kunt opzeggen (artikel 6).
          </p>
        </Article>

        <Article n={8} title="Credits en gebruik">
          <p>
            Credits worden elke maand vernieuwd en zijn gekoppeld aan een actief abonnement. Ongebruikte credits komen
            aan het einde van de maand te vervallen en worden niet uitbetaald. Je gebruikt de Dienst niet voor
            onrechtmatige, misleidende of inbreukmakende doeleinden.
          </p>
        </Article>

        <Article n={9} title="Gegenereerde content">
          <p>
            Je behoudt de gebruiksrechten op de video&apos;s en beelden die je met de Dienst genereert en mag deze
            zakelijk gebruiken, mits je abonnement en betalingen up-to-date zijn. Je bent zelf verantwoordelijk voor de
            inhoud die je aanlevert (zoals teksten, logo&apos;s en foto&apos;s) en garandeert dat je daarvoor de
            benodigde rechten hebt.
          </p>
        </Article>

        <Article n={10} title="Aansprakelijkheid">
          <p>
            De Dienst wordt geleverd &ldquo;zoals deze is&rdquo;. Wij spannen ons in voor een goede werking, maar kunnen
            niet garanderen dat de Dienst ononderbroken of foutloos is. Onze aansprakelijkheid is beperkt tot maximaal
            het bedrag dat je in de drie maanden voorafgaand aan de gebeurtenis aan ons hebt betaald.
          </p>
        </Article>

        <Article n={11} title="Privacy">
          <p>
            Wij gaan zorgvuldig om met je gegevens. Hoe wij persoonsgegevens verwerken, lees je in ons{" "}
            <Link href="/privacybeleid" className="text-blue-400 underline">privacybeleid</Link>.
          </p>
        </Article>

        <Article n={12} title="Wijzigingen">
          <p>
            Wij kunnen deze voorwaarden en de prijzen wijzigen. Wijzigingen die voor jou nadelig zijn, kondigen wij
            vooraf per e-mail aan. Ben je het niet eens met een wijziging, dan kun je het abonnement opzeggen vóór de
            wijziging ingaat.
          </p>
        </Article>

        <Article n={13} title="Toepasselijk recht">
          <p>
            Op deze voorwaarden is Nederlands recht van toepassing. Geschillen leggen wij voor aan de bevoegde rechter
            in het arrondissement waar wij zijn gevestigd, voor zover de wet niet dwingend een andere rechter aanwijst.
          </p>
        </Article>

        <p className="text-xs text-slate-500 mt-10">
          Vragen over deze voorwaarden? Mail{" "}
          <a href={`mailto:${SELLER.email}`} className="text-blue-400 underline">{SELLER.email}</a>.
        </p>
      </div>
    </div>
  );
}
