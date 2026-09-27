import type { Metadata } from "next";
import { cookies } from "next/headers";
import { KeluarButton } from "@/app/akun/keluar-button";
import { BrandLogo } from "@/components/makam/brand-logo";
import { StaffToaster } from "@/components/makam/staff-toaster";
import { staffShell } from "@/server/staff-area";
import { PushPanel } from "./push-panel";
import { StaffShell } from "./staff-shell";

export { viewport } from "./viewport";

export const metadata: Metadata = {
  title: "Area Staf | Makam.co.id",
  robots: { index: false, follow: false },
  // Installable staff app: manifest, iPhone home-screen icon and standalone mode.
  manifest: "/staf.webmanifest",
  icons: { apple: "/icons/staf-apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Makam Staf", statusBarStyle: "default" },
};

/**
 * The staff area: its own section of the app, apart from the public site and
 * Akun Saya. A signed-in Akun Staf gets the staff shell; the TOTP step (and
 * anyone the pages send on elsewhere) renders bare.
 */
export default async function StafLayout({ children }: LayoutProps<"/staf">) {
  const shell = await staffShell();
  if (!shell) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex h-(--header-height) w-full max-w-4xl items-center justify-between gap-4 px-6">
            <BrandLogo caption="Area Staf" />
            <KeluarButton size="sm" />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
          <PushPanel />
          {children}
        </main>
        <StaffToaster />
      </div>
    );
  }
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <StaffShell shell={shell} defaultSidebarOpen={sidebarOpen}>
      <PushPanel />
      {children}
      <StaffToaster />
    </StaffShell>
  );
}
