import AccountSideNav from "@/components/AccountSideNav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Account</h1>
        <p className="text-sm text-slate-500 mt-0.5">Beheer je profiel, credits en abonnement</p>
      </div>

      {/* Mobile tabs */}
      <div className="md:hidden">
        <AccountSideNav />
      </div>

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <AccountSideNav />
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
