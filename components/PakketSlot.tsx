import Link from "next/link";
import { PLAN_NAAM, VANAF, upgradeTekst, type Recht } from "@/lib/plan-rechten";

// Blok dat zegt dat iets in een hoger pakket zit, met de knop naar Abonnementen. Het slot
// zelf zit op de server; dit is alleen zodat de klant niet eerst een foutmelding krijgt.
export default function PakketSlot({ recht, compact }: { recht: Recht; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 ${compact ? "p-3" : "p-5"} flex flex-wrap items-center gap-3`}>
      <span className="text-xl">🔒</span>
      <p className="text-sm text-tekst-2 flex-1 min-w-[200px]">{upgradeTekst(recht)}</p>
      <Link href="/pricing" className="btn-primary !py-2 !px-4 text-sm whitespace-nowrap">Bekijk {PLAN_NAAM[VANAF[recht]]} →</Link>
    </div>
  );
}
