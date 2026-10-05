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
import type { TeleponPemesan } from "@/domain/notifications";
import { formatTanggal, wib, wibDateOf } from "@/lib/time/jakarta";
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

/** One Hak Pakai's own page in its Lokasi's staff area (the Denah's Petak leads here too). */
const hakPakaiHref = (lokasiId: string, hakPakaiId: string) => `/staf/admin-lokasi/${lokasiId}/hak-pakai/${hakPakaiId}`;

/** Where the Admin Lokasi does the work: one job's own page, in its own Lokasi's staff area. */
const pekerjaanHref = (lokasiId: string, pekerjaanId: string) => `/staf/admin-lokasi/${lokasiId}/pekerjaan/${pekerjaanId}`;

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
 * What the row opens depends on what the call is about (`teleponHref`): an
 * order, or a Hak Pakai (cleared in the Denah, it has no order to open).
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
        href: teleponHref(lokasiId, telepon),
        deadline: null,
      }));
  },
};

/**
 * Where a "Telepon Pemesan" row leads: the page of what the call is about, and always a page that exists.
 * The call about a Hak Pakai (its end is near, or its Pemegang Hak has no email on record) carries no Nomor, because
 * a Hak Pakai cleared in the Denah has no order at all, so it leads to the Hak Pakai's own page. An order's own
 * message, or a Tagihan of one, leads to the order. Anything else (a Bukti Perpanjangan to hand over, a reminder
 * email that failed) has no page of its own yet, so the row stays in this Antrean rather than point at `/pesanan/`
 * with no Nomor behind it.
 */
function teleponHref(lokasiId: string, telepon: TeleponPemesan): string {
  if (telepon.subjectKind === "hak_pakai") return hakPakaiHref(lokasiId, telepon.subjectId);
  if (telepon.nomorPemesanan) return pemakamanHref(lokasiId, telepon.nomorPemesanan);
  return `/staf/admin-lokasi/${lokasiId}/antrean`;
}

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
 * "Hak Pakai dalam masa tenggang" (Lainnya): every Kedaluwarsa Hak Pakai of that Lokasi Mitra
 * its Admin Lokasi has yet to decide on, so it decides whether to end it (story 130, ticket 42).
 * It closes when a Perpanjangan is paid (the Hak Pakai is Aktif again) or when the Admin Lokasi
 * ends it; the end of the Masa Tenggang does not close it (owner decision 2026-10-02), the row
 * then says the Masa Tenggang is over. No deadline: the spec gives it none.
 */
export const hakPakaiMasaTenggangRowType: AntreanLokasiRowType = {
  key: "hak_pakai_masa_tenggang",
  grup: "lainnya",
  label: "Hak Pakai dalam masa tenggang",
  async rows(deps, _by, lokasiId) {
    const hakPakai = await deps.inventory.hakPakaiMasaTenggang(lokasiId);
    return hakPakai.map((satu) => ({
      type: "hak_pakai_masa_tenggang",
      label: "Hak Pakai dalam masa tenggang",
      subjectKind: "hak_pakai",
      subjectId: satu.hakPakaiId,
      subjectLabel: `${satu.label} · berakhir ${formatTanggal(satu.endDate)}, masa tenggang ${satu.lewatMasaTenggang ? "berakhir" : "sampai"} ${formatTanggal(satu.masaTenggangBerakhir)}`,
      href: hakPakaiHref(lokasiId, satu.hakPakaiId),
      deadline: null,
    }));
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

/**
 * "Konfirmasi Terencana" (Lainnya): every Pemesanan Terencana of that Lokasi Mitra still
 * waiting for its answer, due by the end of the Lokasi's next working day (spec, Work
 * Queues; ticket 37). It sits in Lainnya, not Mendesak: a plot booked in advance has no
 * burial waiting on it. The deadline never cancels the order; past it the row stays and
 * Admin Platform's Tier 3 row appears. It closes itself when the order is confirmed,
 * declined or withdrawn.
 */
export const konfirmasiTerencanaRowType: AntreanLokasiRowType = {
  key: "konfirmasi_terencana",
  grup: "lainnya",
  label: "Konfirmasi Terencana",
  async rows(deps, _by, lokasiId) {
    const order = await deps.pemesanan.antreanKonfirmasiTerencana(lokasiId);
    return order.map((satu) => ({
      type: "konfirmasi_terencana",
      label: "Konfirmasi Terencana",
      subjectKind: "pemesanan_terencana",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.unit.map((unit) => unit.nomor).join(", ")}`,
      href: pemakamanHref(lokasiId, satu.nomor),
      deadline: satu.konfirmasiDueAt,
    }));
  },
};

/**
 * "Pembatalan" (Lainnya): every Pembatalan request of a paid Terencana order at that Lokasi Mitra still Diajukan,
 * due 2 Hari Kerja after it was filed on the Lokasi's own calendar (spec, Work Queues: requests from the Pemegang
 * Hak; ticket 38). It closes itself when the Admin Lokasi answers, when the request is sent back for a fix (it is
 * back when filed again) and when the family withdraws it. Lainnya, not Mendesak: nobody waits on a burial.
 */
export const pembatalanTerencanaRowType: AntreanLokasiRowType = {
  key: "pembatalan_terencana",
  grup: "lainnya",
  label: "Pembatalan",
  async rows(deps, _by, lokasiId) {
    const permintaan = await deps.pemesanan.antreanPembatalan(lokasiId);
    return permintaan.map((satu) => ({
      type: "pembatalan_terencana",
      label: "Pembatalan",
      subjectKind: "permintaan_pembatalan_terencana",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.unit.join(", ")}`,
      href: pemakamanHref(lokasiId, satu.nomor),
      deadline: satu.tenggatPada,
    }));
  },
};

/**
 * "Pengembalian" and "Ganti Pemegang Hak" (Lainnya): every Pengembalian Hak Pakai / Ganti Pemegang
 * Hak request at that Lokasi Mitra still Diajukan, due 2 Hari Kerja after it was filed on the
 * Lokasi's own calendar (spec, Work Queues: requests from the Pemegang Hak; ticket 39). It closes
 * itself when the Admin Lokasi answers, when the request is sent back for a fix (it returns when
 * filed again), and when the family withdraws it. Lainnya, not Mendesak: nobody waits on a burial.
 */
export const permintaanHakPakaiRowType: AntreanLokasiRowType = {
  key: "permintaan_hak_pakai",
  grup: "lainnya",
  label: "Pengembalian / Ganti Pemegang Hak",
  async rows(deps, _by, lokasiId) {
    const permintaan = await deps.pemesanan.antreanPermintaanHakPakai(lokasiId);
    return permintaan.map((satu) => ({
      type: "permintaan_hak_pakai",
      label: satu.jenis === "pengembalian" ? "Pengembalian Hak Pakai" : "Ganti Pemegang Hak",
      subjectKind: "permintaan_hak_pakai",
      subjectId: satu.id,
      subjectLabel: `${satu.unitNomor}`,
      href: `/staf/admin-lokasi/${lokasiId}/permintaan/${satu.id}`,
      deadline: satu.tenggatPada,
    }));
  },
};

/**
 * "Periksa dokumen Perpanjangan" (Lainnya): every manual Perpanjangan request (KTP, heir,
 * claim) of that Lokasi Mitra still Diajukan, due 2 working days after it was filed on the
 * Lokasi's Jam Operasional calendar (spec, Work Queues; ticket 41). A request the Admin Lokasi
 * sent back (Perlu Perbaikan) leaves the list until the applicant files it again, and one that
 * is decided or withdrawn closes its own row.
 */
export const periksaDokumenPerpanjanganRowType: AntreanLokasiRowType = {
  key: "periksa_dokumen_perpanjangan",
  grup: "lainnya",
  label: "Periksa dokumen Perpanjangan",
  async rows(deps, _by, lokasiId) {
    const terbuka = await deps.perpanjangan.antreanPeriksaDokumen(lokasiId);
    return terbuka.map((satu) => ({
      type: "periksa_dokumen_perpanjangan",
      label: "Periksa dokumen Perpanjangan",
      subjectKind: "perpanjangan_permohonan",
      subjectId: satu.id,
      subjectLabel: `Petak ${satu.petakNomor} · ${satu.nama}`,
      href: `/staf/admin-lokasi/${lokasiId}/perpanjangan/${satu.id}`,
      deadline: satu.tenggatPada,
    }));
  },
};

/**
 * "Layanan hari ini" (Mendesak): the jobs of that Lokasi Mitra whose target date
 * is today, so a job that can be done today is at the top of the list. No
 * deadline of its own — the day the family asked for is the deadline, and the
 * row's own `pastDeadline` is therefore always false; what makes it urgent is
 * that it is due.
 *
 * The row closes itself the moment the job is finished, cancelled or moved to
 * Keluhan, because the Layanan module's list only holds open jobs.
 */
export const layananHariIniRowType: AntreanLokasiRowType = {
  key: "layanan_hari_ini",
  grup: "mendesak",
  label: "Layanan hari ini",
  async rows(deps, by, lokasiId) {
    const hariIni = wibDateOf(deps.clock.now());
    const pekerjaan = await deps.layanan.pekerjaanUntukStafTerbaru(by, lokasiId);
    return pekerjaan
      .filter((satu) => satu.targetDate <= hariIni && satu.status !== "terlambat")
      .map((satu) => ({
        type: "layanan_hari_ini",
        label: "Layanan hari ini",
        subjectKind: "pekerjaan_layanan",
        subjectId: satu.id,
        subjectLabel: `${satu.pesanan.label} · Petak ${satu.petak.nomor}`,
        href: pekerjaanHref(lokasiId, satu.id),
        deadline: null,
      }));
  },
};

/**
 * "Layanan akan datang" (Lainnya): the jobs whose target date is still ahead, so
 * an Admin Lokasi can see what is coming rather than only what is due. It
 * disappears on its own as the date arrives and the Mendesak row takes over.
 */
export const layananAkanDatangRowType: AntreanLokasiRowType = {
  key: "layanan_akan_datang",
  grup: "lainnya",
  label: "Layanan akan datang",
  async rows(deps, by, lokasiId) {
    const hariIni = wibDateOf(deps.clock.now());
    const pekerjaan = await deps.layanan.pekerjaanUntukStafTerbaru(by, lokasiId);
    return pekerjaan
      .filter((satu) => satu.targetDate > hariIni && satu.status !== "terlambat")
      .map((satu) => ({
        type: "layanan_akan_datang",
        label: "Layanan akan datang",
        subjectKind: "pekerjaan_layanan",
        subjectId: satu.id,
        subjectLabel: `${satu.pesanan.label} · Petak ${satu.petak.nomor}`,
        href: pekerjaanHref(lokasiId, satu.id),
        deadline: null,
      }));
  },
};

/**
 * "Layanan terlambat" (Lainnya): the jobs the Terlambat tick flagged — target
 * date + 2 days with no proof of completion. The deadline is the day the work was
 * due, so the row shows as past its deadline the moment it is late.
 */
export const layananTerlambatRowType: AntreanLokasiRowType = {
  key: "layanan_terlambat",
  grup: "lainnya",
  label: "Layanan terlambat",
  async rows(deps, by, lokasiId) {
    const pekerjaan = await deps.layanan.pekerjaanUntukStafTerbaru(by, lokasiId);
    return pekerjaan
      .filter((satu) => satu.status === "terlambat")
      .map((satu) => ({
        type: "layanan_terlambat",
        label: "Layanan terlambat",
        subjectKind: "pekerjaan_layanan",
        subjectId: satu.id,
        subjectLabel: `${satu.pesanan.label} · Petak ${satu.petak.nomor}`,
        href: pekerjaanHref(lokasiId, satu.id),
        deadline: wib(`${satu.targetDate} 23:59`),
      }));
  },
};

/**
 * "Kerjakan ulang" (Mendesak): a redo Admin Platform decided after upholding a Keluhan on a job of
 * that Lokasi Mitra (spec, Work Queues: "Mendesak: … Kerjakan ulang"; story 131; ticket 51). The
 * row opens with the decision and closes itself the moment the redo's new proof is shown and the
 * job is Selesai again, because only a job whose Keluhan is `kerjakan_ulang` is on the list. No
 * deadline of its own: the spec gives this row none, and what makes it urgent is that a family
 * already complained.
 */
export const kerjakanUlangRowType: AntreanLokasiRowType = {
  key: "kerjakan_ulang",
  grup: "mendesak",
  label: "Kerjakan ulang",
  async rows(deps, by, lokasiId) {
    const ulang = await deps.layanan.kerjakanUlangUntukLokasi(by, lokasiId);
    return ulang.map((satu) => ({
      type: "kerjakan_ulang",
      label: "Kerjakan ulang",
      subjectKind: "pekerjaan_layanan",
      subjectId: satu.pekerjaanId,
      subjectLabel: `${satu.label} · Petak ${satu.petak}`,
      href: pekerjaanHref(lokasiId, satu.pekerjaanId),
      deadline: null,
    }));
  },
};

/** Every row type the Antrean Lokasi shows; later tickets add theirs here. */
export const antreanLokasiRowTypes: AntreanLokasiRowType[] = [
  konfirmasiSaatDukaRowType,
  konfirmasiTerencanaRowType,
  pembatalanTerencanaRowType,
  permintaanHakPakaiRowType,
  periksaDokumenPerpanjanganRowType,
  pesanLokasiGagalRowType,
  petakPerluVerifikasiRowType,
  hakPakaiMasaTenggangRowType,
  catatPemakamanRowType,
  layananHariIniRowType,
  layananAkanDatangRowType,
  layananTerlambatRowType,
  kerjakanUlangRowType,
];
