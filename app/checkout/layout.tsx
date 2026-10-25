// De betaalpagina's in dezelfde lichte opmaak als inloggen en de app zelf (zie app/(auth)/layout.tsx).
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-thema="licht" className="min-h-screen bg-vlak text-tekst">
      {children}
    </div>
  );
}
