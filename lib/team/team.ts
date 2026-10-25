// Werken met je team — de serverkant. Alles met de service-client: de tabellen hebben
// bewust geen schrijfregels voor gebruikers (zie 101_teams.sql), want wie wat mag
// (eigenaar? nog plek in het plan?) controleren we hier.

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { addCredits, deductCredits, getCredits, getProfile } from "@/lib/credits";
import { zetKostenContext } from "@/lib/provider-kosten";
import { teamPlaatsen, type TeamRol } from "./types";

export interface MijnTeam {
  id: string;
  naam: string;
  eigenaar_id: string;
  rol: TeamRol;
}

export class TeamFout extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Het team van deze gebruiker, of null. Ook null als de teamtabellen er nog niet zijn
 * (migratie 101 nog niet gedraaid): dan werkt de rest van de nieuwe app gewoon door.
 */
export async function mijnTeam(userId: string): Promise<MijnTeam | null> {
  const { data, error } = await createServiceClient()
    .from("team_leden")
    .select("rol, teams(id, naam, eigenaar_id)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const t = (data as unknown as { rol: TeamRol; teams: { id: string; naam: string; eigenaar_id: string } | null }).teams;
  return t ? { ...t, rol: (data as { rol: TeamRol }).rol } : null;
}

export async function ledenVan(teamId: string): Promise<{ user_id: string; rol: TeamRol }[]> {
  const { data } = await createServiceClient().from("team_leden").select("user_id, rol").eq("team_id", teamId);
  return (data ?? []) as { user_id: string; rol: TeamRol }[];
}

/** Van wiens saldo een klik van deze gebruiker afgaat. */
export async function betalerVan(userId: string): Promise<string> {
  return (await mijnTeam(userId))?.eigenaar_id ?? userId;
}

/**
 * Schrijft af voor een klik in de nieuwe app: in een team van de pot van de eigenaar,
 * anders van jezelf. Geeft terug wat er écht is afgeschreven (de onbeperkte accounts
 * schrijven niets af) en van wie, zodat een mislukte creatie naar de juiste pot teruggaat.
 */
export async function betaal(
  userId: string,
  credits: number,
  reden: string,
  opties?: { zonderSessie?: boolean },
): Promise<{ ok: boolean; betaald: number; betalerId: string }> {
  const team = await mijnTeam(userId);
  const betalerId = team?.eigenaar_id ?? userId;
  const ander = betalerId !== userId;
  // Zonder sessie (een cron, zoals de trendproef) is er geen ingelogde gebruiker om mee te lezen.
  const service = ander || !!opties?.zonderSessie;
  const saldoVoor = await getCredits(betalerId, { service });
  const r = await deductCredits(betalerId, credits, ander ? `${reden} (teamlid)` : reden, { service });
  // deductCredits zet de eigenaar als "wie" in het kostenlogboek; het was de collega.
  zetKostenContext(userId, reden);
  if (!r.success) return { ok: false, betaald: 0, betalerId };
  const betaald = Math.max(0, saldoVoor - r.credits);
  if (team && betaald > 0) await logVerbruik(team.id, userId, betaald, reden);
  return { ok: true, betaald, betalerId };
}

/** Zet credits terug naar de pot waar ze vandaan kwamen. */
export async function betaalTerug(
  c: { user_id: string; betaald_door?: string | null; credits: number },
  reden: string,
): Promise<void> {
  if (c.credits <= 0) return;
  const betalerId = c.betaald_door ?? c.user_id;
  // Altijd met de service-client: het terugzetten kan gebeuren in een verzoek van een
  // teamgenoot die toevallig de bibliotheek openhad.
  await addCredits(betalerId, c.credits, reden, { service: true });
  if (betalerId !== c.user_id) {
    const team = await mijnTeam(c.user_id);
    if (team) await logVerbruik(team.id, c.user_id, -c.credits, reden);
  }
}

async function logVerbruik(teamId: string, userId: string, credits: number, omschrijving: string) {
  const { error } = await createServiceClient()
    .from("team_verbruik")
    .insert({ team_id: teamId, user_id: userId, credits, omschrijving });
  if (error) console.error("[team] verbruik niet gelogd:", error.message);
}

// ── Beheer ───────────────────────────────────────────────────────────────

export async function maakTeam(userId: string, naam: string): Promise<void> {
  const db = createServiceClient();
  if (await mijnTeam(userId)) throw new TeamFout("Je zit al in een team.");
  const profiel = await getProfile(userId, { service: true });
  if (teamPlaatsen(profiel.plan) === 0) {
    throw new TeamFout("Een team kan vanaf het Pro-abonnement.", 403);
  }
  const { data: team, error } = await db
    .from("teams")
    .insert({ eigenaar_id: userId, naam: naam.trim().slice(0, 60) || "Mijn team" })
    .select("id")
    .single();
  if (error || !team) throw new TeamFout("Team aanmaken mislukt. Probeer het opnieuw.", 500);
  await db.from("team_leden").insert({ team_id: team.id, user_id: userId, rol: "eigenaar" });
}

/** Hoeveel plekken er nog vrij zijn: open uitnodigingen tellen mee. */
async function vrijePlekken(team: MijnTeam): Promise<number> {
  const db = createServiceClient();
  const profiel = await getProfile(team.eigenaar_id, { service: true });
  const leden = await ledenVan(team.id);
  const { count } = await db
    .from("team_uitnodigingen")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .is("geaccepteerd_op", null)
    .gt("verloopt_op", new Date().toISOString());
  return teamPlaatsen(profiel.plan) - (leden.length - 1) - (count ?? 0);
}

export async function nodigUit(eigenaarId: string, ruwEmail: string): Promise<{ token: string; email: string; teamNaam: string }> {
  const team = await mijnTeam(eigenaarId);
  if (!team || team.rol !== "eigenaar") throw new TeamFout("Alleen de eigenaar van het team kan mensen uitnodigen.", 403);
  const email = ruwEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamFout("Dat lijkt geen geldig e-mailadres.");
  if ((await vrijePlekken(team)) <= 0) {
    throw new TeamFout("Je team zit vol. Met Agency kun je tot 10 collega's uitnodigen.", 403);
  }
  const db = createServiceClient();
  // Nog een keer uitnodigen = de oude uitnodiging vervangen, geen dubbele plek bezetten.
  await db.from("team_uitnodigingen").delete().eq("team_id", team.id).eq("email", email).is("geaccepteerd_op", null);
  const token = randomBytes(24).toString("base64url");
  const { error } = await db
    .from("team_uitnodigingen")
    .insert({ team_id: team.id, email, token, uitgenodigd_door: eigenaarId });
  if (error) throw new TeamFout("Uitnodigen mislukt. Probeer het opnieuw.", 500);
  return { token, email, teamNaam: team.naam };
}

export async function uitnodigingVoorToken(token: string) {
  const { data } = await createServiceClient()
    .from("team_uitnodigingen")
    .select("id, team_id, email, verloopt_op, geaccepteerd_op, teams(naam, eigenaar_id)")
    .eq("token", token)
    .maybeSingle();
  return data as unknown as {
    id: string;
    team_id: string;
    email: string;
    verloopt_op: string;
    geaccepteerd_op: string | null;
    teams: { naam: string; eigenaar_id: string } | null;
  } | null;
}

export async function accepteer(userId: string, userEmail: string, token: string): Promise<string> {
  const u = await uitnodigingVoorToken(token);
  if (!u || !u.teams) throw new TeamFout("Deze uitnodiging bestaat niet (meer).", 404);
  if (u.geaccepteerd_op) throw new TeamFout("Deze uitnodiging is al gebruikt.");
  if (new Date(u.verloopt_op).getTime() < Date.now()) throw new TeamFout("Deze uitnodiging is verlopen. Vraag om een nieuwe.");
  // Alleen wie op dat adres is uitgenodigd: een doorgestuurde link mag geen vreemde
  // meelaten draaien op de credits van het team.
  if (userEmail.trim().toLowerCase() !== u.email) {
    throw new TeamFout(`Deze uitnodiging is voor ${u.email}. Log in met dat adres.`, 403);
  }
  const huidig = await mijnTeam(userId);
  if (huidig?.id === u.team_id) return u.teams.naam;
  if (huidig) throw new TeamFout(`Je zit al in het team "${huidig.naam}". Verlaat dat eerst.`);

  const db = createServiceClient();
  const { error } = await db.from("team_leden").insert({ team_id: u.team_id, user_id: userId, rol: "lid" });
  if (error) throw new TeamFout("Lid worden mislukt. Probeer het opnieuw.", 500);
  await db.from("team_uitnodigingen").update({ geaccepteerd_op: new Date().toISOString() }).eq("id", u.id);
  return u.teams.naam;
}

/** Iemand uit het team halen; de eigenaar kan iedereen weghalen, een lid alleen zichzelf. */
export async function haalUitTeam(doorUserId: string, wegUserId: string): Promise<void> {
  const team = await mijnTeam(doorUserId);
  if (!team) throw new TeamFout("Je zit niet in een team.", 404);
  if (wegUserId === team.eigenaar_id) {
    throw new TeamFout("De eigenaar kan het team niet verlaten. Hef het team op als je wilt stoppen.");
  }
  if (team.rol !== "eigenaar" && doorUserId !== wegUserId) throw new TeamFout("Dat mag alleen de eigenaar.", 403);
  await createServiceClient().from("team_leden").delete().eq("team_id", team.id).eq("user_id", wegUserId);
}

export async function trekUitnodigingIn(eigenaarId: string, id: string): Promise<void> {
  const team = await mijnTeam(eigenaarId);
  if (!team || team.rol !== "eigenaar") throw new TeamFout("Dat mag alleen de eigenaar.", 403);
  await createServiceClient().from("team_uitnodigingen").delete().eq("id", id).eq("team_id", team.id);
}

/** Team opheffen: iedereen gaat terug naar zijn eigen saldo. Het gemaakte werk blijft van wie het maakte. */
export async function hefOp(eigenaarId: string): Promise<void> {
  const team = await mijnTeam(eigenaarId);
  if (!team || team.rol !== "eigenaar") throw new TeamFout("Dat mag alleen de eigenaar.", 403);
  await createServiceClient().from("teams").delete().eq("id", team.id);
}

