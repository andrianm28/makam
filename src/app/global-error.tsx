"use client";

import "./globals.css";
import { HalamanGalat } from "@/components/makam/halaman-galat";

/**
 * The root layout itself failed. This page replaces it, so it brings its own
 * `<html>`, `<body>` and stylesheet; it carries the same Indonesian message and
 * report as `error.tsx` (ticket 98).
 */
export default function GalatGlobal({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <HalamanGalat error={error} />
      </body>
    </html>
  );
}
