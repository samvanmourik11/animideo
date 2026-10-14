import { haalPost, openPostenVan } from "@/lib/achterstand";
import { datum, euro } from "@/lib/achterstand-mail";

// Betaalpagina uit de mail over een teruggeboekte incasso. Bewust een pagina met
// een knop en geen directe doorverwijzing naar Mollie: mailprogramma's openen
// links vooraf om ze te scannen, en dan zou elke mail een losse betaling maken.
// Geen inlog nodig — het id in de link is het enige wat de klant heeft.

export const dynamic = "force-dynamic";

export const metadata = { title: "Openstaand bedrag — JouwAnimatieVideo A.I.", robots: { index: false } };

function Kader({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060d1f] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-slate-300">{children}</div>
    </div>
  );
}

export default async function BetaalPagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ terug?: string; fout?: string }>;
}) {
  const { id } = await params;
  const { terug, fout } = await searchParams;
  const post = await haalPost(id);

  if (!post) {
    return (
      <Kader>
        <h1 className="text-xl font-bold text-white mb-2">Link niet gevonden</h1>
        <p className="text-sm">Deze betaallink klopt niet. Mail ons gerust via info@jouwanimatievideo.nl.</p>
      </Kader>
    );
  }

  const open = await openPostenVan(post);

  if (open.length === 0) {
    return (
      <Kader>
        <h1 className="text-xl font-bold text-white mb-2">Er staat niets meer open</h1>
        <p className="text-sm">
          {terug ? "Bedankt, uw betaling is ontvangen. " : ""}
          Uw account is weer volledig actief. U ontvangt een bevestiging per e-mail.
        </p>
        <a href="/dashboard" className="inline-block mt-5 text-sm font-semibold text-blue-400 underline">Naar mijn account</a>
      </Kader>
    );
  }

  const totaal = open.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <Kader>
      {terug ? (
        <p className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-200">
          We hebben uw betaling nog niet binnen. Is hij net gelukt? Ververs deze pagina over een minuut.
        </p>
      ) : null}
      {fout ? (
        <p className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-200">
          De betaling kon niet worden gestart. Probeer het opnieuw of mail info@jouwanimatievideo.nl.
        </p>
      ) : null}
      <h1 className="text-xl font-bold text-white mb-1">Openstaand bedrag</h1>
      <p className="text-sm mb-5">JouwAnimatieVideo A.I. · {post.email}</p>

      <ul className="divide-y divide-white/10 border-y border-white/10 text-sm mb-4">
        {open.map((p) => (
          <li key={p.id} className="flex justify-between py-2.5">
            <span>Teruggeboekte incasso van {datum(p.incasso_datum ?? p.created_at)}</span>
            <span className="text-white">{euro(Number(p.amount ?? 0))}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between font-semibold text-white mb-6">
        <span>Totaal</span>
        <span>{euro(totaal)}</span>
      </div>

      <form action={`/betalen/${post.id}/start`} method="post">
        <button type="submit" className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 font-semibold text-white">
          Betaal {euro(totaal)}
        </button>
      </form>
      <p className="text-xs text-slate-500 mt-4">
        Na betaling gaat uw account direct weer open en loopt uw abonnement gewoon door.
      </p>
    </Kader>
  );
}
