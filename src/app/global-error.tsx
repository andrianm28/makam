"use client";

import "./globals.css";
import { HalamanGalat } from "@/components/makam/halaman-galat";

/**
 * The root layout itself failed. This page replaces it, so it brings its own
 * `<html>`, `<body>` and stylesheet; it carries the same Indonesian message and
 * report as `error.tsx` (ticket 98).
 *
 * It also gives the brand font's variable a system sans-serif value. The layout
 * is what declares that variable, so here `font-sans` would point at a variable
 * nobody set, the declaration would be void and the browser's default serif
 * would show.
 */
export default function GalatGlobal({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="id" className="h-full antialiased [--font-plus-jakarta:ui-sans-serif,system-ui,sans-serif]">
      <body className="min-h-full flex flex-col">
        <HalamanGalat error={error} />
      </body>
    </html>
  );
}
