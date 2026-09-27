/**
 * The Pemesanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Notifications } from "@/domain/notifications";
import { createPemesanan, type Pemesanan, type PemesananDeps, type PemesananNotifikasi } from "@/domain/pemesanan";
import { stafSaatDukaBaruAlert } from "@/lib/pemesanan-labels";

/**
 * The Pemesanan module, wired to the runtime's Notifications: a new order raises
 * the Peringatan Staf its recipients must see (spec, Notifications: "a new Saat
 * Duka order alerts every Admin Lokasi of the Lokasi and the Kontak Siaga by web
 * push + email at any hour"). Which Akun Staf those are is the Pemesanan
 * module's own fact; the words and the channels are the Notifications module's,
 * and it logs and retries each one.
 *
 * Without a Notifications module — a fixture that only wants to see the
 * announcement — the no-op below drops it. A placement never waits on a message:
 * the order is already written, and the Akun exists the moment its Kode Masuk
 * succeeds.
 */
export function composePemesanan(
  deps: Omit<PemesananDeps, "notifikasi"> & { notifications?: Notifications; notifikasi?: PemesananNotifikasi },
): Pemesanan {
  return createPemesanan({ ...deps, notifikasi: deps.notifikasi ?? notifikasiDari(deps.notifications) });
}

function notifikasiDari(notifications: Notifications | undefined): PemesananNotifikasi {
  if (!notifications) return { pemesananDiajukan: async () => {} };
  return {
    pemesananDiajukan: async (order) => {
      const alert = stafSaatDukaBaruAlert(order);
      for (const to of order.penerima) {
        await notifications.sendStaffAlert({ to, kind: "staf_saat_duka_baru", ...alert });
      }
    },
  };
}
