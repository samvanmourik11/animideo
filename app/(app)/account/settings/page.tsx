import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = await getProfile(user!.id);

  return (
    <SettingsClient
      email={user!.email ?? ""}
      name={profile.name ?? ""}
    />
  );
}
