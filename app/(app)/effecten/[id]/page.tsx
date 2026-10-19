import { notFound } from "next/navigation";
import { recept } from "@/lib/creaties/recepten";
import ReceptMaker from "@/components/creaties/ReceptMaker";

export default async function ReceptPagina({ params }: { params: Promise<{ id: string }> }) {
  const r = recept((await params).id);
  if (!r) notFound();
  return <ReceptMaker receptId={r.id} />;
}
