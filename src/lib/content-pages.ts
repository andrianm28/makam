/**
 * The copy of the written content pages (spec, Public site and routing decisions
 * > Content pages): Tentang Kami, Cara Kami Bekerja and FAQ.
 *
 * It is content, not domain data. No amount, deadline, count or opening hour is
 * written here on purpose: each of those is read on the page that owns it,
 * through that module's public query, so a page here can never go stale or
 * promise what a number would have to confirm (docs/design-system.md, voice and
 * tone: no uncertain claims, and no date for anything not built).
 *
 * Where a sentence needs a value the domain owns — the Operator's legal name,
 * the CS number — the page passes it in and it is read from Pengaturan Operator,
 * never written here.
 */

/** One titled block of a content page. */
export interface ContentSection {
  label: string;
  paragraphs: string[];
}

/** One question and its answer. */
export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * Tentang Kami: what makam.co.id is, who runs it, that it holds no land, and
 * that it works with partner cemeteries and the DKI TPUs. The legal name comes
 * from Pengaturan Operator; before an Admin Platform has entered one the page
 * says nothing about who runs it rather than guessing.
 */
export function tentangKamiParagrafs(legalName: string | null): string[] {
  return [
    "Makam.co.id adalah layanan pemakaman: satu tempat untuk memesan makam, mengurus berkas yang menyertainya, dan melihat status pesanan sampai selesai.",
    ...(legalName ? [`Makam.co.id dikelola oleh ${legalName}.`] : []),
    "Makam.co.id tidak memiliki dan tidak memegang tanah makam. Kami bekerja sama dengan pengelola Lokasi Mitra yang mengelola makamnya sendiri, dan dengan Tempat Pemakaman Umum yang dikelola pemerintah daerah. Hak atas tanah dan atas setiap Petak Makam tetap di tangan mereka.",
    "Yang kami lakukan adalah memperjelas langkahnya: harga yang tertera di halaman, batas waktunya, dan siapa yang harus dihubungi berikutnya.",
    "Untuk pertanyaan yang belum terjawab di sini, CS kami bisa dihubungi lewat WhatsApp, dan caranya ada di Hubungi Kami.",
  ];
}

/**
 * Cara Kami Bekerja: the three trust claims, one section each (spec, Content
 * pages). Each section states the rule; the prices and the fees themselves are
 * read from Tariffs, Pengurusan and Pengaturan Operator on the pages that show
 * them, never written here.
 */
export const caraKamiBekerjaSections: ContentSection[] = [
  {
    label: "Kunjungan Verifikasi",
    paragraphs: [
      "Sebelum sebuah Lokasi Mitra boleh tampil di Daftar Lokasi, petugas kami datang ke lokasi itu. Yang diperiksa: nama dan alamat jalan, titik peta di mana lokasi berada, fasilitas yang benar-benar ada di sana, dan foto lokasi.",
      "Hasil kunjungan itu yang menentukan boleh atau tidaknya Lokasi Mitra ditampilkan. Lokasi yang belum dikunjungi, atau yang tarifnya belum diperiksa, tidak tampil di Daftar Lokasi dan tidak menerima pesanan.",
      "Kalau kemudian ada yang berubah di lokasi tersebut, Kunjungan Verifikasi diulang dan statusnya bisa kembali menjadi belum ditampilkan sampai pemeriksaan selesai.",
    ],
  },
  {
    label: "Harga di halaman sama dengan Tagihan",
    paragraphs: [
      "Harga yang tertera pada halaman Lokasi Mitra adalah harga yang akan masuk Tagihan Anda. Tidak ada jumlah lain yang muncul belakangan di luar yang tertulis di halaman itu.",
      "Biaya Layanan Platform selalu ditulis terpisah dari harga makam, pada baris tersendiri di Tagihan. Jadi jelas berapa yang untuk makam dan berapa yang untuk layanan makam.co.id.",
      "Kalau sebuah pesanan memakai Harga Khusus, jumlahnya dan masa berlakunya tertera pada Tagihan itu sendiri, bukan pada halaman Lokasi.",
    ],
  },
  {
    label: "Izin TPU gratis",
    paragraphs: [
      "Izin penggunaan tanah makam di Tempat Pemakaman Umum diterbitkan pemerintah daerah dan tidak dipungut biaya kepada keluarga. Ketentuan tentang biaya di tempat pemakaman itu sendiri tetap menjadi wewenang pemerintah daerah.",
      "Keluarga boleh mengurus berkas ini sendiri, dan urutannya mengikuti ketentuan pemerintah daerah serta penjelasan dari TPU yang setempat. Panduan lengkap tentang pengurusan di TPU DKI belum kami terbitkan di makam.co.id, jadi untuk langkah yang tepat di daerah Anda, tanya CS lewat WhatsApp.",
      "Kalau keluarga memilih meminta bantuan kami, yang kami kenakan adalah biaya layanan untuk dikerjakan dan dikoordinasikan oleh kami. Biaya itu adalah biaya kenyamanan, bukan biaya untuk izinnya.",
    ],
  },
];

/**
 * The FAQ, in the order the release asks for (spec, Content pages). Answers say
 * the rule and where to see the amount; none of them states a price, a date or a
 * waiting time, because those are read on the page that owns them.
 *
 * The answer on what is paid, and to whom, names the Operator's legal name —
 * read from Pengaturan Operator and passed in, so it can never disagree with the
 * footer, the documents and Hubungi Kami.
 */
export function faqQuestions(legalName: string | null): FaqEntry[] {
  const penerimaDana = legalName ? `${legalName} sebagai pengelola makam.co.id` : "pengelola makam.co.id";
  return [
    {
      question: "Pesan Makam atau Hak Pakai?",
      answer:
        "Pesan Makam memesan satu Petak Makam untuk satu jenazah, dan setelah pembayarannya lunas Anda memperoleh Hak Pakai atas Petak Makam itu. Kalau Petak Makam itu sudah milik keluarga Anda, yang diurus bukan pemesanan baru melainkan Hak Pakai yang sudah ada: Perpanjangan Makam, pemakaman kedua di bawah Hak Pakai yang sama, atau penggantian Pemegang Hak. Dua hal ini berbeda, dan sistem kami memakai istilah yang berbeda untuk keduanya.",
    },
    {
      question: "Apa yang dibayar, dan kapan?",
      answer: `Pada Pemesanan Saat Duka, Tagihan terbit begitu pesanan dikirim, dan Tagihan itu yang dibayar keluarga sebelum Lokasi Mitra dapat mengonfirmasi. Pembayaran lewat bank transfer atau dompet digital, dan Bukti Pemesanan terbit sendiri setelah pembayaran diterima. Uang yang dibayar keluarga diterima lebih dulu oleh ${penerimaDana}, lalu diteruskan kepada Lokasi Mitra sebagai hak atas Petak Makam. Dua bagian itu selalu terlihat terpisah pada Tagihan: harga makam, dan Biaya Layanan Platform.`,
    },
    {
      question: "Pembatalan",
      answer:
        "Pembatalan berlaku untuk Pemesanan Terencana yang sudah dibayar dan belum ada pemakaman di Petak Makam itu, atas permintaan Pemegang Hak. Pengembalian dana mengikuti kebijakan Lokasi Mitra tersebut, dan dikembalikan ke rekening asal. Untuk Pemesanan Saat Duka tidak ada pembatalan, karena pemakamannya sudah berjalan. Yang bisa diminta waktu itu adalah pengembalian Hak Pakai, dan itu diselesaikan langsung antara keluarga dengan pengelola Lokasi Mitra, tanpa makam.co.id.",
    },
    {
      question: "Perpanjangan",
      answer:
        "Perpanjangan memperpanjang Hak Pakai atas Petak Makam atau Kavling Keluarga yang akan berakhir. Pengajuan bisa dibuat sebelum masa Hak Pakai habis, dan masih diterima selama masa tenggang setelahnya. Yang berhak mengajukan adalah Pemegang Hak, bukan Pemesan, dan pengajuannya diperiksa oleh Lokasi Mitra. Halaman untuk mengajukan dan memantau Perpanjangan belum ada di makam.co.id; sementara ini tanya CS lewat WhatsApp, dan kami akan mengarahkan Anda ke Lokasi Mitra tempat Hak Pakai itu berada.",
    },
    {
      question: "Siapa yang boleh dimakamkan di TPU?",
      answer:
        "Petak makam dan izinnya di Tempat Pemakaman Umum milik pemerintah daerah, dan yang tercatat pada izin itulah Pemegang Hak di sana. Karena itu, di TPU makam.co.id hanya mengurus Pengurusan: mengatur pemakaman dengan TPU lalu mengajukan izinnya, atau hanya mengajukan izin bagi yang sudah dimakamkan sendiri. Izin itu sendiri yang menyebut Pemegang Hak, dan pergantiannya mengikuti aturan pemerintah daerah. Satu yang perlu diluruskan: izin di TPU bukan Hak Pakai, dan tidak berlaku di Lokasi Mitra.",
    },
    {
      question: "Dokumen apa saja yang perlu?",
      answer:
        "Untuk memulai pesanan cukup data yang Anda isi sendiri: nama Pemesan beserta email dan nomor telepon, nama almarhum atau almarhumah, tanggal wafat, waktu pemakaman yang direncanakan, dan siapa Pemegang Haknya. Berkas resmi seperti KTP, KK, akta kematian atau surat keterangan ahli waris tidak dibutuhkan untuk memulai pesanan. Dokumen boleh menyusul setelah pesanan dikirim, dan kalau ada berkas yang perlu dilampirkan, CS akan mengatakannya kepada Anda.",
    },
    {
      question: "Untuk apa data keluarga saya dipakai?",
      answer:
        "Data keluarga dipakai untuk memproses pesanan, menerbitkan Tagihan dan Bukti, lalu disimpan di penyimpanan privat. Dokumen keluarga tidak dibagikan kepada pihak lain di luar proses pemakaman, dan setiap Staf hanya dapat membuka berkas yang memang diperlukan untuk pekerjaannya. Tagihan, Bukti dan kabar tentang pesanan dikirim ke alamat email yang Anda masukkan, bukan ke WhatsApp. Kalau Anda tidak punya email yang bisa dipakai, minta bantuan CS untuk mengirimkannya lewat WhatsApp.",
    },
  ];
}
