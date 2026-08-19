"use client";

// ── Versiegeschiedenis van een editor-project ────────────────────────────────
//
// Elke toegepaste op gaat hierheen. Daarmee overleeft "ongedaan maken" een
// refresh: bij het openen halen we de laatste stappen op en rekenen we de
// documenten terug, zodat de undo-stapel gevuld is alsof je nooit weg bent
// geweest. Tot nu toe leefde die stapel alleen in het geheugen van het tabblad.
//
// Waarom checkpoints: terugrekenen kan alleen vooruit (ops toepassen), niet
// achteruit. Daarom bewaren we periodiek het hele document; terug naar versie N
// is dan "pak de dichtstbijzijnde checkpoint ≤ N en speel de ops daarna af".
//
// De huidige staat blijft gewoon in `editor_projects.timeline` staan, dus het
// openen van een project hoeft nooit te wachten op een replay.

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyOp, type Op } from "./core/ops";
import type { TimelineDoc } from "./timeline";

/** Zo vaak leggen we het hele document vast; houdt een replay kort. */
const CHECKPOINT_ELKE = 25;

/** Hoeveel stappen ongedaan maken je terugkrijgt na een refresh. */
const HERSTEL_STAPPEN = 30;

export interface HistoryEntry {
  version: number;
  op: Op;
  summary: string;
  source: "user" | "ai";
  createdAt: string;
}

export interface GeladenGeschiedenis {
  /** Documenten van oud naar nieuw, klaar als undo-stapel (zonder de huidige). */
  eerdereDocs: TimelineDoc[];
  /** De regels zelf, voor het versiepaneel. */
  entries: HistoryEntry[];
}

export class EditorHistory {
  private versie = 0;
  private sindsCheckpoint = 0;
  // Wachtrij: twee ops vlak na elkaar (de AI doet er soms twee in één beurt)
  // mogen niet om hun versienummer racen, anders staat de geschiedenis in de
  // verkeerde volgorde.
  private wachtrij: Promise<void> = Promise.resolve();

  constructor(
    private readonly sb: SupabaseClient,
    private readonly projectId: string
  ) {}

  get huidigeVersie(): number {
    return this.versie;
  }

  /**
   * Haalt de geschiedenis op en rekent de laatste stappen terug.
   *
   * `huidig` is het document zoals het nu in de database staat; dat is de bron
   * van waarheid. Klopt de replay daar niet mee (bijvoorbeeld doordat er ooit
   * buiten de ops-laag om is geschreven), dan winnen we niets met forceren —
   * we leveren dan gewoon minder undo-stappen.
   */
  async load(huidig: TimelineDoc): Promise<GeladenGeschiedenis> {
    const { data: laatste } = await this.sb
      .from("editor_ops_log")
      .select("version")
      .eq("project_id", this.projectId)
      .order("version", { ascending: false })
      .limit(1);
    this.versie = laatste?.[0]?.version ?? 0;

    // Nog geen beginpunt? Leg het huidige document vast als checkpoint, anders
    // is er straks niets om vanaf terug te rekenen.
    const { data: checkpoints } = await this.sb
      .from("editor_checkpoints")
      .select("version, doc")
      .eq("project_id", this.projectId)
      .order("version", { ascending: false })
      .limit(1);

    if (!checkpoints || checkpoints.length === 0) {
      await this.sb.from("editor_checkpoints").insert({
        project_id: this.projectId,
        version: this.versie,
        doc: huidig,
        label: "Begin",
        auto: true,
      });
      return { eerdereDocs: [], entries: [] };
    }

    const vanaf = Math.max(0, this.versie - HERSTEL_STAPPEN);
    const { data: basis } = await this.sb
      .from("editor_checkpoints")
      .select("version, doc")
      .eq("project_id", this.projectId)
      .lte("version", vanaf)
      .order("version", { ascending: false })
      .limit(1);

    const startCheckpoint = basis?.[0] ?? checkpoints[checkpoints.length - 1];
    const { data: rijen } = await this.sb
      .from("editor_ops_log")
      .select("version, op, summary, source, created_at")
      .eq("project_id", this.projectId)
      .gt("version", startCheckpoint.version)
      .lte("version", this.versie)
      .order("version", { ascending: true });

    const entries: HistoryEntry[] = (rijen ?? []).map((r) => ({
      version: r.version as number,
      op: r.op as Op,
      summary: (r.summary as string) ?? "",
      source: (r.source as "user" | "ai") ?? "user",
      createdAt: r.created_at as string,
    }));

    // Vooruit afspelen en onderweg elke tussenstand bewaren. De laatste stand
    // hoort gelijk te zijn aan `huidig`; die laten we weg, want dat is waar de
    // gebruiker nu staat.
    const eerdereDocs: TimelineDoc[] = [];
    let doc = startCheckpoint.doc as TimelineDoc;
    eerdereDocs.push(doc);
    for (const entry of entries) {
      const res = applyOp(doc, entry.op);
      if (!res.ok) break; // geschiedenis is niet meer af te spelen; stoppen is eerlijker dan gokken
      doc = res.doc;
      eerdereDocs.push(doc);
    }
    eerdereDocs.pop(); // de huidige stand hoort niet in de undo-stapel

    this.sindsCheckpoint = this.versie - startCheckpoint.version;
    return { eerdereDocs, entries };
  }

  /**
   * Legt een toegepaste op vast als nieuwe versie.
   *
   * Was er ongedaan gemaakt, dan verdwijnen de teruggedraaide regels eerst: de
   * geschiedenis blijft één rechte lijn, precies zoals de gebruiker hem ziet.
   */
  record(op: Op, summary: string, doc: TimelineDoc, source: "user" | "ai" = "user"): Promise<void> {
    this.wachtrij = this.wachtrij.then(() => this.recordNu(op, summary, doc, source)).catch(() => {});
    return this.wachtrij;
  }

  private async recordNu(op: Op, summary: string, doc: TimelineDoc, source: "user" | "ai"): Promise<void> {
    await this.sb.from("editor_ops_log").delete().eq("project_id", this.projectId).gt("version", this.versie);
    await this.sb.from("editor_checkpoints").delete().eq("project_id", this.projectId).gt("version", this.versie);

    this.versie += 1;
    this.sindsCheckpoint += 1;

    const { error } = await this.sb.from("editor_ops_log").insert({
      project_id: this.projectId,
      version: this.versie,
      source,
      op,
      summary,
    });
    // Mislukt het wegschrijven, dan mag de gebruiker daar niets van merken in
    // zijn montage — maar de versieteller moet wel kloppen met wat er ligt.
    if (error) {
      this.versie -= 1;
      this.sindsCheckpoint -= 1;
      console.warn("[editor-history] op niet opgeslagen:", error.message);
      return;
    }

    if (this.sindsCheckpoint >= CHECKPOINT_ELKE) {
      this.sindsCheckpoint = 0;
      await this.sb.from("editor_checkpoints").insert({
        project_id: this.projectId,
        version: this.versie,
        doc,
        auto: true,
      });
    }
  }

  /** De laatste regels voor het versiepaneel, nieuwste eerst. */
  async lijst(limiet = 50): Promise<HistoryEntry[]> {
    const { data } = await this.sb
      .from("editor_ops_log")
      .select("version, op, summary, source, created_at")
      .eq("project_id", this.projectId)
      .order("version", { ascending: false })
      .limit(limiet);
    return (data ?? []).map((r) => ({
      version: r.version as number,
      op: r.op as Op,
      summary: (r.summary as string) ?? "",
      source: (r.source as "user" | "ai") ?? "user",
      createdAt: r.created_at as string,
    }));
  }

  /**
   * Het document zoals het er op een bepaalde versie uitzag: dichtstbijzijnde
   * checkpoint pakken en de ops daarna opnieuw toepassen.
   */
  async documentOp(versie: number): Promise<TimelineDoc | null> {
    const { data: cps } = await this.sb
      .from("editor_checkpoints")
      .select("version, doc")
      .eq("project_id", this.projectId)
      .lte("version", versie)
      .order("version", { ascending: false })
      .limit(1);
    const basis = cps?.[0];
    if (!basis) return null;

    const { data: rijen } = await this.sb
      .from("editor_ops_log")
      .select("version, op")
      .eq("project_id", this.projectId)
      .gt("version", basis.version)
      .lte("version", versie)
      .order("version", { ascending: true });

    let doc = basis.doc as TimelineDoc;
    for (const rij of rijen ?? []) {
      const res = applyOp(doc, rij.op as Op);
      if (!res.ok) return null; // liever niets tonen dan een half kloppende versie
      doc = res.doc;
    }
    return doc;
  }

  /** Na terugzetten vanuit het versiepaneel staan we op die versie. */
  zetVersie(versie: number): void {
    this.versie = Math.max(0, versie);
    this.sindsCheckpoint = CHECKPOINT_ELKE; // volgende bewerking legt meteen vast
  }

  /** Na ongedaan maken staan we een versie lager. */
  stapTerug(): void {
    this.versie = Math.max(0, this.versie - 1);
    this.sindsCheckpoint = Math.max(0, this.sindsCheckpoint - 1);
  }

  /** Na opnieuw uitvoeren weer een hoger. */
  stapVooruit(): void {
    this.versie += 1;
    this.sindsCheckpoint += 1;
  }
}
