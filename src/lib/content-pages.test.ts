import { describe, expect, it } from "vitest";
import {
  barisHargaTpu,
  caraKamiBekerjaSections,
  caraKamiBekerjaSectionsUntuk,
  catatanHargaContoh,
  faqQuestions,
  jalanMasukTpuUntuk,
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
    expect(text).toMatch(/Tempat Pemakaman Umum/);
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
  it("is the three trust claims, one section each", () => {
    expect(caraKamiBekerjaSections.map((section) => section.label)).toEqual([
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

  it("says the TPU permit is free and may be filed by the family themselves", () => {
    const izin = caraKamiBekerjaSections[2].paragraphs.join(" ");
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
    expect(caraKamiBekerjaSections[2].paragraphs.join(" ")).toMatch(/belum kami terbitkan di makam\.co\.id/);
    const perpanjangan = faqQuestions("PT Jaya Korpora Prima").find((entry) => entry.question === "Perpanjangan");
    expect(perpanjangan?.answer).toMatch(/belum ada di makam\.co\.id/);
    expect(perpanjangan?.answer).toMatch(/tanya CS lewat WhatsApp/);
  });
});

describe("FAQ", () => {
  const faq = faqQuestions("PT Jaya Korpora Prima");

  it("answers the seven questions the release asks for, in that order", () => {
    expect(faq.map((entry) => entry.question)).toEqual([
      "Pesan Makam atau Hak Pakai?",
      "Apa yang dibayar, dan kapan?",
      "Pembatalan",
      "Perpanjangan",
      "Siapa yang boleh dimakamkan di TPU?",
      "Dokumen apa saja yang perlu?",
      "Untuk apa data keluarga saya dipakai?",
    ]);
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
  const izin = (rilis: 1 | 2 | 3) => caraKamiBekerjaSectionsUntuk(rilis)[2].paragraphs.join(" ");

  it("points at the Pengurusan di TPU DKI page once the TPU release is open, instead of saying it is not published", () => {
    expect(izin(3)).toMatch(/halaman Pengurusan di TPU DKI/);
    expect(izin(3)).not.toMatch(/belum kami terbitkan/);
  });

  it("keeps saying the guide is not published, and names the CS, while the TPU release is closed", () => {
    for (const rilis of [1, 2] as const) {
      expect(izin(rilis)).toMatch(/belum kami terbitkan di makam\.co\.id/);
      expect(izin(rilis)).not.toMatch(/halaman Pengurusan di TPU DKI/);
    }
    expect(caraKamiBekerjaSections).toEqual(caraKamiBekerjaSectionsUntuk(1));
  });

  it("changes nothing else in the three trust claims between releases", () => {
    for (const rilis of [2, 3] as const) {
      const sections = caraKamiBekerjaSectionsUntuk(rilis);
      expect(sections.map((section) => section.label)).toEqual(caraKamiBekerjaSections.map((section) => section.label));
      expect(sections[0]).toEqual(caraKamiBekerjaSections[0]);
      expect(sections[1]).toEqual(caraKamiBekerjaSections[1]);
      expect(sections[2].paragraphs[0]).toBe(caraKamiBekerjaSections[2].paragraphs[0]);
      expect(sections[2].paragraphs[2]).toBe(caraKamiBekerjaSections[2].paragraphs[2]);
    }
  });
});

describe("Pengurusan di TPU DKI, the three ways in", () => {
  it("links all three once the TPU release is open, and none of them says Segera hadir", () => {
    const jalan = jalanMasukTpuUntuk(3);
    expect(jalan.map((satu) => satu.label)).toEqual(["Saat Duka di TPU", "Perpanjang IPTM", "Sudah dimakamkan? Kami urus IPTM-nya"]);
    expect(jalan.every((satu) => typeof satu.href === "string")).toBe(true);
    expect(jalan.map((satu) => `${satu.ringkas} ${satu.batas ?? ""}`).join(" ")).not.toMatch(/segera hadir|menyusul/i);
  });

  it("links the filing-only Pengurusan IPTM form, 'Sudah dimakamkan? Kami urus IPTM-nya'", () => {
    const berkas = jalanMasukTpuUntuk(3).find((satu) => satu.kunci === "pengurusan_iptm");
    expect(berkas?.href).toBe("/pesan-makam/pengurusan-iptm");
    expect(berkas?.ringkas).toMatch(/sudah memakamkan sendiri/);
  });

  it("opens Saat Duka di TPU on the wizard's TPU section", () => {
    expect(jalanMasukTpuUntuk(3).find((satu) => satu.kunci === "saat_duka")?.href).toBe("/pesan-makam/saat-duka?jenis=tpu_dki");
  });

  it("sends Perpanjang IPTM to the Makam Keluarga of the Akun, where the Makam TPU of a filed IPTM is", () => {
    // The order starts from one Makam TPU (its id is in the address), so the page cannot link to it directly.
    expect(jalanMasukTpuUntuk(3).find((satu) => satu.kunci === "perpanjang_iptm")?.href).toBe("/akun/makam");
  });

  it("says Perpanjang IPTM applies only to an IPTM filed through Makam.co.id, and that one the family filed itself is not included", () => {
    const perpanjang = jalanMasukTpuUntuk(3).find((satu) => satu.kunci === "perpanjang_iptm");
    expect(perpanjang?.batas).toMatch(/Hanya untuk IPTM yang kami ajukan lewat Makam\.co\.id/);
    expect(perpanjang?.batas).toMatch(/diurus sendiri tidak termasuk/);
    expect(perpanjang?.batas).toMatch(/tanya CS/);
  });

  it("opens nothing while the TPU release is closed: each way in says it is not here yet, with no link and no limit to read", () => {
    for (const rilis of [1, 2] as const) {
      for (const satu of jalanMasukTpuUntuk(rilis)) {
        expect(satu.href, `${satu.kunci} at Rilis ${rilis}`).toBeUndefined();
        expect(satu.batas, `${satu.kunci} at Rilis ${rilis}`).toBeUndefined();
      }
    }
  });

  it("links only pages the release map has, and has open by the TPU release", () => {
    for (const satu of jalanMasukTpuUntuk(3)) {
      const path = satu.href!.split("?")[0]!;
      const fitur = fiturUntukRute(path);
      expect(fitur, path).toBeDefined();
      expect(terbukaDi(fitur!, 3), path).toBe(true);
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
