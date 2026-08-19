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
import { EDITOR_TOOLS, KIJK_TOOLS, LEES_TOOLS, MAAK_TOOLS, toolCallNaarOp } from "@/lib/editor/ai/tools";
import { bepaalPlek, bewerkClipBeeld, breedteNaarSchaal, genereerElement, maakBeweging, pakFrame, pngFormaat, snijUitFrame, vulVlak } from "@/lib/editor/elements";
import { breedteNaarCompositie, frameNaarCompositie, leesbareLetterkleur, vaakstVoorkomend } from "@/lib/editor/element-geometry";
import { besteTreffer, zoekTekst, zoekVoorwerp, type Kader } from "@/lib/editor/vision";
import { besteIcoon, iconUrl } from "@/lib/editor/icons/library";
import { leesKleur, maakVlak, uploadFrame, uploadVorm, vervaagUitsnede } from "@/lib/editor/elements";
import { tekenVorm, type VormSoort } from "@/lib/editor/shapes";
import { applyOps } from "@/lib/editor/core/ops";
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

            // Kijken naar het beeld: het antwoord op een tool-call kan geen
            // afbeelding bevatten, dus we bevestigen de call en sturen het frame
            // er als apart bericht achteraan. Vanaf de volgende ronde ziet het
            // model het beeld en kan het over plekken redeneren.
            if (KIJK_TOOLS.has(call.name)) {
              const clip = doc.tracks.flatMap((t) => t.clips).find((c) => c.id === args.clipId);
              const frameBuf =
                clip && (clip.type === "video" || clip.type === "image")
                  ? await pakFrame(clip.src, clip.type === "video" ? (clip.trimIn ?? 0) + clip.duration / 2 : 0, true)
                  : null;
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: frameBuf ? "Frame volgt hieronder." : "Ik kon geen beeld uit deze clip halen.",
              });
              if (frameBuf) {
                messages.push({
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Dit is het beeld van ${args.clipId}. Het raster is een hulpmiddel: dunne lijnen om de 10%, dikke om de 25%. Lees coördinaten af als fracties (0..1), waarbij 0,0 linksboven is.`,
                    },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${frameBuf.toString("base64")}` } },
                  ],
                });
                emit({ type: "bezig", tekst: "Naar het beeld gekeken" });
              }
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
              const ops = uitkomst.meerdereOps ?? (uitkomst.op ? [uitkomst.op] : []);
              const res = applyOps(doc, ops);
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
              const samenvatting = uitkomst.summary ?? res.summaries.join("; ");
              for (let i = 0; i < ops.length; i++) {
                emit({ type: "op", op: ops[i], summary: i === 0 ? samenvatting : res.summaries[i] });
              }
              messages.push({ role: "tool", tool_call_id: call.id, content: `Toegepast: ${samenvatting}` });
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

type MaakUitkomst =
  | { ok: true; op?: Op; meerdereOps?: Op[]; summary?: string; kosten?: number }
  | { ok: false; reden: string };

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
  // De monteur leest coördinaten af op het frame; de tijdlijn rekent in
  // compositie-coördinaten. Bij een andere verhouding lopen die uiteen.
  const frameFormaat = frame ? pngFormaat(frame) : null;
  const naarBeeld = (p: { x: number; y: number }) =>
    frameFormaat ? frameNaarCompositie(p, frameFormaat, { width: doc.width, height: doc.height }) : p;

  // Waar staat het ding dat de klant noemt? Eerst als tekst in beeld (dat is
  // exact), anders als voorwerp op omschrijving. Zonder meten zou dit weer
  // schatten worden, en dan zit een cirkel naast het bordje.
  async function zoekDoel(wat: string, engels?: string): Promise<Kader | null> {
    if (!frame || !frameFormaat) return null;
    const beeldUrl = await uploadFrame(supabase, userId, frame);
    if (!beeldUrl) return null;

    const tekstKaders = await zoekTekst(beeldUrl, frameFormaat.breedte, frameFormaat.hoogte);
    const alsTekst = besteTreffer(tekstKaders, wat);
    if (alsTekst) return alsTekst;

    // De objectherkenning is Engelstalig. Op "het te koop bord" gaf hij een kader
    // van 67% van het beeld (het hele huis), op "sign" 31% (het bordje). Dus
    // liefst de Engelse omschrijving, met de Nederlandse als laatste redmiddel.
    const voorwerpen = await zoekVoorwerp(beeldUrl, engels || wat, frameFormaat.breedte, frameFormaat.hoogte);
    const kader = voorwerpen[0];
    if (!kader) return null;

    // Een kader dat bijna het hele beeld beslaat is geen aanwijzing maar een
    // mislukte meting. Liever eerlijk melden dan een cirkel om alles zetten.
    if (kader.breedte > 0.7 && kader.hoogte > 0.7) return null;
    return kader;
  }

  if (naam === "markeer" || naam === "vervaag") {
    const wat = typeof args.wat === "string" ? args.wat.trim() : "";
    if (!wat) return { ok: false, reden: "Ik weet niet wat ik moet aanwijzen" };
    if (!frame || !frameFormaat) return { ok: false, reden: "Ik kon geen beeld uit deze clip halen" };

    emit({ type: "bezig", tekst: `"${wat}" opzoeken in beeld…` });
    const engels = typeof args.objectEngels === "string" ? args.objectEngels.trim() : "";
    const kader = await zoekDoel(wat, engels);
    if (!kader) {
      return {
        ok: false,
        reden: `Ik kon "${wat}" niet duidelijk aanwijzen in beeld. Probeer het concreter te omschrijven, of noem de tekst die erop staat.`,
      };
    }

    const comp = { width: doc.width, height: doc.height };
    const tijd = clip.type === "video" ? midden : 0;

    if (naam === "vervaag") {
      // Iets ruimer dan het gevonden kader: randjes die net buiten de meting
      // vallen zijn precies wat je niet wilt laten staan.
      const gebied = {
        x: kader.x,
        y: kader.y,
        breedte: Math.min(0.98, kader.breedte * 1.2),
        hoogte: Math.min(0.98, kader.hoogte * 1.3),
      };
      const vervaagd = await vervaagUitsnede(supabase, userId, clip.src, tijd, gebied);
      if (!vervaagd) return { ok: false, reden: "Het vervagen lukte niet" };

      const formaat = pngFormaat(vervaagd.png) ?? { breedte: 100, hoogte: 100 };
      const breedteInBeeld = breedteNaarCompositie(gebied.breedte, frameFormaat, comp);
      const positie = naarBeeld({ x: gebied.x, y: gebied.y });
      return {
        ok: true,
        op: {
          op: "add_element", clipId, src: vervaagd.url, label: `${wat} vervaagd`,
          x: positie.x, y: positie.y,
          scale: breedteNaarSchaal(breedteInBeeld, formaat, comp),
        },
        summary: `"${wat}" vervaagd`,
      };
    }

    const soort = (["cirkel", "kader", "pijl", "onderstreping"].includes(String(args.vorm))
      ? args.vorm
      : "cirkel") as VormSoort;
    const kleur = typeof args.kleur === "string" && /^#[0-9a-f]{6}$/i.test(args.kleur) ? args.kleur : "#e53935";

    // Maat en plek hangen af van de vorm: een cirkel gaat eromheen, een pijl
    // ernaast, een streep eronder.
    let breedteFrame = kader.breedte * 1.35;
    let hoogteFrame = kader.hoogte * 1.9;
    let doelX = kader.x;
    let doelY = kader.y;

    if (soort === "pijl") {
      breedteFrame = Math.max(0.08, kader.breedte * 0.8);
      hoogteFrame = breedteFrame * 0.45;
      // Links ernaast, wijzend naar het doel.
      doelX = Math.max(0.05, kader.x - kader.breedte / 2 - breedteFrame / 2 - 0.01);
      doelY = kader.y;
    } else if (soort === "onderstreping") {
      breedteFrame = kader.breedte * 1.1;
      hoogteFrame = Math.max(0.02, kader.hoogte * 0.35);
      doelY = Math.min(0.97, kader.y + kader.hoogte * 0.75);
    } else if (soort === "kader") {
      breedteFrame = kader.breedte * 1.2;
      hoogteFrame = kader.hoogte * 1.6;
    }

    // Tekenen op de resolutie waarop het straks in beeld komt: dan is het scherp.
    const breedteInBeeld = breedteNaarCompositie(breedteFrame, frameFormaat, comp);
    const hoogteInBeeld = (hoogteFrame * frameFormaat.hoogte * Math.min(comp.width / frameFormaat.breedte, comp.height / frameFormaat.hoogte)) / comp.height;
    const png = tekenVorm(soort, {
      breedtePx: Math.max(16, Math.round(breedteInBeeld * comp.width)),
      hoogtePx: Math.max(16, Math.round(hoogteInBeeld * comp.height)),
      kleur,
    });
    const url = await uploadVorm(supabase, userId, png);
    if (!url) return { ok: false, reden: "De vorm opslaan lukte niet" };

    const formaat = pngFormaat(png) ?? { breedte: 100, hoogte: 100 };
    const positie = naarBeeld({ x: doelX, y: doelY });
    const namen: Record<VormSoort, string> = {
      cirkel: "Cirkel om", kader: "Kader om", pijl: "Pijl naar", onderstreping: "Streep onder",
    };
    return {
      ok: true,
      op: {
        op: "add_element", clipId, src: url, label: `${namen[soort]} ${wat}`,
        x: positie.x, y: positie.y,
        scale: breedteNaarSchaal(breedteInBeeld, formaat, comp),
      },
      summary: `${namen[soort]} "${wat}" gezet`,
    };
  }

  if (naam === "herstel_tekst") {
    const fout = typeof args.foutieveTekst === "string" ? args.foutieveTekst : "";
    const nieuw = typeof args.nieuweTekst === "string" ? args.nieuweTekst.trim() : "";
    if (!nieuw) return { ok: false, reden: "Ik weet niet wat er moet komen te staan" };
    if (!frame || !frameFormaat) return { ok: false, reden: "Ik kon geen beeld uit deze clip halen" };

    emit({ type: "bezig", tekst: "De tekst in beeld opzoeken…" });
    const beeldUrl = await uploadFrame(supabase, userId, frame);
    if (!beeldUrl) return { ok: false, reden: "Ik kon het beeld niet klaarzetten om te doorzoeken" };

    const kaders = await zoekTekst(beeldUrl, frameFormaat.breedte, frameFormaat.hoogte);
    const kader = besteTreffer(kaders, fout || nieuw);
    if (!kader) {
      const gevonden = kaders.map((k) => `"${k.label}"`).join(", ");
      return {
        ok: false,
        reden: gevonden
          ? `Ik vond die tekst niet in beeld. Wel gevonden: ${gevonden}`
          : "Ik vond geen leesbare tekst in dit beeld",
      };
    }

    // Ruim afdekken: letters die uitsteken zijn erger dan een iets groter vlak.
    const marge = 1.25;
    const vlakBreedte = Math.min(0.98, kader.breedte * marge);
    const vlakHoogte = Math.min(0.98, kader.hoogte * marge * 1.15);

    // De kleur van het vlak waar de letters op staan. Eén monster naast de tekst
    // was een gok — net te ver en je zit op de muur naast het bordje. Daarom vier
    // monsters rondom de tekst en de kleur die het vaakst voorkomt.
    const tijd = clip.type === "video" ? midden : 0;
    const monsters = await Promise.all([
      leesKleur(clip.src, tijd, { x: kader.x, y: kader.y - kader.hoogte * 0.75 }),
      leesKleur(clip.src, tijd, { x: kader.x, y: kader.y + kader.hoogte * 0.75 }),
      leesKleur(clip.src, tijd, { x: kader.x - kader.breedte * 0.55, y: kader.y }),
      leesKleur(clip.src, tijd, { x: kader.x + kader.breedte * 0.55, y: kader.y }),
    ]);
    const kleurVlak = vaakstVoorkomend(monsters) ?? "#ffffff";

    emit({ type: "bezig", tekst: `Dichtleggen in ${kleurVlak} en nieuwe tekst zetten…` });
    const vlak = await maakVlak(supabase, userId, kleurVlak, { breedte: vlakBreedte, hoogte: vlakHoogte });
    if (!vlak) return { ok: false, reden: "Ik kon het afdekvlak niet maken" };

    const comp = { width: doc.width, height: doc.height };
    const formaat = pngFormaat(vlak.png) ?? { breedte: 100, hoogte: 100 };
    const breedteInBeeld = breedteNaarCompositie(vlakBreedte, frameFormaat, comp);
    const schaal = breedteNaarSchaal(breedteInBeeld, formaat, comp);
    const positie = naarBeeld({ x: kader.x, y: kader.y });

    // Lettergrootte uit de hoogte van de oude tekst: dan past het vanzelf.
    const hoogteInBeeld = (kader.hoogte * frameFormaat.hoogte * Math.min(comp.width / frameFormaat.breedte, comp.height / frameFormaat.hoogte));
    const fontSize = Math.max(16, Math.round(hoogteInBeeld * 0.95));

    return {
      ok: true,
      meerdereOps: [
        { op: "add_element", clipId, src: vlak.url, label: "Afdekking", x: positie.x, y: positie.y, scale: schaal },
        {
          op: "add_text",
          clipId,
          text: nieuw,
          x: positie.x,
          y: positie.y,
          fontSize,
          // Letters die je kunt lezen: donker op een licht vlak, wit op een donker.
          color: typeof args.kleur === "string" ? args.kleur : leesbareLetterkleur(kleurVlak),
        },
      ],
      summary: `"${kader.label}" vervangen door "${nieuw}"`,
    } as MaakUitkomst;
  }

  if (naam === "plaats_tekst") {
    const tekst = typeof args.tekst === "string" ? args.tekst.trim() : "";
    if (!tekst) return { ok: false, reden: "Ik weet niet welke tekst er moet komen" };
    const f = (v: unknown, standaard: number) => (typeof v === "number" && Number.isFinite(v) ? v : standaard);
    const positie = naarBeeld({ x: f(args.x, 0.5), y: f(args.y, 0.5) });
    return {
      ok: true,
      op: {
        op: "add_text",
        clipId,
        text: tekst,
        x: positie.x,
        y: positie.y,
        fontSize: typeof args.grootte === "number" ? args.grootte : undefined,
        color: typeof args.kleur === "string" ? args.kleur : undefined,
      },
    };
  }

  if (naam === "vul_vlak") {
    const f = (v: unknown, standaard: number) => (typeof v === "number" && Number.isFinite(v) ? v : standaard);
    const breedte = Math.min(0.95, Math.max(0.01, f(args.breedte, 0.15)));
    const hoogte = Math.min(0.95, Math.max(0.01, f(args.hoogte, 0.08)));

    emit({ type: "bezig", tekst: "Kleur uitlezen en vlak dichtleggen…" });
    const vlak = await vulVlak(
      supabase, userId, clip.src, clip.type === "video" ? midden : 0,
      { x: f(args.kleurX, 0.5), y: f(args.kleurY, 0.5) },
      { breedte, hoogte }
    );
    if (!vlak) return { ok: false, reden: "Ik kon de kleur niet uitlezen uit dit beeld" };

    const formaat = pngFormaat(vlak.png) ?? { breedte: 100, hoogte: 100 };
    const breedteInBeeld = frameFormaat
      ? breedteNaarCompositie(breedte, frameFormaat, { width: doc.width, height: doc.height })
      : breedte;
    const schaal = breedteNaarSchaal(breedteInBeeld, formaat, { width: doc.width, height: doc.height });
    const doel = naarBeeld({ x: f(args.doelX, 0.5), y: f(args.doelY, 0.5) });
    return {
      ok: true,
      op: { op: "add_element", clipId, src: vlak.url, label: "Afdekking", x: doel.x, y: doel.y, scale: schaal },
      summary: `Vlak dichtgelegd in ${vlak.kleur}`,
    };
  }

  if (naam === "dek_af") {
    const f = (v: unknown, standaard: number) => (typeof v === "number" && Number.isFinite(v) ? v : standaard);
    const breedte = Math.min(0.9, Math.max(0.01, f(args.breedte, 0.1)));
    const hoogte = Math.min(0.9, Math.max(0.01, f(args.hoogte, 0.1)));

    emit({ type: "bezig", tekst: "Stukje beeld kopiëren…" });
    const uitsnede = await snijUitFrame(supabase, userId, clip.src, clip.type === "video" ? midden : 0, {
      x: f(args.bronX, 0.5),
      y: f(args.bronY, 0.5),
      breedte,
      hoogte,
    });
    if (!uitsnede) return { ok: false, reden: "Ik kon geen stuk uit dit beeld snijden" };

    // De uitsnede is precies zo groot als het gevraagde stuk, dus we plaatsen
    // hem op ware grootte over het doel. Geen credits: er komt geen model aan te pas.
    const formaat = pngFormaat(uitsnede.png) ?? { breedte: 100, hoogte: 100 };
    // De uitsnede moet in beeld even groot worden als het stuk dat hij afdekt,
    // dus de breedte gaat eerst van frame- naar compositiematen.
    const breedteInBeeld = frameFormaat
      ? breedteNaarCompositie(breedte, frameFormaat, { width: doc.width, height: doc.height })
      : breedte;
    const schaal = breedteNaarSchaal(breedteInBeeld, formaat, { width: doc.width, height: doc.height });
    const doel = naarBeeld({ x: f(args.doelX, 0.5), y: f(args.doelY, 0.5) });
    return {
      ok: true,
      op: {
        op: "add_element",
        clipId,
        src: uitsnede.url,
        label: "Afdekking",
        x: doel.x,
        y: doel.y,
        scale: schaal,
      },
      summary: "Stukje beeld eroverheen geplakt",
    };
  }

  if (naam === "plaats_icoon") {
    const wat = typeof args.wat === "string" ? args.wat.trim() : "";
    if (!wat) return { ok: false, reden: "Ik weet niet welk icoon je bedoelt" };
    const icoon = besteIcoon(wat);
    if (!icoon) {
      return {
        ok: false,
        reden: `Geen icoon in de bibliotheek dat op "${wat}" lijkt. Gebruik plaats_element als het er echt bij moet (1 credit).`,
      };
    }

    const waar = typeof args.waar === "string" ? args.waar : "";
    const plek = frame
      ? await bepaalPlek(frame, waar, icoon.label)
      : { x: 0.5, y: 0.35, scale: 0.18, toelichting: undefined };
    const positie = naarBeeld({ x: plek.x, y: plek.y });
    // De iconen zijn vierkant (1024×1024) — dat weten we, dus geen extra ophaal.
    const schaal = breedteNaarSchaal(plek.scale, { breedte: 1024, hoogte: 1024 }, { width: doc.width, height: doc.height });

    return {
      ok: true,
      op: { op: "add_element", clipId, src: iconUrl(icoon.slug), label: icoon.label, x: positie.x, y: positie.y, scale: schaal },
      summary: `Icoon "${icoon.label}" in beeld gezet`,
    };
  }

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
      const positie = naarBeeld({ x: plek.x, y: plek.y });

      return {
        ok: true,
        op: { op: "add_element", clipId, src, label: wat, x: positie.x, y: positie.y, scale: schaal },
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
