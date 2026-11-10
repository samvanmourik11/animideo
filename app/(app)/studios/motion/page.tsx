import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import MotionStudio from "@/components/motion/MotionStudio";

export const metadata = { title: "Motion graphics · Animideo" };

export default async function MotionPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Nog niet voor iedereen open (lib/studio/access.ts).
  if (!canUseMotion(user.email)) notFound();
  return <MotionStudio />;
}
