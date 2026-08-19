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

  // Licht, in tegenstelling tot de rest van de app: dit is een werkomgeving waar
  // je uren in leest en klikt, en dan wint contrast van sfeer. Het beeld zelf
  // houdt zijn eigen neutrale grijs eromheen, zodat je kleuren wel goed kunt
  // beoordelen.
  return (
    <div className="fixed inset-0 flex flex-col bg-white text-slate-900">
      {children}
    </div>
  );
}
