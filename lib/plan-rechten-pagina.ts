// Het pakket van wie de pagina bekijkt, voor de sloten in beeld (server-componenten).

import { createClient } from "@/lib/supabase/server";
import { planVan } from "@/lib/plan-rechten-server";
import type { Plan } from "@/lib/plan-rechten";

export async function mijnPlan(): Promise<Plan> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? planVan(user.id) : "free";
}
