"use client";

import { useEffect, useState } from "react";
import { barisBanner, fetchBrowserTrial } from "@/lib/payment-trial";

/**
 * Tells visitors of makam.co.id that payments are a trial while production pays
 * through SumoPod's sandbox (ticket 101). Decided at runtime: after hydration it
 * asks `/api/browser-config`, because one image serves staging and production
 * and statically rendered pages can't read the environment. Hidden until the
 * answer is in (and when it fails); in the page flow, pushing content down;
 * announced once (`role="status"`); no way to dismiss it.
 *
 * While Data Contoh is active (ticket 109) it adds a second line saying the marked records
 * and their prices are examples.
 *
 * Unlike `StagingBanner` (a build-time value read through `useSyncExternalStore`),
 * this value is runtime server state, so it is fetched in an effect.
 */
export function TrialPaymentBanner() {
  const [baris, setBaris] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    void fetchBrowserTrial().then((trial) => {
      if (current) setBaris(barisBanner(trial));
    });
    return () => {
      current = false;
    };
  }, []);
  if (baris.length === 0) return null;

  return (
    <div
      role="status"
      className="w-full bg-warning px-4 py-2 print:hidden text-center text-sm font-medium leading-snug text-warning-foreground break-words"
    >
      {baris.map((teks) => (
        <p key={teks}>{teks}</p>
      ))}
    </div>
  );
}
