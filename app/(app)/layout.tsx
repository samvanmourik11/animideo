import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Zijbalk from "@/components/app-shell/Zijbalk";
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

  const profile = await getProfile(user.id);

  return (
    <div className="min-h-screen bg-[#060d1f]">
      <Zijbalk
        email={user.email ?? ""}
        credits={profile.credits}
        plan={profile.plan}
        creditsResetDate={profile.credits_reset_date}
        hideLeren={profile.hide_leren}
      />
      <div className="md:pl-60">
        {profile.achterstand_sinds ? <AchterstandBalk userId={user.id} /> : null}
        <main className="max-w-6xl mx-auto px-4 md:px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
