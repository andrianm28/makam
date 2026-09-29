/**
 * The Layanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Notifications } from "@/domain/notifications";
import {
  createLayanan,
  type Layanan,
  type LayananDeps,
  type LayananNotifikasi,
  type PekerjaanMitraJasaPort,
  type PekerjaanSelesai,
  type PesananLayananTerbit,
} from "@/domain/layanan";
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
 *
 * `pekerjaan` is the port the Mitra Jasa scorecard and a suspension reach for
 * (ticket 55): the jobs one Mitra Jasa holds. A Lokasi Mitra's job (ticket 50) is
 * done by the Admin Lokasi, never by a Mitra Jasa, so those rows are not what the
 * port is for; the rows a Mitra Jasa holds belong to the TPU ticket (56). Until it
 * lands the stand-in below is what that state actually looks like: no job, so no
 * scorecard number and nothing to release on a suspension.
 */
export function composeLayanan(
  deps: Omit<LayananDeps, "notifikasi" | "pekerjaan"> & {
    notifications?: Notifications;
    notifikasi?: LayananNotifikasi;
    pekerjaan?: PekerjaanMitraJasaPort;
  },
): Layanan {
  return createLayanan({
    ...deps,
    pekerjaan: deps.pekerjaan ?? belumAdaPekerjaan(),
    notifikasi: deps.notifikasi ?? layananNotifikasiDari(deps.notifications),
  });
}

/** The job port as it stands before a Mitra Jasa holds any job: nothing to list, nothing to release. */
function belumAdaPekerjaan(): PekerjaanMitraJasaPort {
  const port: PekerjaanMitraJasaPort = {
    async daftarPekerjaan() {
      return [];
    },
    async jumlahSelesai(ids) {
      return Object.fromEntries(ids.map((id) => [id, 0]));
    },
    async lepasPekerjaan() {
      return { ok: false, reason: "tidak_ditemukan" };
    },
    within() {
      return port;
    },
  };
  return port;
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
