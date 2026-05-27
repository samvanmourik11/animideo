import Link from "next/link";

export default function LessonCard({
  slug,
  title,
  description,
  dailymotionId,
  watched,
}: {
  slug: string;
  title: string;
  description: string | null;
  dailymotionId: string;
  watched: boolean;
}) {
  return (
    <Link
      href={`/leren/${slug}`}
      className="group block rounded-2xl border border-white/[0.07] bg-[#0c1428] hover:border-blue-500/40 hover:bg-[#0e1730] transition-all overflow-hidden"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.dailymotion.com/thumbnail/video/${dailymotionId}`}
          alt=""
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
        />
        {watched && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-green-500/90 text-white text-xs font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
            <span>✓</span>
            <span>Gezien</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center group-hover:bg-blue-500/80 transition-colors">
            <span className="text-white text-xl ml-1">▶</span>
          </div>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{description}</p>}
      </div>
    </Link>
  );
}
