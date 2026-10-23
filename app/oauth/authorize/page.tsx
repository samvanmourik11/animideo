import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { controleerAanvraag, OAuthFout } from "@/lib/mcp/oauth";

export const metadata = { title: "Verbinden met Animideo" };

// De toestemmingspagina: "Claude wil toegang tot je Animideo-account". Niet ingelogd? Dan
// eerst inloggen en daarna vanzelf terug hierheen (login kent ?volgende=).
export default async function Toestemming({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  let naam = "";
  let terugHost = "";
  let fout = "";
  try {
    const c = await controleerAanvraag(p);
    naam = c.naam;
    terugHost = new URL(p.redirect_uri!).host;
  } catch (e) {
    fout = e instanceof OAuthFout ? e.message : "Deze aanvraag klopt niet.";
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!fout && !user) {
    const hier = `/oauth/authorize?${new URLSearchParams(p as Record<string, string>).toString()}`;
    redirect(`/login?volgende=${encodeURIComponent(hier)}`);
  }

  const velden = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "resource"];
  return (
    <main className="min-h-screen flex items-center justify-center bg-vlak px-4">
      <div className="n-kaart max-w-md w-full space-y-4">
        <div className="text-2xl font-bold text-tekst">Animideo<span className="text-blue-500">.</span></div>
        {fout ? (
          <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-tekst">{naam} wil verbinden met je Animideo-account</h1>
            <p className="text-sm text-tekst-2">Ingelogd als <strong>{user!.email}</strong>. Als je toestaat, kan {naam}:</p>
            <ul className="text-sm text-tekst-2 list-disc pl-5 space-y-1">
              <li>beelden, video&apos;s, voice-overs en montages voor je maken, met je credits (altijd eerst met de prijs erbij);</li>
              <li>je bibliotheek, huisstijl en gekoppelde socialmedia-kanalen bekijken;</li>
              <li>contentkalenders en vaste taken voor je klaarzetten.</li>
            </ul>
            <p className="text-xs text-tekst-3">Je kunt de verbinding altijd verbreken onder &ldquo;Animideo in Claude&rdquo;. Na toestaan ga je terug naar {terugHost}.</p>
            <form method="post" action="/api/oauth/authorize" className="flex gap-2">
              {velden.map((v) => (p[v] ? <input key={v} type="hidden" name={v} value={p[v]} /> : null))}
              <button name="besluit" value="nee" className="n-knop2 flex-1">Weigeren</button>
              <button name="besluit" value="ja" className="btn-primary flex-1">Toestaan</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
