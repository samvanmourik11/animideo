"use client";

import { useState } from "react";
import { telling, type BronLink } from "@/lib/trends/types";

// "Zo ziet de trend eruit": de originele video in de speler van TikTok/YouTube/Instagram,
// met de andere voorbeelden (video's en screenshots) eronder om tussen te wisselen.
export default function TrendVoorbeeld({ links, trendvideo }: { links: BronLink[]; trendvideo?: string | null }) {
  const items = [
    ...(trendvideo ? [{ soort: "video" as const, src: trendvideo, beeld: undefined, url: undefined, tiktok: undefined }] : []),
    // De meest bekeken TikTok eerst: dat is het sterkste bewijs dat dit viral gaat.
    ...links
      .filter((l) => l.embed)
      .sort((a, b) => (b.tiktok?.weergaven ?? 0) - (a.tiktok?.weergaven ?? 0))
      .map((l) => ({ soort: "embed" as const, src: l.embed!, beeld: l.beeld, url: l.url, tiktok: l.tiktok })),
    ...links.filter((l) => !l.embed && l.beeld).map((l) => ({ soort: "beeld" as const, src: l.beeld!, beeld: l.beeld, url: l.url, tiktok: undefined })),
  ];
  const [gekozen, setGekozen] = useState(0);
  // De speler van TikTok/Instagram laadt hun cookievenster mee; pas laden als iemand op ▶ klikt.
  const [speel, setSpeel] = useState(false);
  if (items.length === 0) return null;
  const nu = items[Math.min(gekozen, items.length - 1)];

  return (
    <div className="n-kaart p-4 space-y-3">
      <p className="text-sm font-semibold text-tekst-2">De originele trend</p>
      <div className="mx-auto max-w-[340px]">
        {nu.soort === "video" && <video src={nu.src} controls autoPlay muted loop playsInline className="w-full rounded-2xl border border-rand" />}
        {nu.soort === "embed" && !speel && nu.beeld && (
          <button onClick={() => setSpeel(true)} className="group relative block w-full aspect-[9/16] rounded-2xl overflow-hidden border border-rand bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nu.beeld} alt="Voorbeeld van de trend" className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/60 text-white text-2xl w-16 h-16 flex items-center justify-center group-hover:bg-orange-500">▶</span>
            </span>
          </button>
        )}
        {nu.soort === "embed" && (speel || !nu.beeld) && (
          <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden border border-rand bg-black">
            <iframe
              src={nu.src}
              title="Voorbeeld van de trend"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 w-full h-full"
            />
          </div>
        )}
        {nu.soort === "beeld" && (
          <a href={nu.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={nu.src} alt="Voorbeeld van de trend" className="w-full rounded-2xl border border-rand" />
          </a>
        )}
      </div>
      {nu.tiktok && (
        <div className="mx-auto max-w-[340px] space-y-1">
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { icoon: "▶", waarde: nu.tiktok.weergaven, label: "weergaven" },
              { icoon: "♥", waarde: nu.tiktok.likes, label: "likes" },
              { icoon: "💬", waarde: nu.tiktok.reacties, label: "reacties" },
              { icoon: "↗", waarde: nu.tiktok.gedeeld, label: "gedeeld" },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-paneel-2 px-1 py-1.5">
                <div className="text-sm font-bold text-tekst">{x.icoon} {telling(x.waarde)}</div>
                <div className="text-[10px] text-tekst-3">{x.label}</div>
              </div>
            ))}
          </div>
          <a href={nu.url} target="_blank" rel="noreferrer" className="block text-center text-xs text-blue-500 hover:text-blue-400">
            {speel ? "Speelt hij niet af? Bekijk hem op TikTok ↗" : `@${nu.tiktok.maker} op TikTok ↗`}
          </a>
        </div>
      )}
      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                setGekozen(i);
                setSpeel(false);
              }}
              className={`relative shrink-0 h-20 w-14 rounded-lg overflow-hidden border-2 ${i === gekozen ? "border-orange-500" : "border-rand"}`}
            >
              {it.beeld ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.beeld} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="flex w-full h-full items-center justify-center bg-paneel-2 text-lg">▶</span>
              )}
              {it.soort !== "beeld" && (
                <span className="absolute bottom-0.5 inset-x-0.5 text-[9px] text-center bg-black/60 text-white rounded px-0.5">▶ {it.tiktok ? telling(it.tiktok.weergaven) : ""}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
