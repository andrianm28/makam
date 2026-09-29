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
 * Both messages are queued on the transaction that writes what they are about
 * (Notifications' `within` parameter), so neither exists without its order or its finished
 * job. Without a Notifications module — a fixture that only wants to see the
 * announcement — the no-op below drops it.
 */
export function composeLayanan(
  deps: Omit<LayananDeps, "notifikasi"> & { notifications?: Notifications; notifikasi?: LayananNotifikasi },
): Layanan {
  return createLayanan({ ...deps, notifikasi: deps.notifikasi ?? layananNotifikasiDari(deps.notifications) });
}

export function layananNotifikasiDari(notifications: Notifications | undefined): LayananNotifikasi {
  if (!notifications) return { pesananLayananTerbit: async () => {}, pekerjaanSelesai: async () => {} };
  return {
    pesananLayananTerbit: async (tx, hasil) => {
      // Both messages are queued on the order's own transaction (Notifications' `within` parameter).
      await notifications.layananPesananTerbit(hasil, tx);
      // The Tagihan itself is announced too (ticket 89): its H-1 and due-day reminders are queued from
      // here and the family's contact is recorded. `bersamaKonfirmasi` because the order email above
      // already carries the Tagihan's number and link, so the family gets one email, not two.
      await notifications.tagihanTerbit(
        {
          tagihanId: hasil.tagihan.id,
          momentKind: "layanan",
          nomorTagihan: hasil.tagihan.nomorTagihan,
          nomorPemesanan: hasil.nomor,
          email: hasil.email,
          perihal: `Layanan makam di ${hasil.lokasi.name}`,
          total: hasil.tagihan.total,
          dueAt: hasil.tagihan.dueAt,
          link: hasil.tagihan.link,
          bersamaKonfirmasi: true,
        },
        tx,
      );
    },
    pekerjaanSelesai: async (tx, hasil) => {
      await notifications.layananPekerjaanSelesai(hasil, tx);
    },
  };
}

export { labelBuktiPekerjaan };
export type { PekerjaanSelesai, PesananLayananTerbit };
