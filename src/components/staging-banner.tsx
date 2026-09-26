"use client";

import { useSyncExternalStore } from "react";
import { showsStagingBanner } from "@/lib/env";

const noSubscription = () => () => {};

/**
 * Tells visitors of staging (dev.makam.co.id) that it is not the real service.
 * Decided in the browser from the page's host, because one image serves staging
 * and production and statically rendered pages can't read the runtime
 * environment. The server snapshot is "hidden", so the server HTML and the first
 * client render agree and the banner appears after hydration. It sits in the page
 * flow, pushing content down, and can't be dismissed.
 */
export function StagingBanner() {
  const shown = useSyncExternalStore(
    noSubscription,
    () => showsStagingBanner(window.location.hostname),
    () => false,
  );
  if (!shown) return null;

  return (
    <div
      role="status"
      className="w-full bg-warning px-4 py-2 print:hidden text-center text-sm font-medium leading-snug text-warning-foreground break-words"
    >
      STAGING — bukan layanan resmi Makam.co.id. Data dan pembayaran di sini hanya untuk uji coba.
    </div>
  );
}
