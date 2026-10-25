// Het pakket van een gebruiker opzoeken (server). In een team telt het pakket van de
// eigenaar; onze eigen accounts mogen alles.

import { createServiceClient } from "@/lib/supabase/service";
import { isTeamAccount } from "@/lib/studio/access";
import { betalerVan } from "@/lib/team/team";
import { alsPlan, mag, PlanFout, upgradeTekst, type Plan, type Recht } from "@/lib/plan-rechten";

export async function planVan(userId: string): Promise<Plan> {
  const eigenaar = await betalerVan(userId);
  const { data } = await createServiceClient().from("profiles").select("plan, email, is_admin").eq("id", eigenaar).maybeSingle();
  if (!data) return "free";
  if (data.is_admin || isTeamAccount(data.email) || data.email?.toLowerCase().endsWith("@jouwanimatievideo.nl")) return "agency";
  return alsPlan(data.plan);
}

export async function magGebruiker(userId: string, recht: Recht): Promise<boolean> {
  return mag(await planVan(userId), recht);
}

/** Gooit een PlanFout (403) als het niet in het pakket zit. */
export async function eis(userId: string, recht: Recht): Promise<void> {
  if (!(await magGebruiker(userId, recht))) throw new PlanFout(recht, upgradeTekst(recht));
}
