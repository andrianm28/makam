import { describe, expect, it } from "vitest";
import {
  barisHargaTpu,
  caraKamiBekerjaSections,
  caraKamiBekerjaSectionsUntuk,
  catatanHargaContoh,
  catatanHargaLayananContoh,
  faqQuestions,
  kebijakanPrivasiSections,
  jalanMasukTpuUntuk,
  kelompokHargaLayananTpu,
  LABEL_HARGA_CONTOH,
  tentangKamiParagrafs,
} from "./content-pages";
import { fiturUntukRute, terbukaDi } from "./rilis-peta";

/**
 * The written content pages (spec, Public site and routing decisions > Content
 * pages; the release plan's wording rules). The copy is content, not domain
 * data: no amount, deadline or count is written here, so nothing can go stale
 * and no page can promise what a number would have to confirm.
 */
describe("Tentang Kami", () => {
  it("says what makam.co.id is, and that it holds no land", () => {
    const text = tentangKamiParagrafs("PT Jaya Korpora Prima").join(" ");
    expect(text).toMatch(/Makam\.co\.id adalah layanan pemakaman/);
    expect(text).toMatch(/tidak memiliki dan tidak memegang tanah/);
    expect(text).toMatch(/Lokasi Mitra/);
    expect(text).not.toMatch(/Tempat Pemakaman Umum|TPU/);
  });

  it("names the Tempat Pemakaman Umum only where DKI TPU, taken out of the product (ADR 0010), is opened again", () => {
    for (const rilis of [1, 2, 3] as const) expect(tentangKamiParagrafs("PT Jaya Korpora Prima", rilis).join(" ")).not.toMatch(/Tempat Pemakaman Umum/);
    expect(tentangKamiParagrafs("PT Jaya Korpora Prima", 4).join(" ")).toMatch(/Tempat Pemakaman Umum/);
  });

  it("names the Operator from Pengaturan Operator, and says nothing about it while there is no name", () => {
    expect(tentangKamiParagrafs("PT Jaya Korpora Prima").join(" ")).toContain(
      "Makam.co.id dikelola oleh PT Jaya Korpora Prima.",
    );
    expect(tentangKamiParagrafs(null).join(" ")).not.toMatch(/dikelola oleh/);
  });

  it("names no release, no date and no waiting time", () => {
    expect(tentangKamiParagrafs("PT Jaya Korpora Prima").join(" ")).not.toMatch(
      /\d{4}|segera hadir|beberapa minggu|hari kerja/,
    );
  });
});

describe("Cara Kami Bekerja", () => {
  it("is the trust claims, one section each, without the TPU permit while DKI TPU is taken out of the product (ADR 0010)", () => {
    expect(caraKamiBekerjaSections.map((section) => section.label)).toEqual(["Kunjungan Verifikasi", "Harga di halaman sama dengan Tagihan"]);
    for (const rilis of [1, 2, 3] as const) expect(caraKamiBekerjaSectionsUntuk(rilis)).toEqual(caraKamiBekerjaSections);
    expect(caraKamiBekerjaSectionsUntuk(4).map((section) => section.label)).toEqual([
      "Kunjungan Verifikasi",
      "Harga di halaman sama dengan Tagihan",
      "Izin TPU gratis",
    ]);
  });

  it("explains what a Kunjungan Verifikasi checks, and that a Lokasi Mitra is listed only after it", () => {
    const kunjungan = caraKamiBekerjaSections[0].paragraphs.join(" ");
    for (const checked of ["alamat", "peta", "fasilitas", "foto"]) {
      expect(kunjungan).toContain(checked);
    }
    expect(kunjungan).toMatch(/belum dikunjungi/);
    expect(kunjungan).toMatch(/tidak tampil/);
  });

  it("keeps the Biaya Layanan Platform apart from the price on the page", () => {
    const harga = caraKamiBekerjaSections[1].paragraphs.join(" ");
    expect(harga).toMatch(/masuk Tagihan/);
    expect(harga).toContain("Biaya Layanan Platform");
    expect(harga).toMatch(/terpisah/);
  });

  it("says the TPU permit is free and may be filed by the family themselves, where DKI TPU is open", () => {
    const izin = caraKamiBekerjaSectionsUntuk(4)[2].paragraphs.join(" ");
    expect(izin).toMatch(/tidak dipungut biaya kepada keluarga/);
    expect(izin).toMatch(/sendiri/);
    expect(izin).toMatch(/kenyamanan/);
  });

  it("never sends a family to a page that is not published in this release", () => {
    // The TPU guide and the Makam keluarga hub arrive in later releases, so no
    // sentence may point a reader at them; where the page a family would need is
    // missing, the answer says so and names the CS instead.
    const semua = [
      ...tentangKamiParagrafs("PT Jaya Korpora Prima"),
      ...caraKamiBekerjaSections.flatMap((section) => section.paragraphs),
      ...faqQuestions("PT Jaya Korpora Prima").map((entry) => entry.answer),
    ].join(" ");
    expect(semua).not.toMatch(/halaman (?:makam keluarga|pengurusan)/i);
    expect(semua).not.toMatch(/TPU/);
    const perpanjangan = faqQuestions("PT Jaya Korpora Prima").find((entry) => entry.question === "Perpanjangan");
    expect(perpanjangan?.answer).toMatch(/belum ada di makam\.co\.id/);
    expect(perpanjangan?.answer).toMatch(/tanya CS lewat WhatsApp/);
  });
});

describe("FAQ", () => {
  const faq = faqQuestions("PT Jaya Korpora Prima");

  it("answers the six questions the release asks for, in that order, with no TPU question while DKI TPU is taken out (ADR 0010)", () => {
    expect(faq.map((entry) => entry.question)).toEqual([
      "Pesan Makam atau Hak Pakai?",
      "Apa yang dibayar, dan kapan?",
      "Pembatalan",
      "Perpanjangan",
      "Dokumen apa saja yang perlu?",
      "Untuk apa data keluarga saya dipakai?",
    ]);
    expect(faqQuestions("PT Jaya Korpora Prima", 3)).toEqual(faq);
    expect(faqQuestions("PT Jaya Korpora Prima", 4).map((entry) => entry.question)).toContain("Siapa yang boleh dimakamkan di TPU?");
  });

  it("answers every question in Bahasa Indonesia, and promises no price or date", () => {
    for (const entry of faq) {
      expect(entry.answer.length).toBeGreaterThan(80);
      expect(entry.answer).toMatch(/[.!?]$/);
      expect(entry.answer).not.toMatch(/\bRp\s?\d/i);
      expect(entry.answer).not.toMatch(/\d{4}/);
    }
  });

  it("names the legal name where a family is told who receives the payment", () => {
    const pembayaran = faq.find((entry) => entry.question === "Apa yang dibayar, dan kapan?");
    expect(pembayaran?.answer).toContain("PT Jaya Korpora Prima");
    expect(faqQuestions(null).find((entry) => entry.question === "Apa yang dibayar, dan kapan?")?.answer).not.toContain(
      "PT Jaya",
    );
  });

  it("does not promise that WhatsApp is read: the platform writes by email", () => {
    const data = faq.find((entry) => entry.question.includes("data keluarga"));
    expect(data?.answer).toMatch(/email/);
    expect(faq.map((entry) => entry.answer).join(" ")).not.toMatch(/dibalas.*WhatsApp|WhatsApp.*dibalas/i);
  });
});

describe("Cara Kami Bekerja, Izin TPU gratis, by release", () => {
  it("points at the Pengurusan di TPU DKI page where DKI TPU is open (development and test only, ADR 0010)", () => {
    const izin = caraKamiBekerjaSectionsUntuk(4)[2].paragraphs.join(" ");
    expect(izin).toMatch(/halaman Pengurusan di TPU DKI/);
    expect(izin).not.toMatch(/belum kami terbitkan/);
  });

  it("changes nothing else in the trust claims between releases", () => {
    const terbuka = caraKamiBekerjaSectionsUntuk(4);
    expect(terbuka[0]).toEqual(caraKamiBekerjaSections[0]);
    expect(terbuka[1]).toEqual(caraKamiBekerjaSections[1]);
  });
});

describe("Pengurusan di TPU DKI, the three ways in", () => {
  it("links all three where DKI TPU is open, and none of them says Segera hadir", () => {
    const jalan = jalanMasukTpuUntuk(4);
    expect(jalan.map((satu) => satu.label)).toEqual(["Saat Duka di TPU", "Perpanjang IPTM", "Sudah dimakamkan? Kami urus IPTM-nya"]);
    expect(jalan.every((satu) => typeof satu.href === "string")).toBe(true);
    expect(jalan.map((satu) => `${satu.ringkas} ${satu.batas ?? ""}`).join(" ")).not.toMatch(/segera hadir|menyusul/i);
  });

  it("links the filing-only Pengurusan IPTM form, 'Sudah dimakamkan? Kami urus IPTM-nya'", () => {
    const berkas = jalanMasukTpuUntuk(4).find((satu) => satu.kunci === "pengurusan_iptm");
    expect(berkas?.href).toBe("/pesan-makam/pengurusan-iptm");
    expect(berkas?.ringkas).toMatch(/sudah memakamkan sendiri/);
  });

  it("opens Saat Duka di TPU on the wizard's TPU section", () => {
    expect(jalanMasukTpuUntuk(4).find((satu) => satu.kunci === "saat_duka")?.href).toBe("/pesan-makam/saat-duka?jenis=tpu_dki");
  });

  it("sends Perpanjang IPTM to the Makam Keluarga of the Akun, where the Makam TPU of a filed IPTM is", () => {
    // The order starts from one Makam TPU (its id is in the address), so the page cannot link to it directly.
    expect(jalanMasukTpuUntuk(4).find((satu) => satu.kunci === "perpanjang_iptm")?.href).toBe("/akun/makam");
  });

  it("says Perpanjang IPTM applies only to an IPTM filed through Makam.co.id, and that one the family filed itself is not included", () => {
    const perpanjang = jalanMasukTpuUntuk(4).find((satu) => satu.kunci === "perpanjang_iptm");
    expect(perpanjang?.batas).toMatch(/Hanya untuk IPTM yang kami ajukan lewat Makam\.co\.id/);
    expect(perpanjang?.batas).toMatch(/diurus sendiri tidak termasuk/);
    expect(perpanjang?.batas).toMatch(/tanya CS/);
  });

  it("opens nothing while the TPU release is closed: each way in says it is not here yet, with no link and no limit to read", () => {
    for (const rilis of [1, 2, 3] as const) {
      for (const satu of jalanMasukTpuUntuk(rilis)) {
        expect(satu.href, `${satu.kunci} at Rilis ${rilis}`).toBeUndefined();
        expect(satu.batas, `${satu.kunci} at Rilis ${rilis}`).toBeUndefined();
      }
    }
  });

  it("links only pages the release map has, and has open by the TPU release", () => {
    for (const satu of jalanMasukTpuUntuk(4)) {
      const path = satu.href!.split("?")[0]!;
      const fitur = fiturUntukRute(path);
      expect(fitur, path).toBeDefined();
      expect(terbukaDi(fitur!, 4), path).toBe(true);
    }
  });
});

describe("Pengurusan di TPU DKI, the prices", () => {
  const harga = { pengurusanPemakaman: { total: 4_000_000 }, pengurusanBerkas: { total: 2_500_000 }, retribusiIptm: { total: 0 } };

  it("labels the Biaya Pengurusan 'harga contoh' during the beta, with a note that says what that means", () => {
    expect(LABEL_HARGA_CONTOH).toBe("harga contoh");
    expect(
      barisHargaTpu(harga, true)
        .filter((baris) => baris.contoh)
        .map((baris) => baris.kunci),
    ).toEqual(["pengurusan_pemakaman", "pengurusan_berkas"]);
    expect(catatanHargaContoh).toMatch(/harga contoh/);
    expect(catatanHargaContoh).toMatch(/bukan harga yang berlaku/);
  });

  it("labels no price once the prices are the Operator's own", () => {
    expect(barisHargaTpu(harga, false).some((baris) => baris.contoh)).toBe(false);
  });

  it("leaves the Retribusi Pemda unlabelled: the Pemda sets it, and Rp 0 is what it charges", () => {
    const retribusi = barisHargaTpu(harga, true).find((baris) => baris.kunci === "retribusi_iptm");
    expect(retribusi).toEqual({ kunci: "retribusi_iptm", label: "Retribusi Pemda (IPTM)", total: 0, contoh: false });
  });

  it("keeps the three rows in the order the page has always listed them, and never labels a price that is not set", () => {
    const baris = barisHargaTpu({ pengurusanPemakaman: null, pengurusanBerkas: { total: 2_500_000 }, retribusiIptm: null }, true);
    expect(baris.map((satu) => [satu.label, satu.total, satu.contoh])).toEqual([
      ["Mengatur pemakaman, lalu mengurus IPTM", null, false],
      ["Hanya mengurus IPTM (keluarga sudah memakamkan sendiri)", 2_500_000, true],
      ["Retribusi Pemda (IPTM)", null, false],
    ]);
  });
});

describe("Pengurusan di TPU DKI, the Layanan price list", () => {
  /** The offer as the Layanan module hands it over: each Layanan in catalog order with its priced variants. */
  const penawaran = [
    {
      layanan: { id: "layanan-nisan", name: "Batu Nisan" },
      varian: [
        { id: "varian-granit", name: "Granit Hitam 60 x 80 cm", harga: 1_500_000 },
        { id: "varian-marmer", name: "Marmer Putih 60 x 80 cm", harga: 1_750_000 },
      ],
    },
    { layanan: { id: "layanan-bunga", name: "Karangan Bunga Papan" }, varian: [{ id: "varian-standar", name: "Standar", harga: 150_000 }] },
  ];

  it("keeps the Layanan and their variants in the order the offer has them, each variant with its own amount", () => {
    const kelompok = kelompokHargaLayananTpu(penawaran, false);

    expect(kelompok.map((satu) => satu.nama)).toEqual(["Batu Nisan", "Karangan Bunga Papan"]);
    expect(kelompok.map((satu) => satu.baris.map((baris) => [baris.label, baris.total]))).toEqual([
      [
        ["Granit Hitam 60 x 80 cm", 1_500_000],
        ["Marmer Putih 60 x 80 cm", 1_750_000],
      ],
      [["Standar", 150_000]],
    ]);
  });

  it("labels every amount 'harga contoh' while prices may still be examples, and none once they are the Operator's own", () => {
    expect(kelompokHargaLayananTpu(penawaran, true).flatMap((satu) => satu.baris).every((baris) => baris.contoh)).toBe(true);
    expect(kelompokHargaLayananTpu(penawaran, false).flatMap((satu) => satu.baris).some((baris) => baris.contoh)).toBe(false);
  });

  it("explains 'harga contoh' for the Layanan prices in a note of its own, not the Biaya Pengurusan's", () => {
    expect(catatanHargaLayananContoh).toBe("Selama masa uji coba, harga Layanan di atas adalah harga contoh, bukan harga yang berlaku.");
    expect(catatanHargaLayananContoh).not.toBe(catatanHargaContoh);
  });

  it("is an empty list when no Layanan is offered, and drops a Layanan that has no priced variant", () => {
    expect(kelompokHargaLayananTpu([], true)).toEqual([]);
    expect(kelompokHargaLayananTpu([{ layanan: { id: "kosong", name: "Pembersihan Makam" }, varian: [] }], true)).toEqual([]);
  });
});

describe("Kebijakan Privasi", () => {
  const sections = kebijakanPrivasiSections("PT Jaya Korpora Prima");
  const text = (s: typeof sections) => s.flatMap((section) => section.paragraphs).join(" ");

  it("names the Operator from Pengaturan Operator as the one who manages the data", () => {
    expect(sections[0]!.paragraphs[0]).toContain("PT Jaya Korpora Prima mengelola makam.co.id");
    expect(text(kebijakanPrivasiSections(null))).toContain("Pengelola makam.co.id");
  });

  it("covers what UU PDP asks a privacy notice to say", () => {
    expect(sections.map((section) => section.label)).toEqual([
      "Siapa yang mengelola data Anda",
      "Data yang kami kumpulkan",
      "Untuk apa data dipakai",
      "Dengan siapa data dibagikan",
      "Di mana dan bagaimana data Anda dijaga",
      "Hak Anda",
      "Bila terjadi kebocoran data",
      "Perubahan kebijakan ini",
    ]);
    expect(text(sections)).toContain("kewajiban hukum");
    expect(text(sections)).toContain("Jakarta, Indonesia");
    expect(text(sections)).toContain("dua tahun setelah pesanan selesai");
  });

  it("writes no number, so no deadline or period can go stale: the law's own deadlines are named, not counted", () => {
    expect(text(sections)).not.toMatch(/\d/);
    expect(text(sections)).toContain("batas waktu yang ditetapkan Undang-Undang Pelindungan Data Pribadi");
  });
});
