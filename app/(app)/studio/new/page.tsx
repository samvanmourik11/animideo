import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudioCreateTabs from "./StudioCreateTabs";
import { BrandKit, Character } from "@/lib/types";

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

  const [{ data: brandKits }, { data: characters }] = await Promise.all([
    supabase
      .from("brand_kits")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("characters")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">Karakter Studio</h1>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">beta</span>
        </div>
        <p className="text-sm text-slate-400">
          Bouw je karakters één keer en hergebruik ze in elk project. Kies per
          project een hoofd- en bijpersoon, of laat AI er een verzinnen.
        </p>
      </div>
      <StudioCreateTabs
        userId={user.id}
        brandKits={(brandKits ?? []) as BrandKit[]}
        characters={(characters ?? []) as Character[]}
      />
    </div>
  );
}
