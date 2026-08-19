// Chat-endpoint van de editor.
//
// De AI muteert de montage niet zelf: ze levert ops, wij valideren die met
// EditorCore tegen het document dat de client meestuurt, en streamen de
// goedgekeurde ops terug. De client past ze toe langs exact dezelfde weg als
// een muisklik (EditorStore.dispatch), dus er is één commandolaag, één
// undo-stapel en één geschiedenis.
//
// Waarom de client het document meestuurt: daar staat de actuele stand (de
// autosave loopt met een vertraging), en zo weten server en client zeker dat ze
// over dezelfde clips praten.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { canUseEditor } from "@/lib/editor/access";
import { applyOp } from "@/lib/editor/core/ops";
import { migrateTimeline, type TimelineDoc } from "@/lib/editor/timeline";
import { manifestAlsTekst, zoekInTekst } from "@/lib/editor/ai/manifest";
import { buildEditorPrompt } from "@/lib/editor/ai/prompt";
import { EDITOR_TOOLS, LEES_TOOLS, MAAK_TOOLS, toolCallNaarOp } from "@/lib/editor/ai/tools";
import { bepaalPlek, bewerkClipBeeld, breedteNaarSchaal, genereerElement, maakBeweging, pakFrame, pngFormaat } from "@/lib/editor/elements";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import type { Op } from "@/lib/editor/core/ops";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 300; // beeld genereren + opnieuw animeren duurt tot een minuut

// Hoe vaak het model achter elkaar gereedschap mag pakken. Genoeg voor "kijk
// eerst, pas dan aan" en een correctie na een weigering; niet zoveel dat een
// vastgelopen model minutenlang blijft draaien.
const MAX_RONDES = 5;

interface Body {
  projectId?: string;
  message?: string;
  doc?: TimelineDoc;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseEditor(user.email)) return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { projectId, message } = body;
  if (!projectId || !message?.trim() || !body.doc) {
    return NextResponse.json({ error: "projectId, message en doc vereist" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("editor_projects")
    .select("id, ratio")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  // Werkkopie op de server: hierop valideren we de ops, zodat het model bij een
  // reeks bewerkingen steeds de juiste tussenstand ziet.
  let doc = migrateTimeline(body.doc);

  const geschiedenis = (body.history ?? []).slice(-8);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildEditorPrompt({ manifest: manifestAlsTekst(doc), format: project.ratio as string }) },
    ...geschiedenis.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message.trim() },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch {}
      };

      try {
        let antwoord = "";

        for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            stream: true,
            temperature: 0.3, // montage is uitvoerend werk; verrassingen zijn hier geen deugd
            tools: EDITOR_TOOLS,
            tool_choice: "auto",
            parallel_tool_calls: false, // ops bouwen op elkaar voort, dus één voor één
            messages,
          });

          let tekst = "";
          const calls: { id: string; name: string; args: string }[] = [];

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              tekst += delta.content;
              emit({ type: "delta", text: delta.content });
            }
            for (const tc of delta.tool_calls ?? []) {
              const i = tc.index ?? 0;
              if (!calls[i]) calls[i] = { id: tc.id ?? `call_${i}`, name: "", args: "" };
              if (tc.id) calls[i].id = tc.id;
              if (tc.function?.name) calls[i].name = tc.function.name;
              if (tc.function?.arguments) calls[i].args += tc.function.arguments;
            }
          }

          antwoord += tekst;
          const echteCalls = calls.filter((c) => c?.name);
          if (echteCalls.length === 0) break; // niets meer te doen

          messages.push({
            role: "assistant",
            content: tekst || null,
            tool_calls: echteCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });

          for (const call of echteCalls) {
            let args: Record<string, unknown> = {};
            try { args = call.args ? JSON.parse(call.args) : {}; } catch { /* kapotte JSON = lege args */ }

            // Kijken kost geen versie en verandert niets.
            if (LEES_TOOLS.has(call.name)) {
              const antwoordTekst =
                call.name === "get_timeline_summary"
                  ? manifestAlsTekst(doc)
                  : formatTreffers(zoekInTekst(doc, String(args.query ?? "")));
              messages.push({ role: "tool", tool_call_id: call.id, content: antwoordTekst });
              continue;
            }

            // Tools die eerst iets moeten laten máken: die kosten credits en
            // tijd, dus we melden onderweg wat er gebeurt en leveren pas daarna
            // een op af.
            if (MAAK_TOOLS.has(call.name)) {
              const uitkomst = await voerMaakToolUit({
                naam: call.name,
                args,
                doc,
                supabase,
                userId: user.id,
                emit,
              });
              if (!uitkomst.ok) {
                messages.push({ role: "tool", tool_call_id: call.id, content: `Geweigerd: ${uitkomst.reden}` });
                emit({ type: "geweigerd", reden: uitkomst.reden });
                continue;
              }
              const res = applyOp(doc, uitkomst.op);
              if (!res.ok) {
                // Er is al beeld gemaakt en dus betaald. Wordt de op alsnog
                // geweigerd, dan heeft de klant niets gekregen — terugstorten.
                if (uitkomst.kosten) {
                  await addCredits(user.id, uitkomst.kosten, "Refund: bewerking niet toegepast").catch(() => {});
                }
                messages.push({ role: "tool", tool_call_id: call.id, content: `Geweigerd: ${res.error.message}` });
                emit({ type: "geweigerd", reden: res.error.message });
                continue;
              }
              doc = res.doc;
              emit({ type: "op", op: uitkomst.op, summary: uitkomst.summary ?? res.summary });
              messages.push({ role: "tool", tool_call_id: call.id, content: `Toegepast: ${uitkomst.summary ?? res.summary}` });
              continue;
            }

            const op = toolCallNaarOp(call.name, args);
            if (!op) {
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: "Geweigerd: die aanroep mist een veld of bevat een waarde die ik niet ken.",
              });
              continue;
            }

            const res = applyOp(doc, op);
            if (!res.ok) {
              // De reden gaat terug naar het model, zodat het zichzelf corrigeert
              // in plaats van dezelfde fout nog eens te maken.
              messages.push({ role: "tool", tool_call_id: call.id, content: `Geweigerd: ${res.error.message}` });
              emit({ type: "geweigerd", op, reden: res.error.message });
              continue;
            }

            doc = res.doc;
            emit({ type: "op", op, summary: res.summary });
            messages.push({ role: "tool", tool_call_id: call.id, content: `Toegepast: ${res.summary}` });
          }
        }

        emit({ type: "done", text: antwoord });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[editor-chat]", msg);
        emit({ type: "error", message: "Er ging iets mis bij het meedenken. Probeer het opnieuw." });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function formatTreffers(treffers: { id: string; label: string; start: number; duration: number; tekst?: string }[]): string {
  if (treffers.length === 0) return "Geen clip gevonden die daarop lijkt.";
  return treffers
    .map((t) => `${t.id} (${t.label}, ${t.start.toFixed(1)}s–${(t.start + t.duration).toFixed(1)}s)${t.tekst ? `: "${t.tekst}"` : ""}`)
    .join("\n");
}


interface MaakContext {
  naam: string;
  args: Record<string, unknown>;
  doc: TimelineDoc;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  emit: (e: object) => void;
}

type MaakUitkomst = { ok: true; op: Op; summary?: string; kosten?: number } | { ok: false; reden: string };

/**
 * Voert de tools uit die eerst beeld moeten laten maken.
 *
 * plaats_element legt een los element over de clip: dat raakt de video niet aan
 * en kost één beeld-credit. bewerk_beeld verandert het beeld zélf en moet daarna
 * opnieuw animeren — dat kost drie credits en ongeveer een minuut, en daarom
 * melden we elke stap terwijl hij loopt.
 */
async function voerMaakToolUit(ctx: MaakContext): Promise<MaakUitkomst> {
  const { naam, args, doc, supabase, userId, emit } = ctx;
  const clipId = typeof args.clipId === "string" ? args.clipId : "";
  const clip = doc.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
  if (!clip) return { ok: false, reden: `Clip ${clipId || "?"} bestaat niet` };
  if (clip.type !== "video" && clip.type !== "image") {
    return { ok: false, reden: "Dit werkt alleen op beeld, niet op een geluidsspoor" };
  }

  // Een frame uit het midden van de clip: representatief, en niet het zwakke
  // eerste of laatste frame van een AI-generatie.
  const midden = (clip.trimIn ?? 0) + clip.duration / 2;
  // Met raster als we iets moeten plaatsen (dan zijn coördinaten nodig), zonder
  // raster als het beeld zelf bewerkt wordt — dan zouden de lijnen meegaan in
  // de bewerking.
  const frame = await pakFrame(clip.src, clip.type === "video" ? midden : 0, naam === "plaats_element");

  if (naam === "plaats_element") {
    const wat = typeof args.wat === "string" ? args.wat.trim() : "";
    if (!wat) return { ok: false, reden: "Ik weet niet wát er geplaatst moet worden" };
    const waar = typeof args.waar === "string" ? args.waar : "";

    const credit = await deductCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Element in beeld plaatsen");
    if (!credit.success) return { ok: false, reden: `Te weinig credits (nodig: ${CREDIT_COSTS.IMAGE_GENERATION}, saldo: ${credit.credits})` };

    try {
      emit({ type: "bezig", tekst: `${wat} maken…` });
      const { url: src, png } = await genereerElement(supabase, userId, wat);
      const plek = frame
        ? await bepaalPlek(frame, waar, wat)
        : { x: 0.5, y: 0.6, scale: 0.15, toelichting: "midden-onder gezet — versleep hem gerust" };

      // `plek.scale` is de gewenste breedte als deel van het beeld; de
      // compositor rekent met een factor op het passend-gemaakte formaat.
      const formaat = pngFormaat(png) ?? { breedte: 1024, hoogte: 1024 };
      const schaal = breedteNaarSchaal(plek.scale, formaat, { width: doc.width, height: doc.height });

      return {
        ok: true,
        op: { op: "add_element", clipId, src, label: wat, x: plek.x, y: plek.y, scale: schaal },
        summary: `${wat} in beeld gezet${plek.toelichting ? ` — ${plek.toelichting}` : ""}`,
        kosten: CREDIT_COSTS.IMAGE_GENERATION,
      };
    } catch (e) {
      await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: element mislukt").catch(() => {});
      return { ok: false, reden: e instanceof Error ? e.message : "Het element maken lukte niet" };
    }
  }

  // bewerk_beeld
  const instructie = typeof args.instructie === "string" ? args.instructie.trim() : "";
  if (!instructie) return { ok: false, reden: "Ik weet niet wat er aan het beeld moet veranderen" };
  if (!frame) return { ok: false, reden: "Ik kon geen beeld uit deze clip halen" };

  const kosten = CREDIT_COSTS.IMAGE_GENERATION + CREDIT_COSTS.VIDEO_GENERATION;
  const credit = await deductCredits(userId, kosten, "Beeld bewerken + opnieuw animeren");
  if (!credit.success) return { ok: false, reden: `Te weinig credits (nodig: ${kosten}, saldo: ${credit.credits})` };

  try {
    emit({ type: "bezig", tekst: "Beeld aanpassen…" });
    const nieuwBeeld = await bewerkClipBeeld(supabase, userId, frame, instructie, doc.ratio);

    emit({ type: "bezig", tekst: "De clip weer laten bewegen (dit duurt een halve minuut)…" });
    const beweging = await maakBeweging(supabase, userId, nieuwBeeld, clip.meta?.genPrompt);

    return {
      ok: true,
      op: { op: "replace_clip_source", clipId, src: beweging.url, mediaType: "video", naturalDuration: beweging.duur },
      summary: `Beeld aangepast: ${instructie}`,
      kosten,
    };
  } catch (e) {
    await addCredits(userId, kosten, "Refund: beeld bewerken mislukt").catch(() => {});
    return { ok: false, reden: e instanceof Error ? e.message : "Het bewerken lukte niet" };
  }
}
