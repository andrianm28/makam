/**
 * The Layanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Identity } from "@/domain/identity";
import type { Notifications } from "@/domain/notifications";
import {
  createLayanan,
  portPekerjaanTpu,
  type Layanan,
  type LayananDeps,
  type LayananNotifikasi,
  type PekerjaanMitraJasaPort,
  type PekerjaanSelesai,
  type PesananLayananTerbit,
} from "@/domain/layanan";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
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
 * port is for; the rows a Mitra Jasa holds are the **TPU jobs** (ticket 56), which
 * this module owns, so the port defaults to one over those tables: the scorecard, the
 * picker's "Baru" badge and a suspension's release are live. A caller may still pass
 * its own (a test that wants to seed job facts).
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
    pekerjaan: deps.pekerjaan ?? portPekerjaanTpu(deps.db, deps.clock),
    notifikasi: deps.notifikasi ?? layananNotifikasiDari(deps.notifications, deps.identity),
  });
}

export function layananNotifikasiDari(notifications: Notifications | undefined, identity?: Pick<Identity, "accountByEmail">): LayananNotifikasi {
  if (!notifications) {
    return { pesananLayananTerbit: async () => {}, pekerjaanSelesai: async () => {}, pesananTpuTerbit: async () => {}, pekerjaanTpuDitugaskan: async () => {} };
  }
  return {
    pesananTpuTerbit: async (tx, hasil) => {
      await notifications.layananTpuPesananTerbit(hasil, tx);
      // As for a Lokasi Mitra's order: the Tagihan is announced with it (H-1 and due-day reminders, the family's contact),
      // `bersamaKonfirmasi` because the order email above already carries its number and link: one email, not two.
      await notifications.tagihanTerbit(
        {
          tagihanId: hasil.tagihan.id,
          momentKind: "layanan",
          nomorTagihan: hasil.tagihan.nomorTagihan,
          nomorPemesanan: hasil.nomor,
          email: hasil.email,
          perihal: `Layanan makam di ${hasil.tpu.name}`,
          total: hasil.tagihan.total,
          dueAt: hasil.tagihan.dueAt,
          link: hasil.tagihan.link,
          bersamaKonfirmasi: true,
        },
        tx,
      );
    },
    pekerjaanTpuDitugaskan: async (hasil) => {
      // The Mitra Jasa is the Akun whose Email Terverifikasi is the address their Undangan Staf went to (ADR 0004).
      const akun = identity ? await identity.accountByEmail(hasil.mitraJasaEmail) : null;
      if (!akun) return;
      await notifications.sendStaffAlert({
        to: { accountId: akun.id },
        kind: "staf_pekerjaan_tpu_ditugaskan",
        // The email may carry what the lock screen may not, but never the family: not a name, not a number.
        email: {
          subject: "Pekerjaan baru ditugaskan ke Anda",
          text: [
            `${hasil.label} di ${hasil.tpuName}, dikerjakan ${formatTanggal(hasil.targetDate)}.`,
            `Terima atau tolak di aplikasi paling lambat ${formatTanggalJam(hasil.batasJawab)}. Tanpa jawaban, pekerjaan dianggap ditolak.`,
          ].join("\n"),
        },
        push: {
          title: "Pekerjaan baru ditugaskan",
          body: `${hasil.label}, ${hasil.tpuName}`,
          // Their list of jobs is where they answer it: Terima and Tolak are on the job itself.
          url: "/staf/mitra-jasa/pekerjaan",
        },
      });
    },
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
