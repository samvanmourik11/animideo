import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import Zijbalk from "@/components/app-shell/Zijbalk";
import Inhoud from "@/components/app-shell/Inhoud";
import { leesThema, THEMA_COOKIE, THEMA_ID } from "@/components/app-shell/thema";
import { getProfile } from "@/lib/credits";
import AchterstandBalk from "@/components/AchterstandBalk";

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

  const [profile, cookieStore] = await Promise.all([getProfile(user.id), cookies()]);
  const thema = leesThema(cookieStore.get(THEMA_COOKIE)?.value);

  return (
    <div id={THEMA_ID} data-thema={thema} className="min-h-screen bg-vlak text-tekst">
      <Zijbalk
        email={user.email ?? ""}
        credits={profile.credits}
        plan={profile.plan}
        creditsResetDate={profile.credits_reset_date}
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
