/**
 * The Pemesanan module for a process, composed from the modules already built
 * there: it reaches its neighbours only through their public functions, never
 * their tables.
 */
import type { Database } from "@/db/client";
import type { Notifications } from "@/domain/notifications";
import { createPemesanan, type Pemesanan, type PemesananDeps, type PemesananNotifikasi } from "@/domain/pemesanan";
import { stafCalonPenghuniBerubahAlert, stafGantiPemegangHakAlert, stafSaatDukaBelumDikonfirmasiAlert, stafSaatDukaBaruAlert, stafTerencanaBaruAlert } from "@/lib/pemesanan-labels";

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
      tagihanTerbit: async () => ({ ok: true, diingatkan: 0 }),
      pesananDiajukan: async () => {},
      peringatanStafSaatDuka: async () => {},
      pesananBelumDikonfirmasi: async () => {},
      pesananDikonfirmasi: async () => {},
      peringatanStafAhliWaris: async () => {},
      pesananDitolak: async () => {},
      pesananAlternatifDitawarkan: async () => {},
      pesananDibatalkan: async () => {},
      tumpangMintaPersetujuan: async () => {},
      tumpangDitolak: async () => {},
      pesananBuktiPemesanan: async () => {},
      terencanaDiajukan: async () => {},
      terencanaDikonfirmasi: async () => {},
      terencanaDitolak: async () => {},
      terencanaBatasBayarLewat: async () => {},
      terencanaBukti: async () => {},
      pembatalanTerencana: async () => {},
      calonPenghuniBerubah: async () => {},
      chasingDijadwalkan: async () => {},
      tidakTertagihDinyatakan: async () => {},
    };
  }
  return {
    tagihanTerbit: (tx, input) => notifications.tagihanTerbit(input, tx),
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
    },
    // The new order's Peringatan Staf, queued inside the order's own transaction (ticket 96).
    peringatanStafSaatDuka: async (tx, order) => {
      await kirimStaf(notifications, order, stafSaatDukaBaruAlert(order), "staf_saat_duka_baru", tx);
    },
    peringatanStafAhliWaris: async (tx, order) => {
      await kirimStaf(notifications, order, stafGantiPemegangHakAlert(order), "staf_ganti_pemegang_hak", tx);
    },
    pesananBelumDikonfirmasi: async (order) => {
      await kirimStaf(notifications, order, stafSaatDukaBelumDikonfirmasiAlert(order), "staf_saat_duka_belum_dikonfirmasi");
    },
    pesananDikonfirmasi: async (hasil) => {
      await notifications.pesananDikonfirmasi(hasil);
    },
    pesananDitolak: async (hasil) => {
      await notifications.pesananDitolak(hasil);
    },
    pesananAlternatifDitawarkan: async (hasil) => {
      await notifications.pesananAlternatifDitawarkan(hasil);
    },
    tumpangDitolak: async (hasil) => {
      await notifications.tumpangDitolak(hasil);
    },
    tumpangMintaPersetujuan: async (hasil) => {
      await notifications.tumpangMintaPersetujuan(hasil);
    },
    pesananDibatalkan: async (hasil) => {
      await notifications.pesananDibatalkan(hasil);
    },
    pesananBuktiPemesanan: async (hasil) => {
      await notifications.pesananBuktiPemesanan(hasil);
    },
    // A new Pemesanan Terencana raises one Peringatan Staf to the Lokasi's Admin Lokasi and
    // Kontak Siaga, at any hour (ticket 97), queued inside the order's own transaction (ticket 96).
    // No re-alert: the Antrean Lokasi row "Konfirmasi Terencana" stays Lainnya.
    terencanaDiajukan: async (tx, order) => {
      await kirimStaf(notifications, order, stafTerencanaBaruAlert(order), "staf_terencana_baru", tx);
    },
    terencanaDikonfirmasi: async (tx, input) => {
      await notifications.terencanaDikonfirmasi(input, tx);
    },
    terencanaDitolak: async (tx, input) => {
      await notifications.terencanaDitolak(input, tx);
    },
    terencanaBatasBayarLewat: async (tx, input) => {
      await notifications.terencanaBatasBayarLewat(input, tx);
    },
    terencanaBukti: async (tx, input) => {
      await notifications.terencanaBukti(input, tx);
    },
    pembatalanTerencana: async (tx, input) => {
      await notifications.pembatalanTerencana(input, tx);
    },
    calonPenghuniBerubah: async (input) => {
      const alert = stafCalonPenghuniBerubahAlert({ lokasi: { id: input.lokasiId }, unitNomor: input.unitNomor, label: input.label });
      for (const to of input.penerima) {
        await notifications.sendStaffAlert({ to, kind: "staf_calon_penghuni_diubah", ...alert });
      }
    },
    tidakTertagihDinyatakan: async (tx, tagihan) => {
      await notifications.antrekanPeringatanTidakTertagih(tx, tagihan);
    },
    chasingDijadwalkan: async (input) => {
      await notifications.jadwalkanChasing(input);
    },
  };
}

/** One Peringatan Staf to every Akun Staf that must see this order, by name of the kind. */
async function kirimStaf(
  notifications: Notifications,
  order: { id: string; penerima: { accountId: string }[] },
  alert: ReturnType<typeof stafSaatDukaBaruAlert> | ReturnType<typeof stafTerencanaBaruAlert>,
  kind: "staf_saat_duka_baru" | "staf_saat_duka_belum_dikonfirmasi" | "staf_terencana_baru" | "staf_ganti_pemegang_hak",
  within?: Database,
): Promise<void> {
  // The order is the subject a retried alert is asked about (ticket 96): a Pemesanan
  // Makam or a Pemesanan Terencana, by the kind that raised the alert.
  const subjectKind = kind === "staf_terencana_baru" ? "pemesanan_terencana" : "pemesanan_makam";
  for (const to of order.penerima) {
    await notifications.antrekanPeringatanStaf({ to, kind, subject: { kind: subjectKind, id: order.id }, ...alert }, within);
  }
}
