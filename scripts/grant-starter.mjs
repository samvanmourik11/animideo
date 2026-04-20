import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE env vars in .env.local");

const targetEmail = process.argv[2];
const targetPlan = process.argv[3] ?? "starter";
if (!targetEmail) throw new Error("Usage: node grant-starter.mjs <email> [plan]");

const PLAN_CREDITS = { free: 100, starter: 500, pro: 1500, agency: 5000 };
const credits = PLAN_CREDITS[targetPlan];
if (credits === undefined) throw new Error(`Unknown plan: ${targetPlan}`);

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: before, error: readErr } = await admin
  .from("profiles")
  .select("id, email, plan, credits, credits_reset_date")
  .eq("email", targetEmail)
  .maybeSingle();

if (readErr) throw readErr;
if (!before) {
  console.error(`No profile found for ${targetEmail}. User must sign up first.`);
  process.exit(1);
}

console.log("Before:", before);

const resetDate = new Date();
resetDate.setMonth(resetDate.getMonth() + 1);

const { data: after, error: updErr } = await admin
  .from("profiles")
  .update({
    plan: targetPlan,
    credits,
    subscription_status: "active",
    credits_reset_date: resetDate.toISOString(),
  })
  .eq("id", before.id)
  .select("id, email, plan, credits, credits_reset_date, subscription_status")
  .single();

if (updErr) throw updErr;

await admin.from("credit_transactions").insert({
  user_id: before.id,
  amount: credits - before.credits,
  reason: `Admin grant: ${targetPlan} plan`,
});

console.log("After:", after);
console.log("Done.");
