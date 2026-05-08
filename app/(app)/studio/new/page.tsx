import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateForm from "./CreateForm";

export default async function StudioNewPage() {
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
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">Karakter Studio</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">beta</span>
        </div>
        <p className="text-sm text-slate-400">
          Beschrijf je idee en upload optioneel een style reference of character. Die anchors
          worden in elke scene meegestuurd zodat karakter en stijl door het hele verhaal
          consistent blijven.
        </p>
      </div>
      <CreateForm userId={user.id} />
    </div>
  );
}
