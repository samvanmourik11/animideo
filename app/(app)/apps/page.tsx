import { APPS, GROEPEN } from "@/lib/creaties/recepten";
import ReceptTegel from "@/components/creaties/ReceptTegel";
import ReclameTegel from "@/components/reclame/ReclameTegel";

export const metadata = { title: "Apps · Animideo" };

export default function AppsPagina() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🧩 Apps</h1>
        <p className="text-tekst-3 mt-1">Eén foto, één klik. Kant-en-klare tools voor je bedrijf en voor de lol.</p>
      </div>
      {GROEPEN.map((g) => (
        <section key={g.id}>
          <h2 className="text-lg font-bold text-tekst">{g.naam}</h2>
          <p className="text-sm text-tekst-3 mb-3">{g.uitleg}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {g.id === "bedrijf" && <ReclameTegel />}
            {APPS.filter((r) => r.groep === g.id).map((r) => <ReceptTegel key={r.id} recept={r} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
