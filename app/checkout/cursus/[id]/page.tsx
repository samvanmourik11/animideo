import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import PayButton from "./PayButton";

export default async function CursusCheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: pending } = await supabase
    .from("pending_checkouts")
    .select("id, email, status, is_cursus")
    .eq("id", id)
    .single();

  const notFound = !pending || !pending.is_cursus;
  const alreadyUsed = !!pending && pending.status !== "pending";

  return (
    <div
      className="min-h-screen bg-vlak flex items-start sm:items-center justify-center px-4 py-8"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.15) 0%, transparent 70%)" }}
    >
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-tekst-3 hover:text-tekst transition-colors mb-8">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7-7 7 7 7" />
          </svg>
          Terug
        </Link>

        {notFound && (
          <div className="bg-paneel border border-red-200 rounded-2xl p-6">
            <h1 className="text-xl font-bold text-tekst mb-2">Link niet geldig</h1>
            <p className="text-sm text-tekst-3">
              Deze betaallink bestaat niet of is ongeldig. Neem contact op als je denkt dat dit een fout is.
            </p>
          </div>
        )}

        {!notFound && alreadyUsed && (
          <div className="bg-paneel border border-amber-200 rounded-2xl p-6">
            <h1 className="text-xl font-bold text-tekst mb-2">Link al gebruikt</h1>
            <p className="text-sm text-tekst-3">
              Deze betaallink is al een keer gebruikt. Heb je vragen over je abonnement?
              Mail naar <a href="mailto:sam@jouwanimatievideo.nl" className="text-blue-600">sam@jouwanimatievideo.nl</a>.
            </p>
          </div>
        )}

        {!notFound && !alreadyUsed && (
          <>
            <div className="rounded-2xl border border-blue-200 p-5 mb-6 bg-blue-50">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Cursusaanbod</p>
              <p className="text-2xl font-black text-tekst mb-1">Eerste maand €1</p>
              <p className="text-sm text-tekst-2">Daarna €49/maand · Maandelijks opzegbaar</p>
            </div>

            <div className="bg-paneel border border-rand rounded-2xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
              <h1 className="text-xl font-bold text-tekst mb-1">Animideo Starter</h1>
              <p className="text-sm text-tekst-3 mb-4">Voor: <span className="text-tekst">{pending!.email}</span></p>

              <ul className="text-sm text-tekst-2 space-y-2 mb-6">
                <li className="flex gap-2"><span className="text-blue-600">✓</span> 500 credits per maand</li>
                <li className="flex gap-2"><span className="text-blue-600">✓</span> Geen watermark</li>
                <li className="flex gap-2"><span className="text-blue-600">✓</span> Brand kit</li>
                <li className="flex gap-2"><span className="text-blue-600">✓</span> E-mail support</li>
              </ul>

              <PayButton id={pending!.id} />

              <p className="text-xs text-tekst-3 text-center mt-4">
                Beveiligd via Mollie · iDEAL / SEPA · Eerste maand €1, daarna €49/maand
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
