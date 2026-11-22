// Mails bij een motion- of docu-video (verbeterplan idee 02, 16-11-2026):
//   "afmaken" — het werk op de server is klaar, maar de studio staat niet open om de video in
//               de browser af te maken (zie app/api/cron/motion)
//   "klaar"   — de video staat in de studio
// Alleen als de klant "Mail me" aan had staan (invoer.mail).
import { createServiceClient } from "@/lib/supabase/service";
import type { Creatie } from "@/lib/creaties/types";

const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";

function ontsnap(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function videoMail(soort: "afmaken" | "klaar", titel: string, studio: string, link: string) {
  const onderwerp = soort === "klaar" ? `Je video is klaar: ${titel}` : `Je video is bijna klaar: open de ${studio}`;
  const zin =
    soort === "klaar"
      ? `Je video "${titel}" staat klaar in de ${studio}. Je kunt hem bekijken, downloaden of aanpassen.`
      : `Het script, de stem en de animatie van "${titel}" zijn klaar. De laatste stap gebeurt in je eigen browser: open de ${studio} en laat dat tabblad open tot de video klaar is (meestal een paar minuten).`;
  const knop = soort === "klaar" ? "Bekijk je video" : `Open de ${studio}`;
  const tekst = `${zin}\n\n${knop}: ${link}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">${ontsnap(onderwerp)}</h2>
<p>${ontsnap(zin)}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${ontsnap(knop)}</a></p></div>`;
  return { onderwerp, tekst, html };
}

/** Stuurt de mail; geeft true als hij weg is. Faalt nooit hard. */
export async function mailVideo(c: Creatie, soort: "afmaken" | "klaar"): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const { data: u } = await createServiceClient().auth.admin.getUserById(c.user_id);
    const aan = u.user?.email;
    if (!aan) return false;
    const docu = c.maker === "docu";
    const plan = (c.invoer as { plan?: { titel?: string } }).plan;
    const titel = (plan?.titel || c.prompt || "je video").replace(/^(Motion graphics|Docu|Short):\s*/, "").slice(0, 80);
    const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.animideo.com").replace(/\/$/, "")}/studios/${docu ? "docu" : "motion"}`;
    const m = videoMail(soort, titel, docu ? "Docu-studio" : "Motion graphics-studio", link);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: AFZENDER, to: [aan], subject: m.onderwerp, text: m.tekst, html: m.html }),
    });
    if (!res.ok) console.error("[motion] mail mislukt:", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error("[motion] mail mislukt:", e instanceof Error ? e.message : e);
    return false;
  }
}
