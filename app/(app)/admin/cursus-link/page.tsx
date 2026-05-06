import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CursusLinkForm from "./CursusLinkForm";

export default async function AdminCursusLinkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Cursus betaallink</h1>
        <p className="text-sm text-slate-400">
          Genereer een unieke link voor cursus-klanten. Eerste maand €1, daarna €49/maand.
          Link werkt eenmalig.
        </p>
      </div>
      <CursusLinkForm />
    </div>
  );
}
