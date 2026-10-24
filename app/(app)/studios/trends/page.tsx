import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import { liveTrends, teKeuren } from "@/lib/trends/lijst";
import TrendTegel from "@/components/trends/TrendTegel";

export const metadata = { title: "Trends · Animideo" };
export const dynamic = "force-dynamic";

// De Trends-studio: wat er nu viral gaat, en met één foto zelf namaken. Elke ochtend zoekt
// Claude nieuwe trends; ze staan hier pas als Sam ze heeft goedgekeurd.
export default async function TrendsStudio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const beheer = isAdminAccount(user.email);
  const [{ nu, klassiekers }, voorstellen] = await Promise.all([liveTrends(), beheer ? teKeuren() : Promise.resolve([])]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-tekst-3">Studio</div>
          <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🔥 Trends</h1>
          <p className="text-sm text-tekst-2 mt-1 max-w-xl">
            Wat er nu viral gaat op TikTok, Instagram en YouTube — en dat maak je hier met je eigen foto na. Elke dag komen er nieuwe bij.
          </p>
        </div>
        {beheer && (
          <Link href="/admin/trends" className="n-knop2 text-sm self-start sm:self-auto">Trends keuren →</Link>
        )}
      </div>

      {voorstellen.length > 0 && (
        <section className="rounded-3xl border border-dashed border-amber-500/50 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-3">Nog te keuren — alleen jij ziet deze rij ({voorstellen.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {voorstellen.map((t) => <TrendTegel key={t.id} trend={t} vers />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-tekst-2 mb-3">Nu viral</h2>
        {nu.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
            <div className="text-4xl mb-3">🔥</div>
            Er staan nog geen nieuwe trends klaar. Kom morgen terug: we zoeken elke ochtend wat er viral gaat.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {nu.map((t) => <TrendTegel key={t.id} trend={t} vers />)}
          </div>
        )}
      </section>

      {klassiekers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-tekst-2 mb-3">Eerder viral</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {klassiekers.map((t) => <TrendTegel key={t.id} trend={t} />)}
          </div>
        </section>
      )}
    </div>
  );
}
