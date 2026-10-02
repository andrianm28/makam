import { describe, expect, it } from "vitest";
import { tumpangPanel } from "./tumpang-panel";

const dasar = {
  jenis: "tumpang" as const,
  konsen: { state: "implisit" as const, via: "implicit" as const, catatan: null },
  gantiPemegangHakDiingatkan: false,
  pemeriksaan: { ok: true as const },
  tagihanSebelumnyaBelumLunas: [],
};

describe("the Admin Lokasi's panel for a further burial (Makamkan di sini)", () => {
  it("shows implicit consent and lets the Lokasi confirm", () => {
    expect(tumpangPanel(dasar, "diajukan")).toMatchObject({
      konsenLabel: "Disetujui otomatis: email Akun Pemesan sama dengan email Pemegang Hak.",
      bisaCatatKonsen: false,
      bisaKonfirmasi: true,
      blokKonfirmasi: null,
    });
  });

  it("waits for the Pemegang Hak's emailed Setujui / Tolak, which the Lokasi may also log as verbal consent or heirship proof, but cannot confirm yet", () => {
    const panel = tumpangPanel({ ...dasar, konsen: { state: "menunggu_pemegang", via: null, catatan: null } }, "diajukan");
    expect(panel).toMatchObject({
      konsenLabel: "Menunggu Setujui / Tolak dari Pemegang Hak lewat Akun Saya (email sudah dikirim).",
      bisaCatatKonsen: true,
      bisaKonfirmasi: false,
      blokKonfirmasi: "Persetujuan Pemegang Hak belum selesai.",
    });
  });

  it("asks the Lokasi to log verbal consent or heirship proof when the holder has no recorded email", () => {
    expect(tumpangPanel({ ...dasar, konsen: { state: "menunggu_lokasi", via: null, catatan: null } }, "diajukan")).toMatchObject({
      konsenLabel: "Pemegang Hak tidak punya email tercatat: catat persetujuan lisan atau bukti ahli waris.",
      bisaCatatKonsen: true,
      bisaKonfirmasi: false,
    });
  });

  it("names how a settled consent was given, and reminds to record a Ganti Pemegang Hak after an heirship proof", () => {
    expect(tumpangPanel({ ...dasar, konsen: { state: "disetujui", via: "verbal", catatan: "Lewat telepon" } }, "diajukan")).toMatchObject({
      konsenLabel: "Disetujui lisan, dicatat Admin Lokasi: Lewat telepon",
      bisaCatatKonsen: false,
      bisaKonfirmasi: true,
      pengingatGanti: null,
    });
    expect(tumpangPanel({ ...dasar, konsen: { state: "disetujui", via: "ahli_waris", catatan: "Surat waris" }, gantiPemegangHakDiingatkan: true }, "diajukan")).toMatchObject({
      konsenLabel: "Disetujui dengan bukti ahli waris: Surat waris",
      pengingatGanti: "Catat Ganti Pemegang Hak ke ahli waris yang membawa bukti ini.",
    });
    expect(tumpangPanel({ ...dasar, konsen: { state: "disetujui", via: "email", catatan: null } }, "diajukan").konsenLabel).toBe("Disetujui Pemegang Hak lewat email.");
  });

  it("blocks confirmation with the failing tumpang check's reason", () => {
    expect(tumpangPanel({ ...dasar, pemeriksaan: { ok: false, reason: "masa_tunggu_belum_lewat" } }, "diajukan")).toMatchObject({
      bisaKonfirmasi: false,
      blokKonfirmasi: "Masa tunggu sejak pemakaman terakhir belum lewat.",
    });
  });

  it("warns about an earlier Tagihan under the same Hak Pakai that is still unpaid, without blocking", () => {
    const panel = tumpangPanel({ ...dasar, tagihanSebelumnyaBelumLunas: [{ nomorPesanan: "MKM-2026-000001", nomorTagihan: "TGH-2026-000009" }] }, "diajukan");
    expect(panel.peringatan).toEqual(["Tagihan TGH-2026-000009 untuk pesanan MKM-2026-000001 di Hak Pakai ini belum lunas."]);
    expect(panel.bisaKonfirmasi).toBe(true);
  });

  it("offers nothing to confirm once the order is past Diajukan", () => {
    expect(tumpangPanel(dasar, "dikonfirmasi")).toMatchObject({ bisaKonfirmasi: false, bisaCatatKonsen: false });
  });
});
