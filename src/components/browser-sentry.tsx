"use client";

import { useEffect } from "react";
import { startBrowserSentry } from "@/instrumentation-client";

/**
 * Starts browser error reporting as soon as the client is running. It has to be
 * a client component: the DSN is a runtime value, and a static page's HTML is
 * written at build time (see instrumentation-client.ts).
 */
export function BrowserSentry() {
  useEffect(() => {
    void startBrowserSentry();
  }, []);
  return null;
}
