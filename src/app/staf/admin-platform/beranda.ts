import "server-only";
import { wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

export interface AdminPlatformBeranda {
  lokasiMitra: { terverifikasi: number; belumTayang: number; ditangguhkan: number; berhenti: number };
  staf: { aktif: number; undanganTerbuka: number };
  /** The first Hari Libur Nasional from today (WIB), today included; null when none is listed. */
  hariLiburBerikutnya: { date: string; name: string } | null;
  /** False until an Admin Platform first enters Pengaturan Operator (nothing is seeded). */
  pengaturanOperatorDiisi: boolean;
}

/** What the Admin Platform Beranda summarises, from the modules' public queries. Admin Platform only. */
export async function adminPlatformBeranda(): Promise<AdminPlatformBeranda> {
  const actor = await staffMenuActor("admin_platform");
  const { lokasi, identity, operatorSettings, adapters } = serverRuntime();
  const [lokasiMitra, accounts, invites, hariLibur, settings] = await Promise.all([
    lokasi.allLokasiMitra(actor),
    identity.staffAccounts(),
    identity.openStaffInvites(),
    lokasi.hariLiburNasional(),
    operatorSettings.current(),
  ]);
  const count = (status: string) => lokasiMitra.filter((item) => item.status === status).length;
  const today = wibDateOf(adapters.clock.now());

  return {
    lokasiMitra: {
      terverifikasi: count("terverifikasi"),
      belumTayang: count("belum_tayang"),
      ditangguhkan: count("ditangguhkan"),
      berhenti: count("berhenti"),
    },
    staf: {
      aktif: accounts.filter((account) => !account.deactivated).length,
      undanganTerbuka: invites.length,
    },
    hariLiburBerikutnya:
      hariLibur
        .filter((day) => day.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(0) ?? null,
    pengaturanOperatorDiisi: settings !== null,
  };
}
