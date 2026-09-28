/**
 * The Pemesanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Notifications } from "@/domain/notifications";
import { createPemesanan, type Pemesanan, type PemesananDeps, type PemesananNotifikasi } from "@/domain/pemesanan";
import { stafSaatDukaBelumDikonfirmasiAlert, stafSaatDukaBaruAlert } from "@/lib/pemesanan-labels";

/**
 * The Pemesanan module, wired to the runtime's Notifications: a new order raises
 * the family message and the Peringatan Staf its recipients must see (spec,
 * Notifications: "a new Saat Duka order alerts every Admin Lokasi of the Lokasi
 * and the Kontak Siaga by web push + email at any hour"). Which Akun Staf those
 * are is the Pemesanan module's own fact; the words and the channels are the
 * Notifications module's, and it logs and retries each one. The re-alert and the
 * confirmation message are the same story, one hour and one plot later.
 *
 * A Pemesanan Terencana's own three answers — confirmed, declined, cancelled — are
 * family messages of the same kind, so they go out the same way (ticket 37), as does
 * the Tagihan its confirmation issues: the module is what issues that Tagihan, so it is
 * also what announces it, and the announcement is what queues the Terencairan rule's
 * one reminder.
 *
 * Without a Notifications module — a fixture that only wants to see the
 * announcement — the no-op below drops it. A placement never waits on a message:
 * the order is already written, and the Akun exists the moment its Kode Masuk
 * succeeds.
 */
export function composePemesanan(
  deps: Omit<PemesananDeps, "notifikasi"> & { notifications?: Notifications; notifikasi?: PemesananNotifikasi },
): Pemesanan {
  return createPemesanan({ ...deps, notifikasi: deps.notifikasi ?? pemesananNotifikasiDari(deps.notifications) });
}

export function pemesananNotifikasiDari(notifications: Notifications | undefined): PemesananNotifikasi {
  if (!notifications) {
    return {
      pesananDiajukan: async () => {},
      pesananBelumDikonfirmasi: async () => {},
      pesananDikonfirmasi: async () => {},
      terencanaDiajukan: async () => {},
      terencanaDikonfirmasi: async () => {},
      terencanaDitolak: async () => {},
      terencanaDibatalkan: async () => {},
      tagihanTerbit: async () => {},
    };
  }
  return {
    pesananDiajukan: async (order) => {
      await notifications.pesananDiajukan({
        pemesananId: order.id,
        nomor: order.nomor,
        email: order.pemesan.email,
        pemesanName: order.pemesan.name,
        lokasi: order.lokasi,
        jenisMakamName: order.jenisMakamName,
        almarhum: order.almarhum,
        rencanaPemakamanAt: order.rencanaPemakamanAt,
        konfirmasiDueAt: order.konfirmasiDueAt,
      });
      await kirimStaf(notifications, order, stafSaatDukaBaruAlert(order), "staf_saat_duka_baru");
    },
    pesananBelumDikonfirmasi: async (order) => {
      await kirimStaf(notifications, order, stafSaatDukaBelumDikonfirmasiAlert(order), "staf_saat_duka_belum_dikonfirmasi");
    },
    pesananDikonfirmasi: async (hasil) => {
      await notifications.pesananDikonfirmasi(hasil);
    },
    // A Pemesanan Terencana still needs a Peringatan Staf of its own, and Notifications
    // has no kind for it yet: a staff alert is a Peringatan Staf by push to every
    // Perangkat Push and by email (spec, Notifications), which the Antrean Lokasi row
    // does not raise on its own. Until that kind exists this announcement is dropped,
    // and nothing is lost but the message: the order is already written, its plots are
    // held, its Konfirmasi Terencana row is in the Antrean Lokasi, and a placement
    // never waits on a send. The Pemesanan module's own test records the call, so the
    // seam is not a mechanism nothing can reach.
    terencanaDiajukan: async () => {},
    terencanaDikonfirmasi: async (input) => {
      await notifications.terencanaDikonfirmasi(input);
    },
    terencanaDitolak: async (input) => {
      await notifications.terencanaDitolak(input);
    },
    terencanaDibatalkan: async (input) => {
      await notifications.terencanaDibatalkan(input);
    },
    tagihanTerbit: async (input) => {
      await notifications.tagihanTerbit({
        tagihanId: input.tagihanId,
        // A Terencairan Tagihan is pay-first and its rule is its own: one reminder,
        // about 4 h before the hold ends (spec, Notifications' reminder table).
        momentKind: "terencana",
        nomorTagihan: input.nomorTagihan,
        nomorPemesanan: input.nomorPemesanan,
        email: input.email,
        perihal: input.perihal,
        total: input.total,
        dueAt: input.dueAt,
        link: input.link,
      });
    },
  };
}

/** One Peringatan Staf to every Akun Staf that must see this order, by name of the kind. */
async function kirimStaf(
  notifications: Notifications,
  order: { penerima: { accountId: string }[] },
  alert: ReturnType<typeof stafSaatDukaBaruAlert>,
  kind: "staf_saat_duka_baru" | "staf_saat_duka_belum_dikonfirmasi",
): Promise<void> {
  for (const to of order.penerima) {
    await notifications.sendStaffAlert({ to, kind, ...alert });
  }
}
