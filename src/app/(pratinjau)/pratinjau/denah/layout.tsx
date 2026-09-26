/*
 * PROTOTYPE, throwaway. Question it answers: "how should the Admin Lokasi's
 * Denah editor work (Blok, Petak Makam / Jalan / Bukan Petak, bulk edits,
 * Kavling Keluarga, used Petak) on desktop and phone?" Mock data held in client
 * state only: no database, no login, nothing is saved. Reachable only when
 * APP_ENV is development (and never in a production build); elsewhere a 404.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PrototipeShell } from "./_parts/prototipe-shell";

export const metadata: Metadata = {
  title: "Pratinjau Denah | Makam.co.id",
  robots: { index: false, follow: false },
};

function previewAllowed() {
  return process.env.NODE_ENV !== "production" && (process.env.APP_ENV ?? "development") === "development";
}

export default async function PratinjauDenahLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!previewAllowed()) notFound();
  return <PrototipeShell>{children}</PrototipeShell>;
}
