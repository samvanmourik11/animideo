"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  userId: string;
  userEmail: string;
}

/**
 * Runs once on dashboard mount. If the user paid before creating an account
 * (guest checkout flow), this claims the pending checkout and links it to
 * their new account — giving them the correct plan + credits automatically.
 */
export default function PendingCheckoutHandler({ userId, userEmail }: Props) {
  const router = useRouter();

  useEffect(() => {
    async function claimPendingCheckout() {
      try {
        const res = await fetch("/api/mollie/claim-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, email: userEmail }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.claimed) {
            // Refresh so credits + plan badge update in the navbar
            router.refresh();
          }
        }
      } catch {
        // Silent — not critical if this fails
      }
    }
    claimPendingCheckout();
  }, [userId, userEmail, router]);

  return null;
}
