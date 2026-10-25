import Link from "next/link";
import type { Metadata } from "next";
import { DOELGROEPEN, DOELGROEP_IDS } from "@/lib/site/inhoud";
import { Held, Kop, Prijzen, Slot, Support, Voet, Voorbeelden, VragenBlok, video } from "@/components/site/Site";
import { Lus } from "@/components/site/VideoSpeler";

export const metadata: Metadata = {
  title: "Animideo · De Nederlandse AI-video-app",
  description: "Maak reclames, YouTube-video's, kinderverhalen en social posts met AI. Nederlandse stemmen, Nederlandse support. Probeer 7 dagen gratis.",
  alternates: { canonical: "https://animideo.com" },
};

const TEGELS: Record<string, { emoji: string; tekst: string }> = {
  youtube: { emoji: "▶️", tekst: "Complete video's met voice-over en montage, zonder zelf in beeld te komen." },
  bedrijven: { emoji: "🏪", tekst: "Plak je link en krijg een reclame, een UGC-video of een maand aan posts." },
  kinderen: { emoji: "🧸", tekst: "Animatieverhalen met vaste personages en een warme voorleesstem." },
  nederlands: { emoji: "🇳🇱", tekst: "Alle AI-tools in één app, in het Nederlands, met mensen die je helpen." },
};

export default function Voorpagina() {
  const n = DOELGROEPEN.nederlands;
  return (
    <>
      <Kop bron="home" />
      <main>
        <Held
          d={{
            id: "nederlands",
            bovenkop: "De Nederlandse AI-video-app",
            kop: "Zeg wat je wilt maken. Animideo maakt de video.",
            kopAccent: "Animideo maakt de video.",
            sub: "Reclames, YouTube-video's, kinderverhalen en social posts: je typt in gewoon Nederlands wat je nodig hebt, en de Regisseur maakt het met de beste AI voor beeld, video en stem. Met 100 Nederlandse stemmen en support van echte mensen.",
            video: "nederlands.mp4",
            poster: "nederlands.jpg",
          }}
        />

        <section className="bg-white py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4">
            <p className="text-sm font-semibold text-blue-600 text-center">Wat ga jij maken?</p>
            <h2 className="mt-2 text-3xl sm:text-5xl font-black tracking-tight text-slate-900 text-center">Eén app, vier manieren om hem te gebruiken</h2>
            <div className="mt-12 grid sm:grid-cols-2 gap-5">
              {DOELGROEP_IDS.map((id) => (
                <Link key={id} href={`/${id}`} className="group rounded-3xl ring-1 ring-slate-200 bg-white overflow-hidden hover:ring-blue-400 hover:shadow-[0_25px_60px_-25px_rgba(37,99,235,0.5)] transition">
                  <div className="aspect-video bg-slate-100 overflow-hidden">
                    <Lus src={video(DOELGROEPEN[id].stappen[2].clip)} className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-500" />
                  </div>
                  <div className="p-6">
                    <p className="text-xl font-extrabold text-slate-900">{TEGELS[id].emoji} {DOELGROEPEN[id].menu}</p>
                    <p className="mt-2 text-slate-600">{TEGELS[id].tekst}</p>
                    <p className="mt-4 font-semibold text-blue-600">Bekijk hoe het werkt →</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <Voorbeelden d={n} />
        <Prijzen bron="home" />
        <Support />
        <VragenBlok vragen={n.vragen} />
        <Slot bron="home" />
      </main>
      <Voet />
    </>
  );
}
