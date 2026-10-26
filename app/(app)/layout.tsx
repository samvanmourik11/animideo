import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Zijbalk from "@/components/app-shell/Zijbalk";
import Inhoud from "@/components/app-shell/Inhoud";
import { leesThema, THEMA_COOKIE, THEMA_ID } from "@/components/app-shell/thema";
import { getProfile } from "@/lib/credits";
import { betalerVan } from "@/lib/team/team";
import AchterstandBalk from "@/components/AchterstandBalk";
import PendingCheckoutHandler from "@/components/PendingCheckoutHandler";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile, cookieStore, betaler] = await Promise.all([getProfile(user.id), cookies(), betalerVan(user.id)]);
  // Teamlid: in het menu staat de gedeelde pot (en het plan) van de eigenaar.
  const pot = betaler === user.id ? profile : await getProfile(betaler, { service: true });
  const thema = leesThema(cookieStore.get(THEMA_COOKIE)?.value);

  return (
    <div id={THEMA_ID} data-thema={thema} className="min-h-screen bg-vlak text-tekst">
      {/* Koppelt een betaling van vóór het account (€1, gratis week, traject) aan het account.
          Stond op /dashboard, maar nieuwe klanten komen nu op /welkom en terugkerende op
          /ontdek uit; hier draait hij op welke pagina iemand ook binnenkomt. */}
      <PendingCheckoutHandler userId={user.id} userEmail={user.email ?? ""} />
      <Zijbalk
        email={user.email ?? ""}
        credits={pot.credits}
        plan={pot.plan}
        creditsResetDate={pot.credits_reset_date}
        hideLeren={profile.hide_leren}
        thema={thema}
      />
      <div className="md:pl-60">
        {profile.achterstand_sinds ? (
          <div data-thema="donker">
            <AchterstandBalk userId={user.id} />
          </div>
        ) : null}
        <Inhoud>{children}</Inhoud>
      </div>
    </div>
  );
}
