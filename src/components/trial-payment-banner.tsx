"use client";

import { useEffect, useState } from "react";
import { fetchPaymentTrial } from "@/lib/payment-trial";

/**
 * Tells visitors of makam.co.id that payments are a trial while production pays
 * through SumoPod's sandbox (ticket 101). Decided at runtime: after hydration it
 * asks `/api/browser-config`, because one image serves staging and production
 * and statically rendered pages can't read the environment. Hidden until the
 * answer is in (and when it fails); in the page flow, pushing content down;
 * announced once (`role="status"`); no way to dismiss it.
 *
 * Unlike `StagingBanner` (a build-time value read through `useSyncExternalStore`),
 * this value is runtime server state, so it is fetched in an effect.
 */
export function TrialPaymentBanner() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let current = true;
    void fetchPaymentTrial().then((trial) => {
      if (current) setShown(trial);
    });
    return () => {
      current = false;
    };
  }, []);
  if (!shown) return null;

  return (
    <div
      role="status"
      className="w-full bg-warning px-4 py-2 print:hidden text-center text-sm font-medium leading-snug text-warning-foreground break-words"
    >
      PEMBAYARAN UJI COBA — pembayaran di Makam.co.id saat ini masih percobaan, tidak ada uang yang berpindah.
    </div>
  );
}
