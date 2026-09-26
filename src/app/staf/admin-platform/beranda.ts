import "server-only";
import type { HariLiburNasional, LokasiMitraStatus } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

export interface AdminPlatformBeranda {
  /** How many Lokasi Mitra are in each status. */
  lokasiMitra: Record<LokasiMitraStatus, number>;
  staf: { aktif: number; undanganTerbuka: number };
  /** The first Hari Libur Nasional from today (WIB), today included; null when none is listed. */
  hariLiburBerikutnya: HariLiburNasional | null;
  /** False until an Admin Platform first enters Pengaturan Operator (nothing is seeded). */
  pengaturanOperatorDiisi: boolean;
}

/** What the Admin Platform Beranda summarises, composed from the modules' public queries. Admin Platform only. */
export async function adminPlatformBeranda(): Promise<AdminPlatformBeranda> {
  const actor = await staffMenuActor("admin_platform");
  const { lokasi, identity, operatorSettings } = serverRuntime();
  const [lokasiMitra, accounts, invites, hariLiburBerikutnya, settings] = await Promise.all([
    lokasi.lokasiMitraCountsByStatus(actor),
    identity.staffAccounts(),
    identity.openStaffInvites(),
    lokasi.nextHariLiburNasional(),
    operatorSettings.current(),
  ]);
  return {
    lokasiMitra,
    staf: {
      aktif: accounts.filter((account) => !account.deactivated).length,
      undanganTerbuka: invites.length,
    },
    hariLiburBerikutnya,
    pengaturanOperatorDiisi: settings !== null,
  };
}
