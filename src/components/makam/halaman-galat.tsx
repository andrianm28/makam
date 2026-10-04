"use client";

import * as Sentry from "@sentry/nextjs";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { startBrowserSentry } from "@/instrumentation-client";

/**
 * What `error.tsx` and `global-error.tsx` show when something threw that nothing
 * nearer caught, in place of the framework's English "This page couldn't load".
 *
 * Two cases. A form left open across a deploy posts the Server Action id of the
 * old build, which the new build does not know: the server answers 404 with
 * `x-nextjs-action-not-found` and the client throws an unrecognized-action
 * error. Nothing is wrong with the order or the data; the page itself is old, so
 * the one thing that helps is loading it again, and it is not reported (it
 * happens to everyone with a form open at every deploy). Any other error gets a
 * generic page with Muat ulang and Beranda, and is reported to GlitchTip.
 *
 * Both buttons are full page loads on purpose: after an error the client's own
 * state cannot be trusted, and a stale bundle only a reload replaces.
 */
export function HalamanGalat({ error }: { error: unknown }) {
  const stale = unstable_isUnrecognizedActionError(error);

  useEffect(() => {
    // The prerendered shell of global-error has no error at all; there is nothing to report then.
    if (stale || !error) return;
    // global-error replaces the root layout, which is what starts browser reporting, so start it here as well
    // (idempotent); an event sent before the SDK has started is dropped. The digest ties this event to the
    // server's own, for an error that began in a Server Component.
    const digest = (error as { digest?: unknown }).digest;
    void startBrowserSentry().then(() =>
      Sentry.captureException(error, { tags: { step: "error_boundary", ...(typeof digest === "string" ? { digest } : {}) } }),
    );
  }, [error, stale]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-6 px-(--page-gutter) py-16">
      <h1 className="text-title-1 font-semibold tracking-tight">
        {stale ? "Halaman ini sudah diperbarui" : "Halaman ini tidak bisa dimuat"}
      </h1>
      <p className="text-body-lg text-muted-foreground">
        {stale
          ? "Makam.co.id baru saja diperbarui, sehingga halaman yang Anda buka sudah usang. Muat ulang halaman ini untuk melanjutkan. Isian yang belum terkirim mungkin perlu diisi lagi."
          : "Terjadi gangguan saat memuat halaman ini. Muat ulang halaman, atau kembali ke Beranda."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => window.location.reload()}>
          Muat ulang
        </Button>
        {stale ? null : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose, see above; global-error has no router
          <a href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Beranda
          </a>
        )}
      </div>
    </main>
  );
}
