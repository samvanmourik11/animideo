import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { BrandKit } from "@/lib/types";
import BrandKitEditor from "@/components/brand/BrandKitEditor";

export default async function EditBrandKitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: kit } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!kit) notFound();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Huisstijl bewerken</h1>
        <p className="text-sm text-slate-500 mt-0.5">{kit.name}</p>
      </div>
      <BrandKitEditor initial={kit as BrandKit} userId={user!.id} />
    </div>
  );
}
