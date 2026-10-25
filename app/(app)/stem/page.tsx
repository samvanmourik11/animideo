import StemStudio from "@/components/stem/StemStudio";
import { mag } from "@/lib/plan-rechten";
import { mijnPlan } from "@/lib/plan-rechten-pagina";

export const metadata = { title: "Stem & Lipsync · Animideo" };

export default async function StemPagina() {
  return <StemStudio magKlonen={mag(await mijnPlan(), "stemKlonen")} />;
}
