import { Suspense } from "react";
import SocialStudio from "@/components/social/SocialStudio";

export const metadata = { title: "Social · Animideo" };

export default function SocialPagina() {
  return (
    <Suspense>
      <SocialStudio />
    </Suspense>
  );
}
