import { createClient } from "@/lib/supabase/server";
import { uitnodigingVoorToken } from "@/lib/team/team";
import DoeMee from "@/components/team/DoeMee";

export const metadata = { title: "Uitnodiging · Animideo" };

// Buiten de app-omgeving: wie nog niet is ingelogd, moet deze pagina ook kunnen zien.
export default async function DoeMeePagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await uitnodigingVoorToken(token);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const geldig = !!u?.teams && !u.geaccepteerd_op && new Date(u.verloopt_op).getTime() > Date.now();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50 text-slate-900">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-8 shadow-sm space-y-4">
        <div className="font-extrabold text-lg">Animideo<span className="text-blue-500">.</span></div>
        {!geldig ? (
          <>
            <h1 className="text-2xl font-bold">Deze uitnodiging werkt niet meer</h1>
            <p className="text-slate-600">Hij is al gebruikt, ingetrokken of verlopen. Vraag je collega om een nieuwe.</p>
          </>
        ) : (
          <DoeMee
            token={token}
            teamNaam={u!.teams!.naam}
            uitgenodigd={u!.email}
            ingelogdAls={user?.email ?? null}
          />
        )}
      </div>
    </div>
  );
}
