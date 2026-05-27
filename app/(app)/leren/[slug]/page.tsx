import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DailymotionEmbed from "@/components/DailymotionEmbed";
import MarkWatchedButton from "./MarkWatchedButton";

type Lesson = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  dailymotion_id: string;
  category: string;
  sort_order: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  "brand-setup": "Brand setup",
  "tools": "Tools",
};

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("slug", slug)
    .single<Lesson>();

  if (!lesson) notFound();

  const [{ data: siblings }, { data: progressRow }] = await Promise.all([
    supabase
      .from("lessons")
      .select("slug,title,sort_order")
      .eq("category", lesson.category)
      .order("sort_order"),
    supabase
      .from("lesson_progress")
      .select("watched_at")
      .eq("user_id", user!.id)
      .eq("lesson_id", lesson.id)
      .maybeSingle(),
  ]);

  const idxInCategory = (siblings ?? []).findIndex((s) => s.slug === lesson.slug);
  const prev = idxInCategory > 0 ? siblings![idxInCategory - 1] : null;
  const next =
    siblings && idxInCategory >= 0 && idxInCategory < siblings.length - 1
      ? siblings[idxInCategory + 1]
      : null;

  const watchedAt = (progressRow as { watched_at: string } | null)?.watched_at ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link href="/leren" className="hover:text-slate-200">Leren</Link>
        <span>/</span>
        <span className="text-slate-500">{CATEGORY_LABELS[lesson.category] ?? lesson.category}</span>
        <span>/</span>
        <span className="text-slate-200">{lesson.title}</span>
      </div>

      <DailymotionEmbed videoId={lesson.dailymotion_id} title={lesson.title} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">{lesson.description}</p>
          )}
        </div>
        <MarkWatchedButton lessonId={lesson.id} watchedAt={watchedAt} />
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-white/[0.07]">
        {prev ? (
          <Link
            href={`/leren/${prev.slug}`}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/leren/${next.slug}`}
            className="text-sm text-slate-400 hover:text-white transition-colors text-right"
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
