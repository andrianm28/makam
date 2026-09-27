import { describe, expect, it } from "vitest";
import { caraKamiBekerjaSections, faqQuestions, tentangKamiParagrafs } from "./content-pages";

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
