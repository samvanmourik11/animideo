// Films lezen en bewaren (alleen op de server; de tabel is voor gebruikers alleen leesbaar).

import { createServiceClient } from "@/lib/supabase/service";
import { LEGE_FILM, type Film } from "./types";

export interface FilmRij {
  id: string;
  user_id: string;
  regie_project_id: string | null;
  titel: string;
  data: Film;
  updated_at: string;
}

const vul = (r: Record<string, unknown>): FilmRij => ({ ...(r as unknown as FilmRij), data: { ...LEGE_FILM, ...((r.data as Partial<Film>) ?? {}) } });

export async function filmVanProject(userId: string, projectId: string): Promise<FilmRij | null> {
  const { data } = await createServiceClient().from("films").select("*").eq("user_id", userId).eq("regie_project_id", projectId).maybeSingle();
  return data ? vul(data) : null;
}

export async function leesFilm(userId: string, filmId: string): Promise<FilmRij> {
  const { data } = await createServiceClient().from("films").select("*").eq("user_id", userId).eq("id", filmId).maybeSingle();
  if (!data) throw new Error("Deze film bestaat niet (meer).");
  return vul(data);
}

export async function bewaarFilm(id: string, film: Film): Promise<void> {
  const { error } = await createServiceClient().from("films").update({ data: film, titel: film.titel, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Film bewaren mislukt: ${error.message}`);
}

export async function maakFilm(userId: string, projectId: string, film: Film): Promise<FilmRij> {
  const { data, error } = await createServiceClient()
    .from("films")
    .insert({ user_id: userId, regie_project_id: projectId, titel: film.titel, data: film })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Film aanmaken mislukt: ${error?.message ?? "onbekend"}`);
  return vul(data);
}

/** Lees, pas aan en bewaar in één keer (de server is de enige schrijver). */
export async function wijzigFilm(userId: string, filmId: string, f: (film: Film) => Film | void): Promise<Film> {
  const rij = await leesFilm(userId, filmId);
  // Pas de kopie aan (of geef een nieuwe film terug). Eerst stond hier `?? rij.data`: dan
  // werd bij een aanpassing zonder return de oude versie bewaard en ging alles verloren.
  const kopie = structuredClone(rij.data);
  const nieuw = f(kopie) ?? kopie;
  await bewaarFilm(filmId, nieuw);
  return nieuw;
}
