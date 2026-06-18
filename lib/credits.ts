import { createClient } from "@/lib/supabase/server";

/** Accounts that never consume credits — for internal testing & demos. */
const UNLIMITED_ACCOUNTS = new Set([
  "sam@jouwanimatievideo.nl",
  "alyssa@jouwanimatievideo.nl",
  "nohaila@jouwanimatievideo.nl",
]);

// Credit-tarieven, bewust GEHALVEERD t.o.v. de oude prijzen (2026-06-18) zodat een
// credit-bundel veel langer meegaat — vooral video/animatie ging te hard. We laten
// hiermee de oude "~$0,025 per credit"-cap los (500 credits kan nu boven ~$12,50
// aan API-kosten uitkomen); de aanname is dat lang niet iedereen al z'n credits
// gebruikt. Bedragen tussen haakjes zijn de echte providerkosten per call.
// Credits zijn hele getallen (INTEGER), dus posten van 1 blijven 1 (minimum).
export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1, // GPT-4o tekst: script, analyses, infographic-spec, AI-regisseur (~$0,02-0,04) — al minimaal, blijft 1
  IMAGE_GENERATION: 1,  // Nano Banana (niet-Pro): beeld genereren/bewerken/karakter (~$0,039)
  VOICE: 2,             // ElevenLabs v3 voice-over (~$0,10)
  UPSCALE: 1,           // Clarity upscaler (~$0,04)
  INPAINT: 1,           // Flux Pro Fill inpainting (~$0,05)
  VIDEO_GENERATION: 5,  // Seedance Lite 5s 720p (~$0,18) — grootste kostenpost, gehalveerd van 10
  MUSIC: 1,             // CassetteAI muziekbed (~$0,02/min) — al minimaal, blijft 1
  SYNC: 1,              // Whisper word-timestamps voor autosync (~$0,01) — al minimaal, blijft 1
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
  name: string | null;
  credits: number;
  plan: string;
  mollie_customer_id: string | null;
  mollie_subscription_id: string | null;
  subscription_status: string | null;
  credits_reset_date: string | null;
  hide_leren: boolean;
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

  return (created ?? { id: userId, credits: 100, plan: "free", email: null, name: null,
    mollie_customer_id: null, mollie_subscription_id: null,
    subscription_status: "active", credits_reset_date: null, hide_leren: false,
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

  // Unlimited accounts: skip deduction entirely
  if (profile.email && UNLIMITED_ACCOUNTS.has(profile.email)) {
    return { success: true, credits: profile.credits };
  }

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
