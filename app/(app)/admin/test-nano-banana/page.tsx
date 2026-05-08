import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TestForm from "./TestForm";

export default async function TestNanoBananaPage() {
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
        <h1 className="text-2xl font-bold text-white mb-1">Nano Banana Pro test</h1>
        <p className="text-sm text-slate-400">
          Simuleer de productie-flow: upload optioneel een style en character reference, vul 1
          tot 6 scenes in en genereer alles in 1 keer met dezelfde anchors. Zo zie je hoe
          consistent stijl en character blijven over een hele video.
        </p>
      </div>
      <TestForm />
    </div>
  );
}
