import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";

// Eigen full-screen layout, LOS van de (app)-groep. Geen NavBar en geen smalle
// max-width container: een editor heeft de hele viewport nodig. Auth en de
// allow-list worden hier afgedwongen, zodat de editor onzichtbaar blijft voor
// normale gebruikers tijdens de bouw.
export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!canUseEditor(user.email)) redirect("/dashboard");

  return (
    <div className="fixed inset-0 flex flex-col bg-[#060d1f] text-white">
      {children}
    </div>
  );
}
