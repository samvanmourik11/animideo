"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function MarkWatchedButton({
  lessonId,
  watchedAt,
}: {
  lessonId: string;
  watchedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimisticWatched, setOptimisticWatched] = useState(watchedAt !== null);

  function toggle() {
    const next = !optimisticWatched;
    setOptimisticWatched(next);
    start(async () => {
      const res = await fetch(`/api/lessons/${lessonId}/watched`, { method: "POST" });
      if (!res.ok) {
        setOptimisticWatched(!next);
        return;
      }
      router.refresh();
    });
  }

  if (optimisticWatched) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 text-sm font-medium transition-colors disabled:opacity-50"
      >
        <span>✓</span>
        <span>Gezien {watchedAt ? formatDate(watchedAt) : ""}</span>
        <span className="text-xs text-slate-400">(ongedaan maken)</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
    >
      {pending ? "Bezig..." : "Markeer als gezien"}
    </button>
  );
}

function formatDate(iso: string): string {
  try {
    return `· ${new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`;
  } catch {
    return "";
  }
}
