import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseStudio } from "@/lib/studio/access";
import { BrandKit } from "@/lib/types";
import InfographicCreateForm from "@/components/infographics/InfographicCreateForm";

export default async function InfographicNewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Tijdelijk: nieuwe tool nog niet live voor iedereen (soft-launch).
  if (!canUseStudio(user.email)) redirect("/dashboard");

  const { data: brandKits } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
            infographic
          </span>
          <h1 className="text-2xl font-bold text-white">Nieuwe infographic</h1>
        </div>
        <p className="text-sm text-slate-400">
          Maak een strakke, zakelijke infographic met data, cijfers en grafieken. Geen
          animatie of poppetjes, puur heldere informatie. Plak je tekst of data en de AI
          bouwt er een gestructureerde infographic van die je daarna kunt fijnslijpen.
        </p>
      </div>
      <InfographicCreateForm userId={user.id} brandKits={(brandKits ?? []) as BrandKit[]} />
    </div>
  );
}
