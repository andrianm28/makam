import { describe, expect, it } from "vitest";
import { bacaEkspor, type KatalogLamaEkspor } from "./ekspor";
import { penandaDataContoh, susunRencana } from "./peta";
import contoh from "./fixtures/katalog-lama-contoh.json";

/** The example export, read through the contract. */
function ekspor(): KatalogLamaEkspor {
  return baca(contoh as Record<string, unknown>);
}

/** A document read through the contract, changed by `ubah` first. */
function baca(dokumen: unknown): KatalogLamaEkspor {
  const hasil = bacaEkspor(structuredClone(dokumen));
  if (!hasil.ok) throw new Error(`ditolak: ${hasil.reason}`);
  return hasil.ekspor;
}

/** The example export with the first Lokasi changed, for the rules only the plan knows. */
function dengan(ubah: (lokasi: Record<string, unknown>) => void): KatalogLamaEkspor {
  const dokumen = structuredClone(contoh) as Record<string, unknown>;
  ubah((dokumen.lokasi as Record<string, unknown>[])[0]);
  return baca(dokumen);
}

/** The plan for the example export, on the day the fake Clock stands on. */
const hariIni = "2026-10-01";

describe("the import plan for the old app's catalog", () => {
  it("maps every Lokasi to a Lokasi Mitra profile and every priced Jenis Makam to one", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    expect(rencana.lokasi).toHaveLength(3);
    expect(rencana.lokasi[0]).toMatchObject({
      kode: "TPU-BT-01",
      lokasi: {
        name: "TPU Contoh Satu",
        pengelolaName: "PJT Contoh Satu",
        address: "Jl. Contoh No. 1, Kota Contoh",
        city: "Kota Contoh",
      },
      profil: {
        pin: { lat: -6.2, lng: 106.865 },
        facilities: { checked: ["parkir", "musala", "toilet"], note: "Fasilitas contoh, bukan data sebenarnya." },
      },
      biayaPemakaman: { biayaPemakaman: 750_000, biayaPemakamanTumpang: 1_000_000 },
      statusTerbit: "published",
    });
    // The pin read out of the Google Maps URL of the second row.
    expect(rencana.lokasi[1].profil.pin).toEqual({ lat: -6.6, lng: 107 });
    expect(rencana.lokasi[2].profil.pin).toBeNull();

    expect(rencana.jenisMakam).toHaveLength(4);
    expect(rencana.jenisMakam[0]).toMatchObject({
      kode: "TPU-BT-01-STD",
      nama: "Makam Standar",
      masaHak: { kind: "tahun", years: 10 },
      hargaHakPakai: 3_500_000,
      hargaPerpanjangan: 1_750_000,
      effectiveOn: hariIni,
      allIn: 4_250_000,
      diLuarCap: false,
    });
  });

  it("keeps a Jenis Makam whose all-in total passes the Rp 10 juta QRIS cap, and reports it as not listed", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    const deluxe = rencana.jenisMakam.find((jenis) => jenis.kode === "TPU-BT-01-DLX");
    expect(deluxe).toMatchObject({ allIn: 12_750_000, diLuarCap: true });
    expect(rencana.ringkasan.jenisMakamDiLuarCap).toBe(1);
    // Nothing is dropped for being over the cap: the Lokasi keeps it, unlisted.
    expect(rencana.lokasi[0].jenisMakam.map((jenis) => jenis.kode)).toEqual(["TPU-BT-01-STD", "TPU-BT-01-DLX"]);
  });

  it("refuses a price the old app only estimated, and asks what its real price should be", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    expect(rencana.ditolak).toEqual([
      {
        kode: "TPU-CMG-03-PKG",
        untuk: "jenis_makam",
        alasan: "harga_belum_dapat_dimasukkan",
        detail: "hanya rentang indikatif Rp 4.000.000 – Rp 7.200.000 (Estimasi internal (data contoh))",
      },
    ]);
    expect(rencana.pertanyaan).toContainEqual({
      tentang: "harga_indikatif",
      kode: "TPU-CMG-03-PKG",
      detail:
        "Aplikasi lama hanya punya rentang indikatif Rp 4.000.000 – Rp 7.200.000 (Estimasi internal (data contoh)), bukan harga yang bisa ditagih; v1 tidak mengimpornya sebagai harga Hak Pakai. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.",
    });
    expect(rencana.lokasi[2].jenisMakam.map((jenis) => jenis.kode)).toEqual(["TPU-CMG-03-STD"]);
  });

  it("refuses a Jenis Makam with no price at all, and says that instead of quoting an empty range", () => {
    const tanpaHarga = dengan((lokasi) => {
      (lokasi.jenisMakam as Record<string, unknown>[])[0].hargaIndikatif = null;
      (lokasi.jenisMakam as Record<string, unknown>[])[1].hargaHakPakai = null;
      (lokasi.jenisMakam as Record<string, unknown>[])[1].masaHak = null;
    });

    const rencana = susunRencana(tanpaHarga, hariIni);

    expect(rencana.ditolak).toContainEqual({
      kode: "TPU-BT-01-DLX",
      untuk: "jenis_makam",
      alasan: "harga_belum_dapat_dimasukkan",
      detail: "tidak punya harga",
    });
    expect(rencana.pertanyaan).toContainEqual({
      tentang: "harga_indikatif",
      kode: "TPU-BT-01-DLX",
      detail:
        "Aplikasi lama tidak punya harga untuk Jenis Makam ini, jadi tidak ada yang bisa diimpor. Perlu harga Hak Pakai yang sebenarnya, beserta masa hak dan harga perpanjangannya.",
    });
  });

  it("names the rows the old app itself marked as example data, so nobody reads them as real cemeteries", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    // "Jl. Contoh" addresses in the first two rows; the third has a real-looking address.
    expect(rencana.dataContoh).toEqual([
      { kode: "TPU-BT-01", penanda: "alamat diawali \"Jl. Contoh\"" },
      { kode: "WKF-BGR-02", penanda: "alamat diawali \"Jl. Contoh\"" },
    ]);
    expect(rencana.ringkasan.dataContoh).toBe(2);
  });

  it("reads the old app's own example markers: the frozen address prefix and name suffix", () => {
    expect(penandaDataContoh({ nama: "TPU Contoh Satu", alamat: "Jl. Contoh No. 1" })).toBe('alamat diawali "Jl. Contoh"');
    expect(penandaDataContoh({ nama: "TPU Banten (pemakaman contoh)", alamat: "Jl. Patriot No. 3" })).toBe(
      'nama berakhiran "(pemakaman contoh)"',
    );
    expect(penandaDataContoh({ nama: "TPU Banten", alamat: "Jl. Patriot No. 3" })).toBeNull();
  });

  it("takes a future price's own date as its effective date, and refuses one already in force", () => {
    const akanDatang = susunRencana(ekspor(), hariIni).jenisMakam.find((jenis) => jenis.kode === "WKF-BGR-02-STD");
    expect(akanDatang?.effectiveOn).toBe("2026-10-01");

    const lampau = dengan((lokasi) => {
      (lokasi.jenisMakam as Record<string, unknown>[])[0].berlakuMulai = "2026-01-01";
    });
    const rencana = susunRencana(lampau, hariIni);

    expect(rencana.ditolak).toContainEqual({
      kode: "TPU-BT-01-STD",
      untuk: "jenis_makam",
      alasan: "harga_berlaku_sudah_lampau",
      detail: "2026-01-01",
    });
    expect(rencana.pertanyaan).toContainEqual({
      tentang: "harga_lampau",
      kode: "TPU-BT-01-STD",
      detail: "Harga lama berlaku sejak 2026-01-01; v1 tidak menulis ulang harga yang sudah berlaku. Perlu keputusan owner.",
    });
  });

  it("refuses a fixed term with no Perpanjangan price, and two codes or two names used twice", () => {
    const tanpaPerpanjangan = dengan((lokasi) => {
      (lokasi.jenisMakam as Record<string, unknown>[])[0].hargaPerpanjangan = null;
    });
    expect(susunRencana(tanpaPerpanjangan, hariIni).ditolak).toContainEqual({
      kode: "TPU-BT-01-STD",
      untuk: "jenis_makam",
      alasan: "harga_perpanjangan_wajib",
      detail: "masa hak 10 tahun",
    });

    const kodeGanda = dengan((lokasi) => {
      (lokasi.jenisMakam as Record<string, unknown>[]).push({
        kode: "WKF-BGR-02-STD",
        nama: "Makam Empat",
        deskripsi: "",
        hargaHakPakai: 1_000_000,
        masaHak: { jenis: "selamanya" },
        hargaPerpanjangan: null,
      });
    });
    expect(susunRencana(kodeGanda, hariIni).ditolak).toContainEqual({
      kode: "WKF-BGR-02-STD",
      untuk: "jenis_makam",
      alasan: "kode_ganda",
      detail: "WKF-BGR-02-STD",
    });

    const namaGanda = dengan((lokasi) => {
      (lokasi.jenisMakam as Record<string, unknown>[]).push({
        kode: "TPU-BT-01-EMU",
        nama: "Makam Standar",
        deskripsi: "",
        hargaHakPakai: 1_000_000,
        masaHak: { jenis: "selamanya" },
        hargaPerpanjangan: null,
      });
    });
    expect(susunRencana(namaGanda, hariIni).ditolak).toContainEqual({
      kode: "TPU-BT-01-EMU",
      untuk: "jenis_makam",
      alasan: "nama_jenis_makam_ganda",
      detail: "Makam Standar",
    });
  });

  it("refuses the second row that repeats a Lokasi code, keeping the first", () => {
    const dokumen = structuredClone(contoh) as { lokasi: Record<string, unknown>[] };
    dokumen.lokasi.push({ ...dokumen.lokasi[0] });

    const rencana = susunRencana(baca(dokumen), hariIni);

    expect(rencana.ditolak).toContainEqual({
      kode: "TPU-BT-01",
      untuk: "lokasi",
      alasan: "kode_ganda",
      detail: "TPU-BT-01",
    });
    expect(rencana.lokasi.map((satu) => satu.kode)).toEqual(["TPU-BT-01", "WKF-BGR-02", "TPU-CMG-03"]);
  });

  it("asks about every Lokasi the old app had not published, quoting its own status", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    expect(rencana.pertanyaan.filter((pertanyaan) => pertanyaan.tentang === "status_terbit")).toEqual([
      {
        tentang: "status_terbit",
        kode: "WKF-BGR-02",
        detail: 'Aplikasi lama menyimpan status terbit "draft"; v1 tetap mengimpornya sebagai Belum Tayang.',
      },
      {
        tentang: "status_terbit",
        kode: "TPU-CMG-03",
        detail: 'Aplikasi lama menyimpan status terbit "unpublished"; v1 tetap mengimpornya sebagai Belum Tayang.',
      },
    ]);
  });

  it("flags a Lokasi the old app priced nothing for, instead of importing it as a Lokasi without a price", () => {
    const tanpaHarga = dengan((lokasi) => {
      lokasi.jenisMakam = [];
    });
    const rencana = susunRencana(tanpaHarga, hariIni);

    expect(rencana.lokasi[0].jenisMakam).toEqual([]);
    expect(rencana.pertanyaan).toContainEqual({
      tentang: "tanpa_jenis_makam",
      kode: "TPU-BT-01",
      detail: "Aplikasi lama tidak punya harga untuk Lokasi ini; Lokasi Mitra-nya tetap diimpor tanpa Jenis Makam.",
    });
  });

  it("counts what it read, what it will import and what it refused", () => {
    const rencana = susunRencana(ekspor(), hariIni);

    expect(rencana.ringkasan).toEqual({
      lokasiDibaca: 3,
      lokasiDiimpor: 3,
      jenisMakamDibaca: 5,
      jenisMakamDiimpor: 4,
      jenisMakamDiLuarCap: 1,
      dataContoh: 2,
      ditolak: 1,
    });
  });
});
