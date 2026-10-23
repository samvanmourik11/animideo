// De mail "er staan posts voor je klaar om te keuren". Eén mail per kalender per ronde,
// met alle nieuwe posts erin; daarna staan ze op 'gemeld' en komt er geen tweede.

import { createServiceClient } from "@/lib/supabase/service";

const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";
const ZONE = "Europe/Amsterdam";

function ontsnap(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function keurMail(titel: string, posts: { gepland_op: string; idee: string }[], link: string) {
  const regels = posts.map((p) => {
    const wanneer = new Intl.DateTimeFormat("nl-NL", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(p.gepland_op));
    return { wanneer, idee: p.idee };
  });
  const n = posts.length;
  const onderwerp = `${n} ${n === 1 ? "post staat" : "posts staan"} klaar om te keuren: ${titel}`;
  const tekst = `Voor je contentkalender "${titel}" ${n === 1 ? "staat een nieuwe post" : `staan ${n} nieuwe posts`} klaar. Ze gaan pas online als jij ze goedkeurt:\n\n${regels.map((r) => `- ${r.wanneer}: ${r.idee}`).join("\n")}\n\nBekijk en keur ze: ${link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">${ontsnap(onderwerp)}</h2>
<p>Ze gaan pas online als jij ze goedkeurt.</p>
<ul style="padding-left:18px">${regels.map((r) => `<li style="margin:6px 0"><strong>${ontsnap(r.wanneer)}</strong><br>${ontsnap(r.idee)}</li>`).join("")}</ul>
<p style="margin:24px 0"><a href="${link}" style="background:#1c72ed;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Bekijk en keur</a></p>
<p style="font-size:13px;color:#64748b">Liever niet elke keer keuren? Zet de kalender op "gewoon plaatsen".</p></div>`;
  return { onderwerp, tekst, html };
}

/** Mailt per kalender de posts die sinds de vorige keer klaar zijn om te keuren. */
export async function meldTeKeuren(): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 0;
  const db = createServiceClient();
  const { data } = await db.from("content_posts").select("id, kalender_id, user_id, gepland_op, idee").eq("status", "te_keuren").eq("gemeld", false).order("gepland_op").limit(200);
  const perKalender = new Map<string, NonNullable<typeof data>>();
  for (const p of data ?? []) perKalender.set(p.kalender_id, [...(perKalender.get(p.kalender_id) ?? []), p]);
  let verstuurd = 0;
  for (const [kalenderId, posts] of perKalender) {
    // Eerst vastleggen: twee rondes tegelijk mogen niet twee mails sturen.
    const { data: ik } = await db.from("content_posts").update({ gemeld: true }).in("id", posts.map((p) => p.id)).eq("gemeld", false).select("id");
    const mijn = posts.filter((p) => ik?.some((x) => x.id === p.id));
    if (!mijn.length) continue;
    const [{ data: k }, { data: u }] = await Promise.all([
      db.from("content_kalenders").select("titel").eq("id", kalenderId).maybeSingle(),
      db.auth.admin.getUserById(mijn[0].user_id),
    ]);
    if (!u.user?.email) continue;
    const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.jouwanimatievideo.nl").replace(/\/$/, "")}/studios/social/${kalenderId}`;
    const m = keurMail(k?.titel ?? "je contentkalender", mijn, link);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: AFZENDER, to: [u.user.email], subject: m.onderwerp, text: m.tekst, html: m.html }),
    });
    if (res.ok) verstuurd++;
    else console.error("[social] keur-mail mislukt:", res.status, (await res.text().catch(() => "")).slice(0, 200));
  }
  return verstuurd;
}
