import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DOELGROEP_IDS, DOELGROEPEN, type DoelgroepId } from "@/lib/site/inhoud";
import { Held, Kop, Prijzen, Slot, Stappen, Support, Voet, Voorbeelden, VragenBlok } from "@/components/site/Site";

export function generateStaticParams() {
  return DOELGROEP_IDS.map((doelgroep) => ({ doelgroep }));
}

export async function generateMetadata({ params }: { params: Promise<{ doelgroep: string }> }): Promise<Metadata> {
  const d = DOELGROEPEN[(await params).doelgroep as DoelgroepId];
  if (!d) return {};
  return { title: d.metaTitel, description: d.metaOmschrijving, alternates: { canonical: `https://animideo.com/${d.id}` }, openGraph: { title: d.metaTitel, description: d.metaOmschrijving, url: `https://animideo.com/${d.id}`, siteName: "Animideo", locale: "nl_NL" } };
}

export default async function LandingPagina({ params }: { params: Promise<{ doelgroep: string }> }) {
  const d = DOELGROEPEN[(await params).doelgroep as DoelgroepId];
  if (!d) notFound();
  return (
    <>
      <Kop bron={d.id} />
      <main>
        <Held d={d} />
        <Stappen d={d} />
        <Voorbeelden d={d} />
        <Prijzen d={d} bron={d.id} />
        <Support />
        <VragenBlok vragen={d.vragen} />
        <Slot bron={d.id} />
      </main>
      <Voet />
    </>
  );
}
