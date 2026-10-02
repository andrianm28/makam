/**
 * What the Admin Lokasi's order page says about a further burial (ticket 35, stories 54, 122): how the
 * Pemegang Hak's consent stands, whether the Lokasi may log a verbal consent or heirship proof, whether it may
 * confirm (the consent settled and the tumpang checks passing), and the warnings. Content only: the facts and the
 * checks are the Pemesanan module's own, read through `orderUntukStaf`.
 */
import type { PemesananStatus, TumpangUntukStaf } from "@/domain/pemesanan";
import { tumpangMessage } from "./tumpang-labels";

export interface TumpangPanel {
  konsenLabel: string;
  bisaCatatKonsen: boolean;
  bisaKonfirmasi: boolean;
  /** Why confirming is blocked, shown beside the disabled button; null when it is allowed (or past Diajukan). */
  blokKonfirmasi: string | null;
  /** The warning banner: earlier Tagihan under the same Hak Pakai that are still unpaid. */
  peringatan: string[];
  /** After an heirship proof: the reminder to record a Ganti Pemegang Hak. */
  pengingatGanti: string | null;
}

export function tumpangPanel(tumpang: TumpangUntukStaf, status: PemesananStatus): TumpangPanel {
  const { konsen } = tumpang;
  const catatan = konsen.catatan ? `: ${konsen.catatan}` : "";
  const konsenLabel = (() => {
    switch (konsen.state) {
      case "implisit":
        return "Disetujui otomatis: email Akun Pemesan sama dengan email Pemegang Hak.";
      case "menunggu_pemegang":
        return "Menunggu Setujui / Tolak dari Pemegang Hak lewat Akun Saya (email sudah dikirim).";
      case "menunggu_lokasi":
        return "Pemegang Hak tidak punya email tercatat: catat persetujuan lisan atau bukti ahli waris.";
      case "ditolak":
        return "Ditolak oleh Pemegang Hak.";
      case "disetujui":
        if (konsen.via === "verbal") return `Disetujui lisan, dicatat Admin Lokasi${catatan}`;
        if (konsen.via === "ahli_waris") return `Disetujui dengan bukti ahli waris${catatan}`;
        return "Disetujui Pemegang Hak lewat email.";
    }
  })();
  const terbuka = status === "diajukan";
  const selesai = konsen.state === "implisit" || konsen.state === "disetujui";
  const blok = !terbuka ? null : !selesai ? tumpangMessage("konsen_belum_selesai") : tumpang.pemeriksaan.ok ? null : tumpangMessage(tumpang.pemeriksaan.reason);
  return {
    konsenLabel,
    bisaCatatKonsen: terbuka && (konsen.state === "menunggu_pemegang" || konsen.state === "menunggu_lokasi"),
    bisaKonfirmasi: terbuka && blok === null,
    blokKonfirmasi: blok,
    peringatan: tumpang.tagihanSebelumnyaBelumLunas.map((satu) => `Tagihan ${satu.nomorTagihan} untuk pesanan ${satu.nomorPesanan} di Hak Pakai ini belum lunas.`),
    pengingatGanti: tumpang.gantiPemegangHakDiingatkan ? "Catat Ganti Pemegang Hak ke ahli waris yang membawa bukti ini." : null,
  };
}
