import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";

// Adres waar nieuwe support-tickets binnenkomen.
const TICKET_INBOX = "ticket@jouwanimatievideo.nl";
// Afzender. Moet op een in Resend geverifieerd domein zitten.
const TICKET_FROM = "JouwAnimatieVideo A.I. Support <noreply@jouwanimatievideo.nl>";

const CATEGORIES = [
  "Vraag over gebruik",
  "Bug of technisch probleem",
  "Facturering en abonnement",
  "Idee of feedback",
  "Anders",
];

/** Escape user input before het in de HTML-mail belandt. */
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY ontbreekt — support-mail kan niet verstuurd worden.");
    return NextResponse.json({ error: "E-mail is niet geconfigureerd." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as {
    category?: string;
    subject?: string;
    message?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });

  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const category = CATEGORIES.includes(body.category ?? "")
    ? (body.category as string)
    : "Anders";

  if (subject.length < 3 || subject.length > 200) {
    return NextResponse.json(
      { error: "Geef een onderwerp van 3 tot 200 tekens op." },
      { status: 400 }
    );
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json(
      { error: "Geef een bericht van minimaal 10 tekens op." },
      { status: 400 }
    );
  }

  // Plan meesturen als context. Mag nooit hard falen.
  let plan = "onbekend";
  try {
    plan = (await getProfile(user.id)).plan;
  } catch {
    // plan blijft "onbekend"
  }

  const email = user.email ?? "onbekend";
  const verzonden = new Date().toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });

  const text =
    `Nieuw support-ticket via JouwAnimatieVideo A.I.\n\n` +
    `Van: ${email}\n` +
    `Plan: ${plan}\n` +
    `Categorie: ${category}\n` +
    `Onderwerp: ${subject}\n` +
    `Verzonden: ${verzonden}\n` +
    `User ID: ${user.id}\n\n` +
    `Bericht:\n${message}\n`;

  const html =
    `<h2>Nieuw support-ticket</h2>` +
    `<p>` +
    `<strong>Van:</strong> ${esc(email)}<br>` +
    `<strong>Plan:</strong> ${esc(plan)}<br>` +
    `<strong>Categorie:</strong> ${esc(category)}<br>` +
    `<strong>Onderwerp:</strong> ${esc(subject)}<br>` +
    `<strong>Verzonden:</strong> ${esc(verzonden)}<br>` +
    `<strong>User ID:</strong> ${esc(user.id)}` +
    `</p>` +
    `<p><strong>Bericht:</strong></p>` +
    `<p style="white-space:pre-wrap">${esc(message)}</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: TICKET_FROM,
      to: [TICKET_INBOX],
      // Antwoorden op het ticket gaan rechtstreeks naar de klant.
      reply_to: email,
      subject: `[Support] ${subject}`,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend support-mail mislukt:", res.status, detail);
    return NextResponse.json(
      { error: "Versturen mislukt. Probeer het later opnieuw." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
