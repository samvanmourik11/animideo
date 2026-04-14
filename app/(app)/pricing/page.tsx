import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import PricingCards from "@/components/PricingCards";

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? await getProfile(user.id) : null;
  const currentPlan = profile?.plan ?? "free";

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Abonnementen</p>
        <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight">
          Kies jouw plan
        </h1>
        <p className="text-slate-400 text-lg max-w-lg mx-auto">
          Genereer professionele AI animatievideo&apos;s. Geen technische kennis nodig.
        </p>
      </div>

      <PricingCards currentPlan={currentPlan} />

      {/* Footer note */}
      <div className="mt-10 text-center space-y-2">
        <p className="text-sm text-slate-600">
          Alle prijzen zijn exclusief btw. Credits worden elke maand automatisch vernieuwd.
        </p>
        <p className="text-sm text-slate-600">
          💡 <strong className="text-slate-400">Jaarlijks betalen?</strong> Bespaar 20% — neem contact op via{" "}
          <a href="mailto:info@jouwanimatievideo.ai" className="text-blue-400 hover:text-blue-300 transition-colors">
            info@jouwanimatievideo.ai
          </a>
        </p>
      </div>
    </div>
  );
}
