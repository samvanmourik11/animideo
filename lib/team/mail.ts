// De uitnodigingsmail. Mislukt het versturen, dan is dat geen ramp: de eigenaar ziet de
// link ook op de teampagina en kan hem zelf doorsturen (WhatsApp, Teams).

const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";

function ontsnap(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function mailUitnodiging(aan: string, o: { teamNaam: string; door: string; link: string }): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "RESEND_API_KEY ontbreekt";
  const text = `${o.door} nodigt je uit voor het team "${o.teamNaam}" op Animideo.\n\nJe maakt dan beelden en video's op de credits van het team, en je ziet elkaars werk.\n\nDoe mee: ${o.link}\n\nDe uitnodiging is 14 dagen geldig.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">Je bent uitgenodigd voor "${ontsnap(o.teamNaam)}"</h2>
<p>${ontsnap(o.door)} nodigt je uit voor het team op Animideo. Je maakt dan beelden en video's op de credits van het team, en je ziet elkaars werk.</p>
<p style="margin:24px 0"><a href="${o.link}" style="background:#1c72ed;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Doe mee met het team</a></p>
<p style="font-size:13px;color:#64748b">De uitnodiging is 14 dagen geldig.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AFZENDER, to: [aan], subject: `Uitnodiging: team "${o.teamNaam}" op Animideo`, text, html }),
  });
  if (res.ok) return null;
  return `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
}
