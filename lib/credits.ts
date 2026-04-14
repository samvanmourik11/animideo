import { createClient } from "@/lib/supabase/server";

export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1,
  IMAGE_GENERATION: 1,
  RUNWAY_GENERATION: 5,
  EXPORT_HD: 2,
} as const;

export const PLAN_CREDITS: Record<string, number> = {
  free: 100,
  starter: 500,
  pro: 1500,
  agency: 5000,
};

export interface Profile {
  id: string;
  email: string | null;
  credits: number;
  plan: string;
  mollie_customer_id: string | null;
  mollie_subscription_id: string | null;
  subscription_status: string | null;
  credits_reset_date: string | null;
  created_at: string;
}

/** Fetch (or auto-create) the profile for a user. */
export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (data) return data as Profile;

  // Profile doesn't exist yet — create it
  const { data: created } = await supabase
    .from("profiles")
    .insert({ id: userId, credits: 100, plan: "free" })
    .select()
    .single();

  return (created ?? { id: userId, credits: 100, plan: "free", email: null,
    mollie_customer_id: null, mollie_subscription_id: null,
    subscription_status: "active", credits_reset_date: null,
    created_at: new Date().toISOString() }) as Profile;
}

/** Return current credit balance. */
export async function getCredits(userId: string): Promise<number> {
  const profile = await getProfile(userId);
  return profile.credits;
}

/**
 * Deduct credits atomically.
 * Returns { success: true } or { success: false, credits: currentBalance }.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; credits: number }> {
  const supabase = await createClient();

  const profile = await getProfile(userId);
  if (profile.credits < amount) {
    return { success: false, credits: profile.credits };
  }

  const newCredits = profile.credits - amount;

  const { error } = await supabase
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", userId);

  if (error) throw new Error("Kon credits niet aftrekken: " + error.message);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    reason,
  });

  return { success: true, credits: newCredits };
}

/** Add credits and log the transaction. */
export async function addCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<void> {
  const supabase = await createClient();

  const profile = await getProfile(userId);
  const newCredits = profile.credits + amount;

  await supabase
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    reason,
  });
}
