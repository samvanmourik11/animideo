// Eenmalig support-script: inspecteer het project + de geëxporteerde video van
// een klant om de export-bug te diagnosticeren. Print GEEN secrets.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.argv[2] || "melbachiri@ziggo.nl";

// 1. Vind de gebruiker op e-mail.
let userId = null;
for (let page = 1; page <= 20 && !userId; page++) {
  const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("listUsers error:", error.message); break; }
  const u = data.users.find((x) => (x.email || "").toLowerCase() === EMAIL.toLowerCase());
  if (u) userId = u.id;
  if (data.users.length < 200) break;
}
if (!userId) { console.error("Gebruiker niet gevonden:", EMAIL); process.exit(1); }
console.log("user_id:", userId);

// 2. Projecten van die gebruiker, nieuwste eerst.
const { data: projects, error: pErr } = await supa
  .from("projects")
  .select("id, title, mode, format, status, video_url, voice_audio_url, bg_music_url, scenes, updated_at")
  .eq("user_id", userId)
  .order("updated_at", { ascending: false })
  .limit(5);
if (pErr) { console.error("projects error:", pErr.message); process.exit(1); }

console.log(`\n${projects.length} recente projecten:\n`);
for (const p of projects) {
  const scenes = Array.isArray(p.scenes) ? p.scenes : [];
  const withVideo = scenes.filter((s) => s && s.video_url);
  console.log(`── ${p.title} (${p.id})`);
  console.log(`   mode=${p.mode} format=${p.format} status=${p.status} updated=${p.updated_at}`);
  console.log(`   scenes: ${scenes.length} totaal, ${withVideo.length} met video_url`);
  console.log(`   voice_audio_url: ${p.voice_audio_url ? "JA" : "nee"} | bg_music: ${p.bg_music_url ? "JA" : "nee"}`);
  console.log(`   geexporteerde video_url: ${p.video_url ? p.video_url.slice(0, 120) : "(geen)"}`);
  if (p.video_url) console.log(`   FULL_URL ${p.id} ${p.video_url}`);
  if (withVideo.length) {
    console.log("   per scene (idx: duration | transition_out | video?):");
    scenes.forEach((s, i) => {
      console.log(`     ${i}: dur=${s?.duration ?? "?"} trans=${s?.transition_out ?? "(default cut)"} video=${s?.video_url ? "ja" : "NEE"}`);
    });
  }
  console.log("");
}
