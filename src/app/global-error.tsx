"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { startBrowserSentry } from "@/instrumentation-client";
import { galatHalaman } from "./galat-halaman";
import { GalatIsi, isStaleAction } from "./galat-isi";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const stale = isStaleAction(error);
  useEffect(() => {
    if (!galatHalaman(stale).report) return;
    // The root layout (and its BrowserSentry) is replaced here, so start reporting ourselves.
    void startBrowserSentry().finally(() => Sentry.captureException(error));
  }, [error, stale]);
  return (
    <html lang="id">
      <body style={{ margin: 0 }}>
        <GalatIsi stale={stale} retry={retry} />
      </body>
    </html>
  );
}
