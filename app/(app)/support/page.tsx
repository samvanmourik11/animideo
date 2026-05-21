import { createClient } from "@/lib/supabase/server";
import SupportForm from "./SupportForm";

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Hulp &amp; support</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Loop je ergens tegenaan of heb je een vraag? Stuur ons een bericht, we
          reageren zo snel mogelijk via e-mail.
        </p>
      </div>
      <SupportForm email={user?.email ?? ""} />
    </div>
  );
}
