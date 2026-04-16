"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PendingIdeaHandler({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const idea = localStorage.getItem("pending_idea");
    if (!idea) return;
    localStorage.removeItem("pending_idea");

    (async () => {
      try {
        // Parse idea with AI
        const parseRes = await fetch("/api/parse-idea", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea }),
        });
        const parsed = parseRes.ok ? await parseRes.json() : {};

        // Create project with pre-filled fields
        const createRes = await fetch("/api/create-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            title: parsed.title || idea.slice(0, 60),
            goal: parsed.goal || idea,
            target_audience: parsed.target_audience || "",
            language: parsed.language || "Dutch",
            format: parsed.format || "16:9",
            visual_style: parsed.visual_style || "Cinematic",
          }),
        });

        if (createRes.ok) {
          const { projectId } = await createRes.json();
          router.push(`/project/${projectId}`);
        }
      } catch (e) {
        console.error("Pending idea handler failed:", e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
