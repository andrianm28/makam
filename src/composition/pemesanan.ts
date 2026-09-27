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
      pesananBuktiPemesanan: async () => {},
      terencanaDiajukan: async () => {},
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
    pesananBuktiPemesanan: async (hasil) => {
      await notifications.pesananBuktiPemesanan(hasil);
    },
    // A Pemesanan Terencana needs a Peringatan Staf of its own, and Notifications has
    // no kind for it yet: adding one belongs to the Lokasi Mitra's confirmation
    // (ticket 37), which is also where the Antrean row showing the order lands. Until
    // then this announcement is dropped, and nothing is lost but the message: the
    // order is already written, its plots are held, and a placement never waits on a
    // send. The Pemesanan module's own test records the call, so the seam is not a
    // mechanism nothing can reach.
    terencanaDiajukan: async () => {},
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
