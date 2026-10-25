import { Suspense } from "react";
import SocialStudio from "@/components/social/SocialStudio";
import PakketSlot from "@/components/PakketSlot";
import { mag } from "@/lib/plan-rechten";
import { mijnPlan } from "@/lib/plan-rechten-pagina";

export const metadata = { title: "Social · Animideo" };

export default async function SocialPagina() {
  const magPosten = mag(await mijnPlan(), "vooruitPosten");
  return (
    <>
      {!magPosten && <div className="max-w-5xl mx-auto px-4 pt-6"><PakketSlot recht="vooruitPosten" /></div>}
      <Suspense>
        <SocialStudio />
      </Suspense>
    </>
  );
}
