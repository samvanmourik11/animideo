import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import LerenAccessForm from "./LerenAccessForm";

export default async function AdminLerenToegangPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/dashboard");

  // Service-client: lijst van klanten waarvoor Leren nu verborgen is.
  const service = createServiceClient();
  const { data: hidden } = await service
    .from("profiles")
    .select("email")
    .eq("hide_leren", true)
    .order("email");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Leren-toegang</h1>
        <p className="text-sm text-slate-400">
          Verberg de e-learning voor klanten die de cursus al apart kochten. Zij zien de
          &quot;Leren&quot;-omgeving dan niet meer in de navigatie en kunnen de pagina&apos;s ook
          niet via de URL openen.
        </p>
      </div>

      <LerenAccessForm />

      <div className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Nu verborgen ({hidden?.length ?? 0})
        </p>
        {hidden && hidden.length > 0 ? (
          <ul className="space-y-1.5">
            {hidden.map((p) => (
              <li key={p.email} className="text-sm text-slate-300">{p.email}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Voor niemand verborgen.</p>
        )}
      </div>
    </div>
  );
}
