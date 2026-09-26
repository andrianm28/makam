/*
 * PROTOTYPE, throwaway. Question it answers: "how should the public site look
 * (Beranda, Daftar Lokasi Makam, a Lokasi Mitra page and the two Saat Duka
 * wizard screens) on the brand, on desktop and phone?" Mock data only, no
 * database, no login, nothing is saved or sent. Reachable only when APP_ENV is
 * development (and never in a production build); everywhere else it is a 404.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SiteShell } from "./_parts/site-shell";

export const metadata: Metadata = {
  title: "Pratinjau Situs Publik | Makam.co.id",
  robots: { index: false, follow: false },
};

function previewAllowed() {
  return process.env.NODE_ENV !== "production" && (process.env.APP_ENV ?? "development") === "development";
}

export default async function PratinjauPublikLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!previewAllowed()) notFound();
  return <SiteShell>{children}</SiteShell>;
}
