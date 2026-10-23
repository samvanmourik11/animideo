// INLOGGEN VANUIT DE CLAUDE-APP — een kleine OAuth 2.1-server bovenop het gewone Animideo-
// inloggen, zoals de MCP-specificatie vraagt (2025-06-18, "Authorization"):
//   - /.well-known/oauth-protected-resource      waar je kunt inloggen voor /api/mcp
//   - /.well-known/oauth-authorization-server    welke adressen daarvoor zijn
//   - /api/oauth/register                        Claude meldt zich zelf aan (DCR)
//   - /oauth/authorize                           de klant logt in en klikt "Toestaan"
//   - /api/oauth/token                           code → sleutel (1 uur) + vernieuwsleutel
// Alleen PKCE met S256, alleen exact geregistreerde terugkeeradressen (https of localhost).

import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { hash, nieuweSleutel } from "./sleutels";

export const TOEGANG_SEC = 60 * 60;
export const VERNIEUW_DAGEN = 60;
const CODE_MS = 10 * 60 * 1000;

export class OAuthFout extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function metadataServer(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["animideo"],
  };
}

export function metadataResource(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Animideo", scopes_supported: ["animideo"] };
}

/** Alleen https, of http op de eigen computer (programma's als Claude Code). */
export function geldigTerugadres(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  } catch {
    return false;
  }
}

export async function registreer(body: Record<string, unknown>) {
  const uris = (Array.isArray(body.redirect_uris) ? body.redirect_uris : []).map(String).slice(0, 10);
  if (!uris.length || !uris.every(geldigTerugadres)) throw new OAuthFout("invalid_redirect_uri", "Terugkeeradressen moeten https zijn (of localhost).");
  const naam = String(body.client_name ?? "Onbekend programma").slice(0, 80);
  const client_id = `anm_client_${randomBytes(12).toString("base64url")}`;
  const { error } = await createServiceClient().from("oauth_clients").insert({ client_id, naam, redirect_uris: uris });
  if (error) throw new Error(error.message);
  return { client_id, client_name: naam, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function client(clientId: string) {
  const { data } = await createServiceClient().from("oauth_clients").select("client_id, naam, redirect_uris").eq("client_id", clientId).maybeSingle();
  return data as { client_id: string; naam: string; redirect_uris: string[] } | null;
}

export interface Aanvraag {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  resource?: string;
}

/** Controleert een inlogaanvraag; gooit als er iets niet klopt (dan nooit terugsturen). */
export async function controleerAanvraag(a: Partial<Aanvraag> & { response_type?: string }) {
  const c = a.client_id ? await client(a.client_id) : null;
  if (!c) throw new OAuthFout("invalid_client", "Onbekend programma. Probeer opnieuw te verbinden vanuit Claude.");
  if (!a.redirect_uri || !c.redirect_uris.includes(a.redirect_uri)) throw new OAuthFout("invalid_request", "Het terugkeeradres klopt niet.");
  if (a.response_type !== "code") throw new OAuthFout("unsupported_response_type", "Alleen response_type=code.");
  if (!a.code_challenge || a.code_challenge_method !== "S256") throw new OAuthFout("invalid_request", "PKCE (S256) is verplicht.");
  return c;
}

export async function maakCode(userId: string, a: Aanvraag): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const { error } = await createServiceClient().from("oauth_codes").insert({
    code_hash: hash(code), client_id: a.client_id, user_id: userId, redirect_uri: a.redirect_uri,
    code_challenge: a.code_challenge, resource: a.resource ?? null, verloopt_op: new Date(Date.now() + CODE_MS).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function geefSleutels(userId: string, clientId: string, naam: string) {
  const toegang = nieuweSleutel();
  const vernieuw = `anm_r_${randomBytes(30).toString("base64url")}`;
  const nu = Date.now();
  const { error } = await createServiceClient().from("api_sleutels").insert({
    user_id: userId, naam, soort: "oauth", client_id: clientId, hash: hash(toegang), begin: `${toegang.slice(0, 8)}…`,
    verloopt_op: new Date(nu + TOEGANG_SEC * 1000).toISOString(),
    vernieuw_hash: hash(vernieuw), vernieuw_verloopt_op: new Date(nu + VERNIEUW_DAGEN * 86400_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { access_token: toegang, token_type: "Bearer", expires_in: TOEGANG_SEC, refresh_token: vernieuw, scope: "animideo" };
}

export async function wisselIn(form: URLSearchParams) {
  const db = createServiceClient();
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const c = await client(clientId);
  if (!c) throw new OAuthFout("invalid_client", "Onbekend programma.", 401);

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    // Eenmalig: alleen wie de code echt als gebruikt markeert, krijgt een sleutel.
    const { data } = await db
      .from("oauth_codes")
      .update({ gebruikt_op: new Date().toISOString() })
      .eq("code_hash", hash(code))
      .is("gebruikt_op", null)
      .select("*")
      .maybeSingle();
    if (!data || data.client_id !== clientId || new Date(data.verloopt_op).getTime() < Date.now()) throw new OAuthFout("invalid_grant", "Code ongeldig of verlopen.");
    if (form.get("redirect_uri") !== data.redirect_uri) throw new OAuthFout("invalid_grant", "Terugkeeradres klopt niet.");
    if (s256(form.get("code_verifier") ?? "") !== data.code_challenge) throw new OAuthFout("invalid_grant", "PKCE-controle mislukt.");
    return geefSleutels(data.user_id, clientId, c.naam);
  }

  if (grant === "refresh_token") {
    // Draaien: de oude vernieuwsleutel vervalt meteen (verplicht voor publieke programma's).
    const { data } = await db
      .from("api_sleutels")
      .update({ ingetrokken_op: new Date().toISOString() })
      .eq("vernieuw_hash", hash(form.get("refresh_token") ?? ""))
      .eq("client_id", clientId)
      .is("ingetrokken_op", null)
      .select("user_id, vernieuw_verloopt_op")
      .maybeSingle();
    if (!data || new Date(data.vernieuw_verloopt_op).getTime() < Date.now()) throw new OAuthFout("invalid_grant", "Vernieuwsleutel ongeldig of verlopen.");
    return geefSleutels(data.user_id, clientId, c.naam);
  }

  throw new OAuthFout("unsupported_grant_type", "Alleen authorization_code en refresh_token.");
}
