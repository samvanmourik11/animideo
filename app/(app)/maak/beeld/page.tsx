import { Suspense } from "react";
import BeeldMaker from "@/components/creaties/BeeldMaker";

export const metadata = { title: "Beeld maken · Animideo" };

export default function BeeldPagina() {
  // BeeldMaker leest ?ref= uit de adresbalk; daarvoor wil Next een Suspense-grens.
  return (
    <Suspense>
      <BeeldMaker />
    </Suspense>
  );
}
