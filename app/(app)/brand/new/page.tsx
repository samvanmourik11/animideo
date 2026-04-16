import { createClient } from "@/lib/supabase/server";
import BrandKitEditor from "@/components/brand/BrandKitEditor";

export default async function NewBrandKitPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">Nieuwe huisstijl</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Upload sfeerbeelden en laat AI de huisstijl analyseren.
        </p>
      </div>
      <BrandKitEditor userId={user!.id} />
    </div>
  );
}
