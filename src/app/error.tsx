"use client";

import { HalamanGalat } from "@/components/makam/halaman-galat";

/**
 * Anything thrown below the root layout that no nearer `error.tsx` caught: the
 * Indonesian page in place of the framework's English one (ticket 98). The site
 * frame is not drawn here, because an error page must not depend on anything
 * that could be what failed.
 */
export default function GalatHalaman({ error }: { error: Error & { digest?: string } }) {
  return <HalamanGalat error={error} />;
}
