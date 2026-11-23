// Downloadlink voor een bestand uit onze Supabase-opslag.
//
// Een gewone <a download> naar een ander domein wordt door Safari (iPad/iPhone)
// genegeerd: de video opent dan in een nieuw tabblad en de klant "krijgt een link"
// in plaats van een bestand. Met ?download=<naam> stuurt de opslag zelf
// "Content-Disposition: attachment" mee, en dan slaat elke browser het bestand op.

const OPSLAG = "/storage/v1/object/public/";

/** Bestandsnaam zonder vreemde tekens, met de extensie van de bron-url erachter. */
export function downloadNaam(url: string, naam: string): string {
  const pad = url.split("?")[0];
  const ext = /\.([a-z0-9]{2,5})$/i.exec(pad)?.[1]?.toLowerCase();
  const kaal = naam.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "") || "animideo";
  return ext ? `${kaal}.${ext}` : kaal;
}

/** Link die het bestand echt downloadt. Urls van buiten onze opslag blijven ongewijzigd. */
export function downloadLink(url: string, naam: string): string {
  if (!url.includes(OPSLAG)) return url;
  return `${url.split("?")[0]}?download=${encodeURIComponent(downloadNaam(url, naam))}`;
}
