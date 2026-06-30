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

// Usage: node restore-credits.mjs <userId> <targetCredits> [reason]
const userId = process.argv[2];
const target = Number(process.argv[3]);
const reason = process.argv[4] ?? "Goodwill: credits hersteld via support";
if (!userId || !Number.isFinite(target)) {
  throw new Error("Usage: node restore-credits.mjs <userId> <targetCredits> [reason]");
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: before, error: readErr } = await admin
  .from("profiles")
  .select("id, email, plan, credits")
  .eq("id", userId)
  .maybeSingle();

if (readErr) throw readErr;
if (!before) {
  console.error(`No profile found for id ${userId}.`);
  process.exit(1);
}

console.log("Before:", before);

if (before.credits === target) {
  console.log(`Credits are already ${target}. Nothing to do.`);
  process.exit(0);
}

const { data: after, error: updErr } = await admin
  .from("profiles")
  .update({ credits: target })
  .eq("id", before.id)
  .select("id, email, plan, credits")
  .single();

if (updErr) throw updErr;

await admin.from("credit_transactions").insert({
  user_id: before.id,
  amount: target - before.credits,
  reason,
});

console.log("After:", after);
console.log("Done.");
