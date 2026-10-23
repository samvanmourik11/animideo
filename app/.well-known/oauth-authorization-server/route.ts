import { NextRequest, NextResponse } from "next/server";
import { metadataServer } from "@/lib/mcp/oauth";
import { origin } from "@/lib/mcp/origin";

// RFC 8414: de adressen van de inlogserver (aanmelden, toestemming, sleutel ophalen).
export function GET(req: NextRequest) {
  return NextResponse.json(metadataServer(origin(req)), { headers: { "Access-Control-Allow-Origin": "*" } });
}
