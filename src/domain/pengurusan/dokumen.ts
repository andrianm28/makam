import type {
  DokumenPemakamanDanPengajuan,
  JenisPenguburan,
  Kelayakan,
} from "./skema-pengurusan";

/**
 * The two document sets a Saat Duka TPU order carries (spec, Pengurusan: "Two
 * document sets: for the burial (brought) and for the filing (uploaded, due in
 * 7 days after the burial)"). They are kept apart because they are met at two
 * different moments by two different people: the burial set is carried to the
 * TPU on the day itself and never holds anything up, the filing set is uploaded
 * within 7 days after the burial and is what the Operator files on JakEVO.
 *
 * Every document here is named by its source and nothing else is:
 * - the two sets: `.scratch/makam-v1/issues/15-saat-duka-tpu-pengurusan.md`
 *   item 7 (lines 40-43), the decision taken with the user on 2026-09-25 — the
 *   filing set's Surat Kuasa is a *bermaterai* one there, and the word is kept in
 *   the name a family reads: it tells them to have a materai ready;
 * - the Tumpang additions and the consent: the same file, items 1 and 3;
 * - the Pasal 17(2) letters of a death outside Jakarta:
 *   `.scratch/makam-v1/research/04-cemetery-plot-regulation.md` §2.7 and
 *   `.scratch/makam-v1/research/dki-tpu-burial-sequence.md` §6 (Perda DKI
 *   Jakarta 3/2007).
 *
 * Two documents are deliberately in neither set. The **surat pengantar from the
 * TPU** is fetched by the Operator itself (Field Work, "Ambil surat pengantar",
 * ticket 45), so a family is never asked for it; and Pasal 17(2) also names the
 * deceased's KK and KTP, which the burial set already carries, so they are not
 * written twice.
 */

/** What is carried to the TPU on the burial day, for a grave that is made Baru. */
const pemakamanBaru: DokumenPemakamanDanPengajuan["pemakaman"] = [
  {
    nama: "Surat keterangan kematian dari RS / Puskesmas",
    catatan: "Atau dari klinik, sebagai bukti meninggal.",
  },
  { nama: "KTP almarhum", catatan: "Fotokopi." },
  { nama: "Kartu Keluarga almarhum", catatan: "Fotokopi." },
];

/** What is carried on the day for a Tumpang, on top of the three above. */
const pemakamanTumpang: DokumenPemakamanDanPengajuan["pemakaman"] = [
  ...pemakamanBaru,
  {
    nama: "IPTM lama makam yang ditumpang",
    catatan:
      "Fotokopi izin yang masih berlaku; izin yang sudah berakhir harus diperpanjang lebih dulu.",
  },
  {
    nama: "Surat persetujuan Pemegang Hak makam yang ditumpang",
    catatan: "Wajib bila makam itu bukan makam keluarga sendiri.",
  },
];

/**
 * What is uploaded for the IPTM filing, for a grave that is made Baru: the
 * documents the family holds, plus the Surat Kuasa the platform generates and the
 * Pemegang Hak signs.
 */
const pengajuanBaru: DokumenPemakamanDanPengajuan["pengajuan"] = [
  {
    nama: "Surat laporan kematian dari kelurahan",
    catatan: "Dari Lurah atau RT/RW di kelurahan tempat pemakaman.",
  },
  {
    nama: "Surat Kuasa bermaterai",
    catatan:
      "Dihasilkan platform di atas kertas bermaterai untuk Anda tanda tangani, lalu diunggah di sini.",
  },
  { nama: "KTP Pemegang Hak", catatan: "Fotokopi seluruh halaman." },
  { nama: "Kartu Keluarga Pemegang Hak", catatan: "Fotokopi." },
];

/** The same, for a Tumpang: the scan of the old IPTM, which is what the filing is based on. */
const pengajuanTumpang: DokumenPemakamanDanPengajuan["pengajuan"] = [
  {
    nama: "Surat laporan kematian dari kelurahan",
    catatan: "Dari Lurah atau RT/RW di kelurahan tempat pemakaman.",
  },
  {
    nama: "Surat Kuasa bermaterai",
    catatan:
      "Dihasilkan platform di atas kertas bermaterai untuk Anda tanda tangani, lalu diunggah di sini.",
  },
  { nama: "KTP Pemegang Hak", catatan: "Fotokopi seluruh halaman." },
  { nama: "Kartu Keluarga Pemegang Hak", catatan: "Fotokopi." },
  {
    nama: "Scan IPTM lama makam yang ditumpang",
    catatan:
      "Foto IPTM yang Anda unggah saat pengajuan sudah cukup; unggah ulang bila perlu lebih jelas.",
  },
];

/**
 * The Pasal 17(2) documents: what a death **outside Jakarta** adds to the filing
 * set, because those letters are issued by the place of death and the TPU's own
 * office cannot accept the IPTM without them (Perda DKI Jakarta 3/2007; research
 * §6). Three letters, and nothing that is not in the source.
 */
const pasal17Dua: DokumenPemakamanDanPengajuan["pengajuan"] = [
  {
    nama: "Surat keterangan pemeriksaan jenazah dari RS / Puskesmas tempat asal",
    catatan: "Pasal 17(2): diterbitkan di tempat almarhum meninggal.",
  },
  {
    nama: "Surat keterangan laporan kematian dari Lurah atau Kepala Desa tempat asal",
    catatan: "Pasal 17(2): substitute for the kelurahan's own death report.",
  },
  {
    nama: "Surat pengantar kematian dari Dinas Kesehatan daerah asal",
    catatan:
      "Pasal 17(2): specifically the origin region's health office, not any SKPD.",
  },
];

/**
 * The two sets a submission of this kind carries, attached to the order as it is
 * placed. A death outside Jakarta adds the Pasal 17(2) documents to the filing
 * set and nothing else: a KTP that is not a DKI one is what blocks the order, so
 * it never reaches a document list.
 */
export function daftarDokumen(input: {
  jenis: JenisPenguburan;
  kelayakan: Kelayakan;
}): DokumenPemakamanDanPengajuan {
  const tumpang = input.jenis === "tumpang";
  const pengajuan = tumpang ? pengajuanTumpang : pengajuanBaru;
  return {
    pemakaman: tumpang ? pemakamanTumpang : pemakamanBaru,
    pengajuan: input.kelayakan.wafatDiJakarta
      ? pengajuan
      : [...pengajuan, ...pasal17Dua],
  };
}

/**
 * What a Perpanjangan TPU uploads for the filing: the Pemegang Hak's own papers, the Surat Kuasa the platform
 * generates and the scan of the IPTM being renewed. Nothing is brought anywhere (no burial), so the first set is empty.
 * The spec names no list for a renewal; this one is the Pemegang Hak's half of the filing set above (ticket 48 records it).
 */
export function daftarDokumenPerpanjangan(): DokumenPemakamanDanPengajuan {
  return {
    pemakaman: [],
    pengajuan: [
      { nama: "Scan IPTM yang diperpanjang", catatan: "Foto IPTM yang Anda unggah saat pengajuan sudah cukup; unggah ulang bila perlu lebih jelas." },
      { nama: "Surat Kuasa bermaterai", catatan: "Dihasilkan platform di atas kertas bermaterai untuk Anda tanda tangani, lalu diunggah di sini." },
      { nama: "KTP Pemegang Hak", catatan: "Fotokopi seluruh halaman." },
      { nama: "Kartu Keluarga Pemegang Hak", catatan: "Fotokopi." },
    ],
  };
}
