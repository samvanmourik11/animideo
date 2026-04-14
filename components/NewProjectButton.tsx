"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewProjectButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: "Untitled Project",
        language: "English",
        format: "16:9",
        status: "Draft",
      })
      .select()
      .single();

    if (!error && data) {
      router.push(`/project/${data.id}`);
    } else {
      alert("Could not create project: " + error?.message);
      setLoading(false);
    }
  }

  return (
    <button onClick={create} disabled={loading} className="btn-primary">
      {loading ? "Creating…" : "+ New Project"}
    </button>
  );
}
