import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan } from "./skema-pengurusan";

/**
 * The two document sets a Saat Duka TPU order carries (spec, Pengurusan: "Two
 * document sets: for the burial (brought) and for the filing (uploaded, due in
 * 7 days after the burial)"). They are kept apart because they are met at two
 * different moments by two different people: the burial set is carried to the
 * TPU on the day itself and never holds anything up, the filing set is uploaded
 * within 7 days after the burial and is what the Operator files on JakEVO.
 *
 * The surat pengantar from the kelurahan is in neither set: the Operator fetches
 * it (Field Work, "Ambil surat pengantar"), so a family is never asked for a
 * document the platform obtains itself.
 */

/** What is carried to the TPU on the burial day, for a grave that is made Baru. */
const pemakamanBaru: DokumenPemakamanDanPengajuan["pemakaman"] = [
  { nama: "KTP Pemegang Hak", catatan: "Asli, untuk ditunjukkan di gerbang TPU." },
  { nama: "Kartu Keluarga", catatan: "Asli atau salinan yang masih berlaku." },
  { nama: "Surat keterangan kematian almarhum / almarhumah", catatan: "Dari rumah sakit, Puskesmas atau kelurahan." },
];

/** What is carried on the day for a Tumpang, on top of the three above: the existing holder's consent. */
const pemakamanTumpang: DokumenPemakamanDanPengajuan["pemakaman"] = [
  ...pemakamanBaru,
  {
    nama: "Surat persetujuan Pemegang Hak makam yang ditumpang",
    catatan: "Ditandatangani oleh Pemegang Hak makam itu; tanpa itu pemakaman tumpang tidak dapat dilaksanakan di TPU.",
  },
];

/**
 * What is uploaded for the IPTM filing, for a grave that is made Baru. The
 * Operator's own copy of the death documents is not on this list: the family
 * uploads what only they hold, and the Operator fetches the rest.
 */
const pengajuanBaru: DokumenPemakamanDanPengajuan["pengajuan"] = [
  { nama: "Foto KTP Pemegang Hak", catatan: "Semua halaman." },
  { nama: "Foto Kartu Keluarga", catatan: null },
  { nama: "Surat pernyataan pemilik makam", catatan: "Disediakan dan ditandatangani keluarga, diunggah lewat halaman pesanan Anda." },
  { nama: "Surat keterangan kematian almarhum / almarhumah", catatan: "Foto atau pindai, terbaca jelas." },
];

/** The same, for a Tumpang: the grave's own consent and its IPTM, which is how the Operator learns the term it still has. */
const pengajuanTumpang: DokumenPemakamanDanPengajuan["pengajuan"] = [
  { nama: "Foto KTP Pemegang Hak", catatan: "Semua halaman." },
  { nama: "Foto Kartu Keluarga", catatan: null },
  {
    nama: "Surat pernyataan pemilik makam",
    catatan: "Disediakan dan ditandatangani Pemegang Hak makam yang ditumpang.",
  },
  { nama: "Surat keterangan kematian almarhum / almarhumah", catatan: "Foto atau pindai, terbaca jelas." },
  { nama: "Foto IPTM makam yang ditumpang", catatan: "Menjadi rujukan izin yang masih berlaku dan nama Pemegang Hak yang tercatat di dalamnya." },
];

/**
 * The Pasal 17(2) documents: what a death outside Jakarta adds to the filing
 * set, because the documents of the death were issued by another municipality
 * and the TPU's own office cannot read them as issued. They are added to the
 * filing set only — the burial itself goes ahead with what the burial set
 * already says.
 */
const pasal17Dua: DokumenPemakamanDanPengajuan["pengajuan"] = [
  {
    nama: "Surat keterangan kematian yang dikeluarkan di luar DKI Jakarta",
    catatan: "Akta kematian dari kecamatan atau kabupaten tempat almarhum meninggal, sudah dilegalisasi.",
  },
  {
    nama: "Surat keterangan domisili almarhum semasa hidup di luar DKI Jakarta",
    catatan: "Menyatakan almarhum bukan warga DKI, sehingga penerbitan IPTM mengikuti Pasal 17 ayat 2.",
  },
];

/**
 * The two sets a submission of this kind carries, attached to the order as it is
 * placed. A death outside Jakarta adds the Pasal 17(2) documents to the filing
 * set and nothing else: a KTP that is not a DKI one is what blocks the order, so
 * it never reaches a document list.
 */
export function daftarDokumen(input: { jenis: JenisPenguburan; kelayakan: Kelayakan }): DokumenPemakamanDanPengajuan {
  const tumpang = input.jenis === "tumpang";
  const pengajuan = tumpang ? pengajuanTumpang : pengajuanBaru;
  return {
    pemakaman: tumpang ? pemakamanTumpang : pemakamanBaru,
    pengajuan: input.kelayakan.wafatDiJakarta ? pengajuan : [...pengajuan, ...pasal17Dua],
  };
}
