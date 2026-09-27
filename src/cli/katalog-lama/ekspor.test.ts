import { describe, expect, it } from "vitest";
import { bacaEkspor, KATALOG_LAMA_FORMAT } from "./ekspor";
import contoh from "./fixtures/katalog-lama-contoh.json";

/** The fixture, as a document the owner hands over, deep-copied so a case may change it. */
function doc(): Record<string, unknown> {
  return structuredClone(contoh) as Record<string, unknown>;
}

/** The `lokasi` rows of a document, as writable records. */
function lokasi(dokumen: Record<string, unknown>): Record<string, unknown>[] {
  return dokumen.lokasi as Record<string, unknown>[];
}

/** One `jenisMakam` row of the first Lokasi, as a writable record. */
function jenis(dokumen: Record<string, unknown>, index = 0): Record<string, unknown> {
  return (lokasi(dokumen)[0].jenisMakam as Record<string, unknown>[])[index];
}

describe("reading the old app's catalog export", () => {
  it("reads the example export: every catalog field comes through, trimmed", () => {
    const hasil = bacaEkspor(doc());

    expect(hasil.ok).toBe(true);
    if (!hasil.ok) return;
    expect(hasil.ekspor.format).toBe(KATALOG_LAMA_FORMAT);
    expect(hasil.ekspor.lokasi).toHaveLength(3);
    const [tpu, wakaf] = hasil.ekspor.lokasi;
    expect(tpu).toMatchObject({
      kode: "TPU-BT-01",
      nama: "TPU Contoh Satu",
      pengelola: "PJT Contoh Satu",
      alamat: "Jl. Contoh No. 1, Kota Contoh",
      kota: "Kota Contoh",
      pin: { lat: -6.2, lng: 106.865 },
      fasilitas: ["parkir", "musala", "toilet"],
      catatanFasilitas: "Fasilitas contoh, bukan data sebenarnya.",
      statusTerbit: "published",
    });
    expect(tpu.biayaPemakaman).toEqual({ biayaPemakaman: 750_000, biayaPemakamanTumpang: 1_000_000 });
    expect(tpu.jenisMakam.map((satu) => satu.kode)).toEqual(["TPU-BT-01-STD", "TPU-BT-01-DLX"]);
    expect(tpu.jenisMakam[0]).toMatchObject({
      nama: "Makam Standar",
      masaHak: { kind: "tahun", years: 10 },
      hargaHakPakai: 3_500_000,
      hargaPerpanjangan: 1_750_000,
      berlakuMulai: null,
    });
    expect(tpu.jenisMakam[1]).toMatchObject({ masaHak: { kind: "selamanya" }, hargaPerpanjangan: null });
    // A Lokasi with no Biaya Pemakaman in the old app.
    expect(wakaf.biayaPemakaman).toBeNull();
  });

  it("reads a price the old app only knows as an indicative range, and the status it published a Lokasi under", () => {
    const dokumen = doc();
    jenis(dokumen, 1).hargaHakPakai = null;
    jenis(dokumen, 1).masaHak = null;
    jenis(dokumen, 1).hargaPerpanjangan = null;
    jenis(dokumen, 1).hargaIndikatif = { min: 9_000_000, max: 16_200_000, sumber: "Estimasi internal (data contoh)", berlakuMulai: null };

    const hasil = bacaEkspor(dokumen);

    expect(hasil.ok && hasil.ekspor.lokasi[0].jenisMakam[1]).toMatchObject({
      hargaHakPakai: null,
      masaHak: null,
      hargaIndikatif: { min: 9_000_000, max: 16_200_000, sumber: "Estimasi internal (data contoh)", berlakuMulai: null },
    });
  });

  it("refuses a price with no tenure, and an indicative range that is not rupiah", () => {
    const tanpaMasa = doc();
    jenis(tanpaMasa, 0).masaHak = null;
    const rusak = doc();
    jenis(rusak, 0).hargaIndikatif = { min: "3.000.000", max: 5_400_000, sumber: null, berlakuMulai: null };

    for (const dokumen of [tanpaMasa, rusak]) {
      const hasil = bacaEkspor(dokumen);
      expect(hasil).toMatchObject({ ok: false, reason: "bukan_ekspor_katalog" });
    }
    expect(bacaEkspor(tanpaMasa)).toMatchObject({ detail: expect.stringContaining("masaHak") });
  });

  it("refuses the whole export when any column is personal, naming every one of them and never its value", () => {
    const dokumen = doc();
    lokasi(dokumen)[0].email = "contoh@makam.invalid";
    lokasi(dokumen)[0].no_hp = "081200000000";
    lokasi(dokumen)[0].jenisMakam = [{ ...jenis(dokumen), nama_pemesan: "Contoh Pemesan" }];

    const hasil = bacaEkspor(dokumen);

    expect(hasil).toEqual({
      ok: false,
      reason: "kolom_pii_dilarang",
      kolom: [
        { kolom: "lokasi[0].email", alasan: "email" },
        { kolom: "lokasi[0].no_hp", alasan: "nomor telepon" },
        { kolom: "lokasi[0].jenisMakam[0].nama_pemesan", alasan: "data orang" },
      ],
    });
    expect(JSON.stringify(hasil)).not.toContain("081200000000");
    expect(JSON.stringify(hasil)).not.toContain("contoh@makam.invalid");
  });

  it("refuses personal columns the old app keeps in tables this tool never reads (users, orders, payments)", () => {
    for (const kolom of ["user_id", "akun_id", "password", "no_ktp", "no_rekening", "tagihan_id", "dokumen_url"]) {
      const dokumen = doc();
      lokasi(dokumen)[0][kolom] = "x";

      const hasil = bacaEkspor(dokumen);
      expect(hasil.ok).toBe(false);
      expect(hasil.ok === false && hasil.reason === "kolom_pii_dilarang" && hasil.kolom).toMatchObject([
        { kolom: `lokasi[0].${kolom}` },
      ]);
    }
  });

  it("keeps the catalog's own address, pengelola and kode: they are catalog, not people", () => {
    expect(bacaEkspor(doc()).ok).toBe(true);
  });

  it("reads a pin out of a Google Maps URL, and refuses one with no coordinates in it", () => {
    const denganUrl = doc();
    delete lokasi(denganUrl)[0].titik;
    lokasi(denganUrl)[0].googleMapsUrl = "https://www.google.com/maps/@-6.1751,106.8650,17z";

    const hasil = bacaEkspor(denganUrl);

    expect(hasil.ok && hasil.ekspor.lokasi[0].pin).toEqual({ lat: -6.1751, lng: 106.865 });

    const tanpaTitik = doc();
    delete lokasi(tanpaTitik)[0].titik;
    lokasi(tanpaTitik)[0].googleMapsUrl = "https://maps.app.goo.gl/contoh";

    const ditolak = bacaEkspor(tanpaTitik);
    expect(ditolak).toMatchObject({ ok: false, reason: "bukan_ekspor_katalog" });
    expect(ditolak.ok === false && ditolak.reason === "bukan_ekspor_katalog" && ditolak.detail).toContain(
      "lokasi[0].googleMapsUrl",
    );
  });

  it("is not an export when the format is missing, another one, or the document is not JSON at all", () => {
    const tanpaFormat = doc();
    delete tanpaFormat.format;
    const formatLain = { ...doc(), format: "makam.katalog-lama/v2" };

    for (const dokumen of [tanpaFormat, formatLain, "bukan objek", null, 42]) {
      const hasil = bacaEkspor(dokumen);
      expect(hasil.ok).toBe(false);
      expect(hasil.ok === false && hasil.reason).toBe("bukan_ekspor_katalog");
    }
  });

  it("refuses a field the catalog contract does not have, rather than importing it silently", () => {
    const dokumen = doc();
    lokasi(dokumen)[0].harga_sewa_bulanan = 500_000;

    const hasil = bacaEkspor(dokumen);

    expect(hasil).toMatchObject({ ok: false, reason: "bukan_ekspor_katalog" });
    expect(hasil.ok === false && hasil.reason === "bukan_ekspor_katalog" && hasil.detail).toContain("harga_sewa_bulanan");
  });

  it("refuses a facility that is not on v1's list", () => {
    const dokumen = doc();
    lokasi(dokumen)[0].fasilitas = ["parkir", "lift_roda_kursi"];

    const hasil = bacaEkspor(dokumen);

    expect(hasil).toMatchObject({ ok: false, reason: "bukan_ekspor_katalog" });
  });
});
