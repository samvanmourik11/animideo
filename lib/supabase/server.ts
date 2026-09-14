import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchMetHerkansing } from "@/lib/netwerk-herkansing";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Een haperende verbinding liet de inlogcontrole mislukken ("Unauthorized" terwijl
      // je ingelogd was). Lezen wordt opnieuw geprobeerd; zie netwerk-herkansing.ts.
      global: { fetch: fetchMetHerkansing },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Server Component — cookies can't be set here
          }
        },
      },
    }
  );
}
