import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// De oude uitlegvideo's stonden op Dailymotion en speelden niet meer af: sinds
// oktober 2026 weigert Dailymotion de algemene insluitspeler ("Forbidden") en
// een eigen speler kan alleen met een betaald Pro-account. De lessen gingen
// bovendien over tools die niet meer de kern zijn. Tot de nieuwe video's over de
// storytelling-infographic en de dialoogtool klaar zijn, staat hier een
// mededeling in plaats van een rij kapotte spelers. De vorige versie van deze
// pagina (met de lessenlijst) staat in de git-geschiedenis.
export default async function LerenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Klanten met de cursus afgeschermd: geen toegang tot de e-learning.
  const { data: profile } = await supabase
    .from("profiles")
    .select("hide_leren")
    .eq("id", user!.id)
    .single();
  if (profile?.hide_leren) redirect("/dashboard");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Leren</h1>
      </div>

      <div className="max-w-xl rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Nieuwe uitlegvideo&apos;s in de maak</h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">
          Er wordt gewerkt aan nieuwe uitlegvideo&apos;s, daarom is er momenteel niks te zien.
          De nieuwe leren-video&apos;s staan binnen 5 werkdagen live.
        </p>
      </div>
    </div>
  );
}
