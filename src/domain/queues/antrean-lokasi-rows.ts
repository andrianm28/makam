/**
 * The row types of the Antrean Lokasi (spec, Work Queues; ticket 23): the
 * Admin Lokasi's own list for one Lokasi Mitra, split into Mendesak and
 * Lainnya, sorted by deadline.
 *
 * Like the Antrean's rows these are projections, never stored work: each type is
 * a query plus a deadline rule, and a row closes itself when the state it reads
 * moves on. What is deliberately *not* here is the Antrean's machinery: no
 * Ambil claims, no tiers, no Bertugas, and Catatan Internal stay hidden from
 * Admin Lokasi (the Antrean Lokasi has rows only). A type's key is all the
 * screen needs to show it, except where a type brings an action of its own
 * (the failed-message row, whose call is logged in place).
 */
import type { Actor } from "@/domain/identity";
import type { AntreanRowDeps } from "./row-types";

/** The two groups the spec names (CONTEXT.md: "split into Mendesak and Lainnya"). */
export type AntreanLokasiGrup = "mendesak" | "lainnya";

/** One open row of the Antrean Lokasi. */
export interface AntreanLokasiRow {
  /** The row type's key, stable across releases (also its Catatan Internal key with `subjectId`). */
  type: string;
  label: string;
  /** What the row is about, e.g. "pemesanan_makam": the link to its subject. */
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  href: string;
  /** null when this row has no deadline of its own; otherwise the instant it is due. */
  deadline: Date | null;
  /** True once `deadline` has passed (the Clock's now); always false for a row with none. */
  pastDeadline: boolean;
}

export interface AntreanLokasiRowType {
  key: string;
  grup: AntreanLokasiGrup;
  label: string;
  /** Every row of this type open at that Lokasi Mitra, for `by` (empty for anyone who may not work there). */
  rows(deps: AntreanRowDeps, by: Actor, lokasiId: string): Promise<Omit<AntreanLokasiRow, "pastDeadline">[]>;
}

const pemakamanHref = (lokasiId: string, nomor: string) => `/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`;

/**
 * "Konfirmasi Saat Duka" (Mendesak): every order of that Lokasi Mitra still
 * waiting for its confirmation, with the deadline its Jam Operasional gave. The
 * row closes itself the moment the order is confirmed, declined or cancelled,
 * because such an order is no longer `diajukan` (ticket 24 adds the declined
 * one, the same way).
 */
export const konfirmasiSaatDukaRowType: AntreanLokasiRowType = {
  key: "konfirmasi_saat_duka",
  grup: "mendesak",
  label: "Konfirmasi Saat Duka",
  async rows(deps, _by, lokasiId) {
    const order = await deps.pemesanan.antreanKonfirmasi(lokasiId);
    return order.map((satu) => ({
      type: "konfirmasi_saat_duka",
      label: "Konfirmasi Saat Duka",
      subjectKind: "pemesanan_makam",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.almarhum.name}`,
      href: pemakamanHref(lokasiId, satu.nomor),
      deadline: satu.konfirmasiDueAt,
    }));
  },
};

/**
 * A Lokasi-work message that finally failed to send, or an order of that Lokasi
 * Mitra with no email at all (spec, Work Queues: "failed Lokasi-message calls",
 * Lainnya). No deadline: the spec gives this row no SLA of its own, so it never
 * shows past one. The row closes when the staff member logs the call
 * (`notifications.catatPanggilan`).
 *
 * The row covers every subject that queues with a Lokasi (a confirmation, a
 * Bukti Pemesanan, a Perpanjangan, a Hak Pakai expiry, a Layanan at that
 * Lokasi). Today only the Saat Duka order's own messages exist; the others
 * arrive with the tickets that send them, and their rows need no change here.
 */
export const pesanLokasiGagalRowType: AntreanLokasiRowType = {
  key: "pesan_lokasi_gagal",
  grup: "lainnya",
  label: "Telepon Pemesan",
  async rows(deps, _by, lokasiId) {
    const terbuka = await deps.notifications.teleponPemesanTerbuka();
    return terbuka
      .filter((telepon) => telepon.lokasiId === lokasiId)
      .map((telepon) => ({
        type: "pesan_lokasi_gagal",
        label: "Telepon Pemesan",
        subjectKind: "telepon_pemesan",
        subjectId: telepon.id,
        subjectLabel: telepon.perihal ?? telepon.nomorPemesanan ?? telepon.nomorTagihan ?? telepon.subjectId,
        href: pemakamanHref(lokasiId, telepon.nomorPemesanan ?? ""),
        deadline: null,
      }));
  },
};

/**
 * "Petak Perlu Verifikasi" (Lainnya): the Lokasi Mitra's own count of Petak
 * Makam whose state its Admin Lokasi has not confirmed yet, so none of them can
 * be assigned or sold. One row for the Lokasi (the Denah is where they are
 * cleared), and no deadline: the spec gives this row none.
 */
export const petakPerluVerifikasiRowType: AntreanLokasiRowType = {
  key: "petak_perlu_verifikasi",
  grup: "lainnya",
  label: "Petak Perlu Verifikasi",
  async rows(deps, _by, lokasiId) {
    const jumlah = await deps.inventory.jumlahPetakPerluVerifikasi(lokasiId);
    if (jumlah === 0) return [];
    return [
      {
        type: "petak_perlu_verifikasi",
        label: "Petak Perlu Verifikasi",
        subjectKind: "lokasi_mitra",
        subjectId: lokasiId,
        subjectLabel: `${jumlah} Petak Makam belum dicek`,
        href: `/staf/admin-lokasi/${lokasiId}/denah`,
        deadline: null,
      },
    ];
  },
};

/**
 * "Catat Pemakaman" (Lainnya): every order of that Lokasi Mitra whose agreed
 * burial day has passed with no Pemakaman recorded, so the Hak Pakai's term has
 * not started and the family's Tagihan has no clock. The worker's prompt raises
 * the row the day after the agreed burial, and the row closes itself the moment
 * the burial is recorded (ticket 25). No deadline: the spec gives this row no
 * SLA, and the burial it asks about has already happened.
 */
export const catatPemakamanRowType: AntreanLokasiRowType = {
  key: "catat_pemakaman",
  grup: "lainnya",
  label: "Catat Pemakaman",
  async rows(deps, _by, lokasiId) {
    const order = await deps.pemesanan.antreanCatatPemakaman(lokasiId);
    return order.map((satu) => ({
      type: "catat_pemakaman",
      label: "Catat Pemakaman",
      subjectKind: "pemesanan_makam",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.almarhum.name}`,
      href: pemakamanHref(lokasiId, satu.nomor),
      deadline: null,
    }));
  },
};

/** Every row type the Antrean Lokasi shows; later tickets add theirs here. */
export const antreanLokasiRowTypes: AntreanLokasiRowType[] = [
  konfirmasiSaatDukaRowType,
  pesanLokasiGagalRowType,
  petakPerluVerifikasiRowType,
  catatPemakamanRowType,
];
