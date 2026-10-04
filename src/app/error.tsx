"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { galatHalaman } from "./galat-halaman";
import { GalatIsi, isStaleAction } from "./galat-isi";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const stale = isStaleAction(error);
  useEffect(() => {
    if (galatHalaman(stale).report) Sentry.captureException(error);
  }, [error, stale]);
  return <GalatIsi stale={stale} retry={retry} />;
}
