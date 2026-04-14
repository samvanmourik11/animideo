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
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Kies jouw abonnement</h1>
        <p className="text-gray-500 text-lg">
          Genereer professionele animatievideo&apos;s met AI. Geen technische kennis nodig.
        </p>
      </div>

      <PricingCards currentPlan={currentPlan} />

      <div className="mt-10 text-center space-y-2">
        <p className="text-sm text-gray-500">
          Alle prijzen zijn exclusief btw. Credits worden elke maand automatisch vernieuwd.
        </p>
        <p className="text-sm text-gray-500">
          💡 <strong>Jaarlijks betalen?</strong> Bespaar 20% — neem contact op via{" "}
          <a href="mailto:info@jouwanimatievideo.ai" className="text-blue-600 hover:underline">
            info@jouwanimatievideo.ai
          </a>
        </p>
      </div>
    </div>
  );
}
