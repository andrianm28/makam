import type { Metadata } from "next";
import { Geist_Mono, Lora, Plus_Jakarta_Sans } from "next/font/google";
import { StagingBanner } from "@/components/staging-banner";
import { ThemeProvider } from "@/components/makam/theme-provider";
import { readPublicSentryEnv } from "@/lib/env";
import "./globals.css";

/** The brand typeface for all UI, staff and public (docs/design-system.md). */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

/** Only for codes people copy or read out (Nomor Pemesanan, rekening): `font-mono`. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Emotional headlines on the public site only (`font-serif`), never in the
 * staff area. Not preloaded, so pages that don't use it never fetch it.
 */
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Makam.co.id",
  description: "Layanan pemakaman dari awal sampai akhir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The browser GlitchTip DSN is a runtime value, not a build argument: the same
  // image runs on staging and on production, and each reports to its own DSN.
  // Reading it here puts it in the page; the client picks it up in
  // instrumentation-client.ts. An empty DSN leaves browser reporting off.
  const { NEXT_PUBLIC_SENTRY_DSN } = readPublicSentryEnv(process.env);
  return (
    <html
      lang="id"
      // next-themes sets the theme class on <html> before hydration.
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <head>
        {/* JSON.stringify escapes it; the value is validated as a URL first. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__MAKAM_BROWSER_SENTRY_DSN__=${JSON.stringify(NEXT_PUBLIC_SENTRY_DSN ?? "")};`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <StagingBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
