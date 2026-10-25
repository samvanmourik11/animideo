// Inloggen en account aanmaken in de lichte opmaak van de nieuwe app. Wie hier komt is nog niet
// ingelogd, dus er is geen thema-keuze om te volgen: altijd licht, zodat de eerste indruk
// hetzelfde is als de app zelf (en als de Academy-video's).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-thema="licht" className="min-h-screen bg-vlak text-tekst">
      {children}
    </div>
  );
}
