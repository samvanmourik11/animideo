import { NextRequest, NextResponse } from "next/server";
import { metadataResource } from "@/lib/mcp/oauth";
import { origin } from "@/lib/mcp/origin";

// RFC 9728: waar je kunt inloggen om /api/mcp te gebruiken. Claude zoekt dit op na een 401
// (op de wortel én met het pad van de server erachter).
export function GET(req: NextRequest) {
  return NextResponse.json(metadataResource(origin(req)), { headers: { "Access-Control-Allow-Origin": "*" } });
}
