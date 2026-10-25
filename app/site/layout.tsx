import Script from "next/script";

// animideo.com. Dezelfde Meta-pixel als de betaalpagina's, zodat de advertenties de hele
// route zien: bezoek → klik op "gratis week" → gestart.
const FB_PIXEL_ID = "7827964890555370";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="nl" className="min-h-screen bg-white text-slate-900 antialiased">
      <Script id="fb-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${FB_PIXEL_ID}');fbq('track','PageView');
        document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href*="/start"]');if(a)fbq('track','InitiateCheckout');});
      `}</Script>
      {children}
    </div>
  );
}
