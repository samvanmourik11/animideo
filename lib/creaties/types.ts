// Eén gemaakt bestand in de nieuwe app: een beeld, video of geluid. Zie
// supabase/migrations/100_creaties.sql.

export type CreatieSoort = "beeld" | "video" | "audio";
export type CreatieStatus = "bezig" | "klaar" | "mislukt";

export interface Creatie {
  id: string;
  user_id: string;
  soort: CreatieSoort;
  status: CreatieStatus;
  maker: string;
  model: string | null;
  prompt: string | null;
  invoer: Record<string, unknown>;
  url: string | null;
  credits: number;
  fal_endpoint: string | null;
  fal_request_id: string | null;
  foutmelding: string | null;
  ouder_id: string | null;
  map_id: string | null;
  favoriet: boolean;
  /** Van wiens saldo het betaald is, als dat niet de maker was (team). Zie 101_teams.sql. */
  betaald_door?: string | null;
  /** Openbare deelcode (/d/<code>); leeg = niet gedeeld. Zie 102_delen.sql. */
  deel_code?: string | null;
  deel_poster?: string | null;
  gedeeld_op?: string | null;
  created_at: string;
  klaar_op: string | null;
}

export interface CreatieMap {
  id: string;
  user_id: string;
  naam: string;
  created_at: string;
}
