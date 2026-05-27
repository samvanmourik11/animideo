import { createClient } from "@/lib/supabase/server";
import LessonCard from "@/components/LessonCard";

type Lesson = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  dailymotion_id: string;
  category: string;
  sort_order: number;
};

type Progress = { lesson_id: string };

const CATEGORIES: { key: string; label: string; subtitle: string }[] = [
  { key: "aan-de-slag", label: "Aan de slag", subtitle: "Start met je eerste video's." },
  { key: "brand-setup", label: "Brand setup", subtitle: "Personages en huisstijl klaarzetten." },
  { key: "pro-tools", label: "Pro tools", subtitle: "Verder bewerken in Studio en Playground." },
];

export default async function LerenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: lessons }, { data: progress }] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .order("category")
      .order("sort_order"),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user!.id),
  ]);

  const watchedIds = new Set((progress as Progress[] | null)?.map((p) => p.lesson_id) ?? []);
  const all = (lessons ?? []) as Lesson[];
  const totalWatched = all.filter((l) => watchedIds.has(l.id)).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Leren</h1>
        <p className="text-sm text-slate-400 mt-1">
          {totalWatched} van {all.length} lessen afgerond
        </p>
      </div>

      <div className="space-y-10">
        {CATEGORIES.map((cat) => {
          const inCat = all.filter((l) => l.category === cat.key);
          const watchedInCat = inCat.filter((l) => watchedIds.has(l.id)).length;
          if (inCat.length === 0) return null;

          return (
            <section key={cat.key}>
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{cat.label}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{cat.subtitle}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {watchedInCat} / {inCat.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {inCat.map((l) => (
                  <LessonCard
                    key={l.id}
                    slug={l.slug}
                    title={l.title}
                    description={l.description}
                    dailymotionId={l.dailymotion_id}
                    watched={watchedIds.has(l.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
