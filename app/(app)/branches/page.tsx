import Link from "next/link";
import { BRANCHES, sjablonen } from "@/lib/creaties/recepten";

export const metadata = { title: "Voor jouw branche · Animideo" };

// Sjablonen per branche (fase 4): niet "wat kan de AI", maar "wat heb ík nodig als
// makelaar of zorgorganisatie". Zelfde receptenboek eronder.
export default function BranchesPagina() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">💼 Voor jouw branche</h1>
        <p className="text-tekst-3 mt-1">Kant-en-klare sjablonen voor wat jouw vak elke week nodig heeft. Kies je branche.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BRANCHES.map((b) => (
          <Link
            key={b.id}
            href={`/branches/${b.id}`}
            className={`rounded-3xl p-5 bg-paneel bg-gradient-to-br ${b.kleur} to-transparent border border-rand hover:border-blue-500/50 hover:-translate-y-0.5 transition-all`}
          >
            <div className="text-3xl">{b.icoon}</div>
            <h2 className="mt-3 text-lg font-bold text-tekst">{b.naam}</h2>
            <p className="text-sm text-tekst-2 mt-1">{b.uitleg}</p>
            <p className="text-xs text-tekst-3 mt-3">{sjablonen(b.id).length} sjablonen →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
