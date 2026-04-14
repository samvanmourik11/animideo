import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import { getProfile } from "@/lib/credits";

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
    <div className="min-h-screen bg-gray-50">
      <NavBar
        email={user.email ?? ""}
        credits={profile.credits}
        plan={profile.plan}
        creditsResetDate={profile.credits_reset_date}
      />
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
