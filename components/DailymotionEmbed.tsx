export default function DailymotionEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/[0.07]">
      <iframe
        src={`https://geo.dailymotion.com/player.html?video=${videoId}`}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
