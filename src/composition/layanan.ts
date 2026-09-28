/**
 * The Layanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Notifications } from "@/domain/notifications";
import { createLayanan, type Layanan, type LayananDeps, type LayananNotifikasi, type PekerjaanSelesai, type PesananLayananTerbit } from "@/domain/layanan";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";

/**
 * The Layanan module, wired to the runtime's Notifications: a new order tells its
 * Pemesan the price and the deadline, and a finished job sends the Pemesan the
 * link to its photo proof. Which Akun those are and what the words are is the
 * Notifications module's; this only says who must hear it and what they need.
 *
 * Without a Notifications module — a fixture that only wants to see the
 * announcement — the no-op below drops it. Neither an order nor a finished job
 * ever waits on a message: both are already written, and a family that never
 * hears about the proof still has it on their own order page.
 */
export function composeLayanan(
  deps: Omit<LayananDeps, "notifikasi"> & { notifications?: Notifications; notifikasi?: LayananNotifikasi },
): Layanan {
  return createLayanan({ ...deps, notifikasi: deps.notifikasi ?? layananNotifikasiDari(deps.notifications) });
}

export function layananNotifikasiDari(notifications: Notifications | undefined): LayananNotifikasi {
  if (!notifications) return { pesananLayananTerbit: async () => {}, pekerjaanSelesai: async () => {} };
  return {
    pesananLayananTerbit: async (hasil) => {
      await notifications.layananPesananTerbit(hasil);
    },
    pekerjaanSelesai: async (hasil) => {
      await notifications.layananPekerjaanSelesai(hasil);
    },
  };
}

export { labelBuktiPekerjaan };
export type { PekerjaanSelesai, PesananLayananTerbit };
