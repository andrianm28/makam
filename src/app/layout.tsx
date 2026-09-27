import type { Metadata } from "next";
import { Geist_Mono, Lora, Plus_Jakarta_Sans } from "next/font/google";
import { BrowserSentry } from "@/components/browser-sentry";
import { StagingBanner } from "@/components/staging-banner";
import { ThemeProvider } from "@/components/makam/theme-provider";
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
  return (
    <html
      lang="id"
      // next-themes sets the theme class on <html> before hydration.
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {/* The browser GlitchTip DSN is a runtime value, and this page is
              statically rendered, so the browser asks the running server for it
              instead of finding it in the HTML (components/browser-sentry.tsx). */}
          <BrowserSentry />
          <StagingBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
