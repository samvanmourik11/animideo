import { EFFECTEN } from "@/lib/creaties/recepten";
import ReceptTegel from "@/components/creaties/ReceptTegel";

export const metadata = { title: "Effecten · Animideo" };

export default function EffectenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">⚡ Effecten</h1>
        <p className="text-tekst-3 mt-1">Foto erin, filmpje eruit. Klaar om te delen op TikTok, Instagram of LinkedIn.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {EFFECTEN.map((r) => <ReceptTegel key={r.id} recept={r} />)}
      </div>
    </div>
  );
}
