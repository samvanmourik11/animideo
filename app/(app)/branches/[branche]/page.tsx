import Link from "next/link";
import { notFound } from "next/navigation";
import { branche as zoekBranche, recept, sjablonen } from "@/lib/creaties/recepten";
import ReceptTegel from "@/components/creaties/ReceptTegel";
import ReclameTegel from "@/components/reclame/ReclameTegel";

export async function generateMetadata({ params }: { params: Promise<{ branche: string }> }) {
  const b = zoekBranche((await params).branche);
  return { title: b ? `${b.naam} · Animideo` : "Animideo" };
}

// Algemene apps die elke branche goed kan gebruiken; die staan onder de sjablonen, zodat
// een makelaar ze niet eerst tussen de grappige effecten hoeft te zoeken.
const OOK_HANDIG = ["profielfoto", "productfoto", "billboard"];

export default async function BranchePagina({ params }: { params: Promise<{ branche: string }> }) {
  const b = zoekBranche((await params).branche);
  if (!b) notFound();
  return (
    <div className="space-y-10">
      <div>
        <Link href="/branches" className="text-xs text-blue-500 hover:text-blue-400">← Alle branches</Link>
        <h1 className="mt-2 text-3xl font-extrabold text-tekst tracking-tight">{b.icoon} {b.naam}</h1>
        <p className="text-tekst-3 mt-1">{b.uitleg}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {sjablonen(b.id).map((r) => <ReceptTegel key={r.id} recept={r} />)}
      </div>
      <section>
        <h2 className="text-lg font-bold text-tekst">Ook handig</h2>
        <p className="text-sm text-tekst-3 mb-3">Apps die in elk vak van pas komen.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <ReclameTegel />
          {OOK_HANDIG.map((id) => recept(id)).filter((r) => !!r).map((r) => <ReceptTegel key={r!.id} recept={r!} />)}
        </div>
      </section>
    </div>
  );
}
