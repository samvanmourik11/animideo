import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Character } from "@/lib/types";
import CharactersClient from "./CharactersClient";

export default async function CharactersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: characters } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return <CharactersClient initialCharacters={(characters ?? []) as Character[]} />;
}
