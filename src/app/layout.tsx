import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StagingBanner } from "@/components/staging-banner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Makam.co.id",
  description: "Layanan pemakaman dari awal sampai akhir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      // next-themes sets the theme class on <html> before hydration (staff preview only).
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
