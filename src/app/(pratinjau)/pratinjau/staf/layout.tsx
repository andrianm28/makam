/*
 * PROTOTYPE, throwaway. Question it answers: "how should the redesigned staff
 * area and its design system look and behave?" Mock data only, no database,
 * no login, nothing is saved. Reachable only when APP_ENV is development (and
 * never in a production build); everywhere else it is a 404.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "./_shell/app-shell";

export const metadata: Metadata = {
  title: "Pratinjau Area Staf | Makam.co.id",
  robots: { index: false, follow: false },
};

function previewAllowed() {
  return process.env.NODE_ENV !== "production" && (process.env.APP_ENV ?? "development") === "development";
}

export default async function PratinjauLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!previewAllowed()) notFound();
  const sidebarCookie = (await cookies()).get("sidebar_state")?.value;
  return <AppShell defaultSidebarOpen={sidebarCookie !== "false"}>{children}</AppShell>;
}
