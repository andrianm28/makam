/**
 * Akun Saya's Perlu Tindakan strip (ticket 27, spec story 99): "unpaid Tagihan;
 * missing documents; an alternative to accept; (later: Perlu Perbaikan, a
 * consent to give) through a registry other tickets add to."
 *
 * This is the registry: a pure function over one small summary per order, built
 * from the Pemesanan and Pengurusan modules' own reads. Whether a fact deserves
 * a row is decided here (unpaid, missing, waiting), but *what counts as* one of
 * those facts is never decided here: "does this Tagihan still need paying" is
 * Billing's own classification (`tagihanPerluDibayar`), read and never
 * reimplemented. A later ticket adds a further provider the same way: one more
 * `if` here, calling its owning module's own classification, or a further field
 * on `RingkasanTindakan` if the fact does not exist on an order yet.
 *
 * Content, not domain data: no amount is written here, and an item's wording
 * never repeats a number the order page itself may have moved on from — it
 * names the order and sends the family to it.
 */
import { tagihanPerluDibayar, type TagihanStatus } from "@/domain/billing";

/** One order's own facts, as much as a Perlu Tindakan row is built from, whatever kind of order it is. */
export interface RingkasanTindakan {
  nomor: string;
  /** The order page this item sends the family to. */
  href: string;
  tagihan: { status: TagihanStatus; href: string } | null;
  /** How many of the order's checklist documents are still not uploaded. */
  dokumenBelum: number;
  /** Whether the Lokasi's (or TPU's) alternative is still waiting for an answer. */
  alternatifMenunggu: boolean;
  /** Ditolak or Dibatalkan: a dead order gets no more "documents missing" nagging, since nothing follows from it any more. */
  tertutup: boolean;
}

export interface PerluTindakanItem {
  /** Stable across a re-render: the strip clears an item by no longer building it, not by an id staying around stale. */
  id: string;
  judul: string;
  deskripsi: string;
  href: string;
}

/**
 * Every item the strip shows, built fresh from the orders handed in: an item
 * "clears" simply by its condition no longer holding the next time this runs
 * (a Tagihan paid, a document uploaded, an alternative answered), so there is
 * no separate "dismiss" state to keep in step with the order itself.
 */
export function perluTindakanDariPesanan(daftar: readonly RingkasanTindakan[]): PerluTindakanItem[] {
  const item: PerluTindakanItem[] = [];
  for (const satu of daftar) {
    if (satu.tagihan && tagihanPerluDibayar(satu.tagihan.status)) {
      item.push({
        id: `tagihan:${satu.nomor}`,
        judul: `Tagihan pesanan ${satu.nomor} belum dibayar`,
        deskripsi:
          satu.tagihan.status === "lewat_jatuh_tempo"
            ? "Sudah lewat jatuh tempo. Segera bayar agar tidak Tidak Tertagih."
            : "Menunggu pembayaran Anda.",
        href: satu.tagihan.href,
      });
    }
    if (!satu.tertutup && satu.dokumenBelum > 0) {
      item.push({
        id: `dokumen:${satu.nomor}`,
        judul: `Dokumen pesanan ${satu.nomor} belum lengkap`,
        deskripsi: `${satu.dokumenBelum} dokumen belum diunggah. Boleh menyusul, tidak menahan apa pun.`,
        href: satu.href,
      });
    }
    if (satu.alternatifMenunggu) {
      item.push({
        id: `alternatif:${satu.nomor}`,
        judul: `Pesanan ${satu.nomor} menawarkan pilihan lain`,
        deskripsi: "Lokasi Mitra menawarkan pilihan lain untuk pesanan ini. Jawab agar pesanan bisa dilanjutkan.",
        href: satu.href,
      });
    }
  }
  return item;
}

/** One manual Perpanjangan request's own facts, as much as a Perlu Tindakan row is built from. */
export interface RingkasanPermohonan {
  id: string;
  lokasiName: string;
  petakNomor: string;
  status: "diajukan" | "perlu_perbaikan" | "disetujui" | "ditolak" | "dibatalkan";
  /** Whether an approval can still be turned into a Tagihan (the Perpanjangan module's own classification). */
  dapatDipesan: boolean;
}

/**
 * The items a manual Perpanjangan request (KTP, heir, claim) adds to the strip: one when the Admin Lokasi
 * sent it back for correction (Perlu Perbaikan) and one while an approval waits to be turned into a Tagihan.
 * Like every item here it clears itself once its condition no longer holds.
 */
export function perluTindakanDariPermohonan(daftar: readonly RingkasanPermohonan[]): PerluTindakanItem[] {
  const item: PerluTindakanItem[] = [];
  for (const satu of daftar) {
    const href = `/perpanjangan/permohonan/${satu.id}`;
    const tempat = `${satu.lokasiName}, Petak ${satu.petakNomor}`;
    if (satu.status === "perlu_perbaikan") {
      item.push({
        id: `permohonan-perbaikan:${satu.id}`,
        judul: `Permohonan Perpanjangan ${tempat} perlu diperbaiki`,
        deskripsi: "Admin Lokasi meminta perbaikan berkas. Buka permohonan untuk melihat catatannya.",
        href,
      });
    }
    if (satu.dapatDipesan) {
      item.push({
        id: `permohonan-disetujui:${satu.id}`,
        judul: `Permohonan Perpanjangan ${tempat} disetujui`,
        deskripsi: "Pilih jumlah masa untuk membuat Tagihan. Persetujuan berlaku 30 hari.",
        href,
      });
    }
  }
  return item;
}
