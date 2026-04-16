import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { BrandKit } from "@/lib/types";

export default async function BrandPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: brandKits } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Huisstijlen</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {brandKits?.length ?? 0} huisstijl{(brandKits?.length ?? 0) !== 1 ? "en" : ""}
          </p>
        </div>
        <Link href="/brand/new" className="btn-primary text-sm">
          + Nieuwe huisstijl
        </Link>
      </div>

      {!brandKits || brandKits.length === 0 ? (
        <div className="card text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎨</span>
          </div>
          <p className="text-white font-semibold text-lg mb-1">Nog geen huisstijlen</p>
          <p className="text-slate-500 text-sm mb-6">
            Maak een huisstijl aan en koppel die aan je projecten voor consistente generaties.
          </p>
          <div className="flex justify-center">
            <Link href="/brand/new" className="btn-primary text-sm">
              + Nieuwe huisstijl
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(brandKits as BrandKit[]).map((kit) => (
            <Link
              key={kit.id}
              href={`/brand/${kit.id}`}
              className="group flex items-center justify-between bg-[#0c1428] border border-white/[0.07] hover:border-blue-500/30 rounded-2xl px-6 py-4 transition-all hover:shadow-[0_4px_24px_rgba(59,130,246,0.1)]"
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Logo of kleurblokjes */}
                <div className="flex-none">
                  {kit.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={kit.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/5 p-1" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">🎨</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                    {kit.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {/* Kleurpalet preview */}
                    {kit.colors && Object.values(kit.colors).filter(Boolean).length > 0 && (
                      <div className="flex gap-1">
                        {(["primary", "secondary", "accent"] as const).map((k) =>
                          kit.colors?.[k] ? (
                            <div
                              key={k}
                              className="w-3 h-3 rounded-full border border-white/10"
                              title={kit.colors[k]}
                              style={{ backgroundColor: kit.colors[k]?.match(/#[0-9a-fA-F]{3,6}/)?.[0] ?? "#334155" }}
                            />
                          ) : null
                        )}
                      </div>
                    )}
                    {kit.tone_of_voice && (
                      <span className="text-xs text-slate-500 truncate">{kit.tone_of_voice}</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-slate-600 group-hover:text-slate-400 transition-colors flex-none ml-4">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
