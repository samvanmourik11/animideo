import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExplainerCreateForm from "@/components/explainer/ExplainerCreateForm";

export default async function ExplainerNewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
            explainer
          </span>
          <h1 className="text-2xl font-bold text-white">Nieuwe explainer-video</h1>
        </div>
        <p className="text-sm text-slate-400">
          Een flat animated explainer-video met iconen, beweging en ingesproken voice-over,
          zonder cartoon-poppetjes. Plak je info of script en de AI bouwt er scenes van die je
          daarna kunt previewen en exporteren.
        </p>
      </div>
      <ExplainerCreateForm userId={user.id} />
    </div>
  );
}
