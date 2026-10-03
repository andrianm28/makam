import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { createNazhirList } from "@/domain/wakaf";
import { createTariffs } from "@/domain/tariffs";
import { wib } from "@/lib/time/jakarta";
import { layananOnTestDatabase, catalogFixture } from "../../tests/support/layanan";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { signedInAdminPlatform } from "../../tests/support/identity";
import { lokasiOnTestDatabase } from "../../tests/support/lokasi";
import { importDataPeluncuranCommand } from "./import-data-peluncuran-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const clock = () => new FakeClock(wib("2026-10-01 09:00"));
const env = (tambahan: Record<string, string> = {}) => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl"), ...tambahan });

const sementara: string[] = [];
afterAll(() => {
  for (const path of sementara) rmSync(path, { recursive: true, force: true });
});

/** A source folder holding the named CSV files. */
function folder(berkas: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "makam-data-peluncuran-"));
  sementara.push(dir);
  for (const [nama, isi] of Object.entries(berkas)) writeFileSync(join(dir, nama), isi);
  return dir;
}

async function modul() {
  const test = lokasiOnTestDatabase(db);
  const admin = (await signedInAdminPlatform(test)).actor;
  return { ...test, admin, tariffs: createTariffs({ db, clock: test.clock, audit: test.audit, lokasi: test.lokasi }) };
}

const TPU_HEADER = "nama,alamat,kota,lintang,bujur,sumber_data,menerima_makam_baru";
const TPU_CONTOH = `${TPU_HEADER}\nTPU Utara,"Jl. Contoh No. 1, Kelurahan Contoh",Kota Jakarta Utara,-6.12,106.88,Dinas (telepon),ya\n`;

describe("npm run import:data-peluncuran -- --sumber <folder>: TPU DKI", () => {
  it("dry-runs by default: it reports the TPU DKI it would create and writes nothing", async () => {
    const { lokasi, admin } = await modul();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": TPU_CONTOH })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Mode dry-run: tidak ada yang ditulis.");
    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(await lokasi.tpuDkiList(admin)).toEqual([]);
  });

  it("creates the TPU DKI with --tulis, as the owner typed it, and counts it", async () => {
    const { lokasi, admin } = await modul();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": TPU_CONTOH }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 1 dibuat, 0 diubah, 0 sama, 0 ditolak.");
    const [tpu] = await lokasi.tpuDkiList(admin);
    expect(tpu).toMatchObject({
      name: "TPU Utara",
      address: "Jl. Contoh No. 1, Kelurahan Contoh",
      city: "Kota Jakarta Utara",
      pin: { lat: -6.12, lng: 106.88 },
      dataSource: "Dinas (telepon)",
      menerimaMakamBaru: true,
    });
  });

  it("changes nothing on a second run over the same TPU DKI: it is idempotent on the name", async () => {
    const { lokasi, admin } = await modul();
    const sumber = folder({ "tpu-dki.csv": TPU_CONTOH });
    await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });
    const [sebelum] = await lokasi.tpuDkiList(admin);

    const hasil = await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 0 dibuat, 0 diubah, 1 sama, 0 ditolak.");
    expect(await lokasi.tpuDkiList(admin)).toEqual([sebelum]);
  });

  it("updates a TPU DKI the owner corrected, address and the new-plot flag, by name", async () => {
    const { lokasi, admin } = await modul();
    await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": TPU_CONTOH }), "--tulis"], env(), { clock: clock() });
    const koreksi = `${TPU_HEADER}\nTPU Utara,Jl. Baru No. 9,Kota Jakarta Utara,,,Dinas (kunjungan),tidak\n`;

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": koreksi }), "--tulis"], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 0 dibuat, 1 diubah, 0 sama, 0 ditolak.");
    const semua = await lokasi.tpuDkiList(admin);
    expect(semua).toHaveLength(1);
    expect(semua[0]).toMatchObject({ address: "Jl. Baru No. 9", pin: null, dataSource: "Dinas (kunjungan)", menerimaMakamBaru: false });
  });

  it("dry-runs a corrected TPU DKI as a change and leaves it as it was", async () => {
    const { lokasi, admin } = await modul();
    await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": TPU_CONTOH }), "--tulis"], env(), { clock: clock() });
    const koreksi = `${TPU_HEADER}\nTPU Utara,Jl. Baru No. 9,Kota Jakarta Utara,,,Dinas (kunjungan),tidak\n`;

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": koreksi })], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 0 akan dibuat, 1 akan diubah, 0 sama, 0 ditolak.");
    expect((await lokasi.tpuDkiList(admin))[0]).toMatchObject({ address: "Jl. Contoh No. 1, Kelurahan Contoh", menerimaMakamBaru: true });
  });

  it("refuses a row with the reason naming its column and line, writes the good rows, and exits 1", async () => {
    const { lokasi, admin } = await modul();
    const campur = [
      TPU_HEADER,
      "TPU Baik,Jl. Baik,Kota Jakarta Timur,,,Dinas,ya",
      "TPU Salah Pin,Jl. A,Kota Jakarta Timur,-6.1,,Dinas,ya",
      "TPU Salah Bendera,Jl. B,Kota Jakarta Timur,,,Dinas,mungkin",
      "TPU Baik,Jl. Dobel,Kota Jakarta Timur,,,Dinas,ya",
      "",
    ].join("\n");

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": campur }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("TPU DKI: 4 baris dibaca, 1 dibuat, 0 diubah, 0 sama, 3 ditolak.");
    expect(hasil.output).toContain("tpu-dki.csv baris 3: lintang: lintang dan bujur harus diisi keduanya atau dikosongkan keduanya");
    expect(hasil.output).toContain('tpu-dki.csv baris 4: menerima_makam_baru: harus "ya" atau "tidak"');
    expect(hasil.output).toContain('tpu-dki.csv baris 5: nama "TPU Baik" sudah muncul di baris 2');
    expect((await lokasi.tpuDkiList(admin)).map((tpu) => tpu.name)).toEqual(["TPU Baik"]);
  });
});

describe("npm run import:data-peluncuran -- --sumber <folder>: Biaya Pengurusan", () => {
  const BIAYA = "jenis,jumlah_rupiah,berlaku_mulai\npemakaman,750000,\nberkas,350000,2026-10-15\n";

  it("dry-runs the burial and filing-only Biaya Pengurusan without entering them", async () => {
    const { tariffs } = await modul();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "biaya-pengurusan.csv": BIAYA })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Biaya Pengurusan: 2 baris dibaca, 2 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(await tariffs.globalTariff("biaya_pengurusan_pemakaman", wib("2026-10-01 09:00"))).toBeNull();
  });

  it("enters both through Tariffs with --tulis, a blank date meaning the day of the import", async () => {
    const { tariffs } = await modul();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "biaya-pengurusan.csv": BIAYA }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Biaya Pengurusan: 2 baris dibaca, 2 dibuat, 0 diubah, 0 sama, 0 ditolak.");
    expect((await tariffs.globalTariff("biaya_pengurusan_pemakaman", wib("2026-10-01 09:00")))?.amount).toBe(750_000);
    expect(await tariffs.globalTariff("biaya_pengurusan_berkas", wib("2026-10-01 09:00"))).toBeNull();
    expect((await tariffs.globalTariff("biaya_pengurusan_berkas", wib("2026-10-15 09:00")))?.amount).toBe(350_000);
  });

  it("changes nothing on a second run, and enters a new version only when the amount changed", async () => {
    const { tariffs } = await modul();
    const sumber = folder({ "biaya-pengurusan.csv": BIAYA });
    await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });

    const ulang = await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });
    expect(ulang.output).toContain("Biaya Pengurusan: 2 baris dibaca, 0 dibuat, 0 diubah, 2 sama, 0 ditolak.");
    expect(await tariffs.globalTariffHistory("biaya_pengurusan_pemakaman")).toHaveLength(1);

    const naik = folder({ "biaya-pengurusan.csv": "jenis,jumlah_rupiah,berlaku_mulai\npemakaman,800000,\n" });
    const berubah = await importDataPeluncuranCommand(["--sumber", naik, "--tulis"], env(), { clock: clock() });
    expect(berubah.output).toContain("Biaya Pengurusan: 1 baris dibaca, 0 dibuat, 1 diubah, 0 sama, 0 ditolak.");
    expect((await tariffs.globalTariff("biaya_pengurusan_pemakaman", wib("2026-10-01 09:00")))?.amount).toBe(800_000);
    expect(await tariffs.globalTariffHistory("biaya_pengurusan_pemakaman")).toHaveLength(2);
  });

  it("shows in the dry run the same refusals the write would make, a past date and an amount beyond the limit", async () => {
    const { tariffs } = await modul();
    const salah = ["jenis,jumlah_rupiah,berlaku_mulai", "berkas,350000,2026-09-01", "pemakaman,100000000001,", ""].join("\n");

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "biaya-pengurusan.csv": salah })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("Biaya Pengurusan: 2 baris dibaca, 0 akan dibuat, 0 akan diubah, 0 sama, 2 ditolak.");
    expect(hasil.output).toContain("biaya-pengurusan.csv baris 2: berlaku_mulai 2026-09-01 sudah lewat");
    expect(hasil.output).toContain("biaya-pengurusan.csv baris 3: jumlah_rupiah");
    expect(await tariffs.globalTariffHistory("biaya_pengurusan_berkas")).toEqual([]);
  });

  it("refuses an unknown jenis, an amount written with a thousands separator, and a past date, each with its reason", async () => {
    const { tariffs } = await modul();
    const salah = ["jenis,jumlah_rupiah,berlaku_mulai", "kremasi,100000,", "pemakaman,750.000,", "berkas,350000,2026-09-01", ""].join("\n");

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "biaya-pengurusan.csv": salah }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("Biaya Pengurusan: 3 baris dibaca, 0 dibuat, 0 diubah, 0 sama, 3 ditolak.");
    expect(hasil.output).toContain('biaya-pengurusan.csv baris 2: jenis: jenis harus "pemakaman" atau "berkas"');
    expect(hasil.output).toContain("biaya-pengurusan.csv baris 3: jumlah_rupiah: jumlah_rupiah harus bilangan bulat rupiah");
    expect(hasil.output).toContain("biaya-pengurusan.csv baris 4: berlaku_mulai 2026-09-01 sudah lewat");
    expect(await tariffs.globalTariffHistory("biaya_pengurusan_berkas")).toEqual([]);
  });
});

describe("npm run import:data-peluncuran -- --sumber <folder>: harga Layanan DKI dan tarif Mitra Jasa", () => {
  const LAYANAN = "layanan,varian,harga_dki_rupiah,tarif_mitra_jasa_rupiah,berlaku_mulai\nPembersihan Makam,Reguler,250000,180000,\n";

  /** The catalog with one Layanan, "Pembersihan Makam" with its variant "Reguler", on the test database. */
  async function katalog() {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const sekarang = wib("2026-10-01 09:00");
    return {
      varianId: varian!.id,
      hargaDki: async () => (await setup.tariffs.hargaLayananDki(varian!.id, sekarang))?.amount ?? null,
      tarifMitraJasa: async () => (await setup.tariffs.mitraJasaRate(admin, varian!.id, sekarang))?.amount ?? null,
    };
  }

  it("dry-runs the DKI price and the Mitra Jasa rate of a catalog variant without entering them", async () => {
    const { hargaDki, tarifMitraJasa } = await katalog();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "layanan-dki.csv": LAYANAN })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Layanan DKI: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(await hargaDki()).toBeNull();
    expect(await tarifMitraJasa()).toBeNull();
  });

  it("enters the DKI price and the Mitra Jasa rate through Tariffs with --tulis", async () => {
    const { hargaDki, tarifMitraJasa } = await katalog();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "layanan-dki.csv": LAYANAN }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Layanan DKI: 1 baris dibaca, 1 dibuat, 0 diubah, 0 sama, 0 ditolak.");
    expect(await hargaDki()).toBe(250_000);
    expect(await tarifMitraJasa()).toBe(180_000);
  });

  it("changes nothing on a second run, and enters a new price version only for what changed", async () => {
    const { hargaDki, tarifMitraJasa } = await katalog();
    const sumber = folder({ "layanan-dki.csv": LAYANAN });
    await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });

    const ulang = await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });
    expect(ulang.output).toContain("Layanan DKI: 1 baris dibaca, 0 dibuat, 0 diubah, 1 sama, 0 ditolak.");

    const naik = folder({ "layanan-dki.csv": LAYANAN.replace("180000", "190000") });
    const berubah = await importDataPeluncuranCommand(["--sumber", naik, "--tulis"], env(), { clock: clock() });
    expect(berubah.output).toContain("Layanan DKI: 1 baris dibaca, 0 dibuat, 1 diubah, 0 sama, 0 ditolak.");
    expect(await hargaDki()).toBe(250_000);
    expect(await tarifMitraJasa()).toBe(190_000);
  });

  it("refuses a variant the catalog does not have, naming the Layanan and the variant", async () => {
    await katalog();
    const salah = LAYANAN.replace("Reguler", "Platinum");

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "layanan-dki.csv": salah }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain('layanan-dki.csv baris 2: varian "Platinum" dari Layanan "Pembersihan Makam" tidak ada di katalog Layanan');
  });
});

describe("npm run import:data-peluncuran -- --sumber <folder>: Nazhir", () => {
  const NAZHIR_HEADER = "nama,jenis,kab_kota,kontak,nomor_bwi";
  const NAZHIR = `${NAZHIR_HEADER}\nNazhir Sejahtera,badan_hukum,Kota Jakarta Selatan,021-5550100,BWI-001\n`;

  async function daftar() {
    const { audit, clock: jam, admin } = await modul();
    const wakaf = createNazhirList({ db, clock: jam, audit });
    return { admin, nazhir: () => wakaf.daftarNazhir(admin) };
  }

  it("dry-runs the Nazhir list without adding anyone", async () => {
    const { nazhir } = await daftar();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "nazhir.csv": NAZHIR })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Nazhir: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(await nazhir()).toEqual([]);
  });

  it("adds each Nazhir to the Wakaf list with --tulis", async () => {
    const { nazhir } = await daftar();

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "nazhir.csv": NAZHIR }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Nazhir: 1 baris dibaca, 1 dibuat, 0 diubah, 0 sama, 0 ditolak.");
    expect(await nazhir()).toMatchObject([
      { nama: "Nazhir Sejahtera", jenis: "badan_hukum", kabKota: "Kota Jakarta Selatan", kontak: "021-5550100", nomorBwi: "BWI-001" },
    ]);
  });

  it("changes nothing on a second run, updates a Nazhir whose contact changed, and never adds a second one", async () => {
    const { nazhir } = await daftar();
    const sumber = folder({ "nazhir.csv": NAZHIR });
    await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });

    const ulang = await importDataPeluncuranCommand(["--sumber", sumber, "--tulis"], env(), { clock: clock() });
    expect(ulang.output).toContain("Nazhir: 1 baris dibaca, 0 dibuat, 0 diubah, 1 sama, 0 ditolak.");

    const baru = folder({ "nazhir.csv": NAZHIR.replace("021-5550100", "021-5550199") });
    const berubah = await importDataPeluncuranCommand(["--sumber", baru, "--tulis"], env(), { clock: clock() });
    expect(berubah.output).toContain("Nazhir: 1 baris dibaca, 0 dibuat, 1 diubah, 0 sama, 0 ditolak.");
    expect(await nazhir()).toMatchObject([{ nama: "Nazhir Sejahtera", kontak: "021-5550199" }]);
  });

  it("refuses an unknown jenis and a missing BWI number with the column in the reason", async () => {
    const { nazhir } = await daftar();
    const salah = [NAZHIR_HEADER, "A,yayasan,Kota Bekasi,021,BWI-9", "B,perorangan,Kota Bekasi,021,", ""].join("\n");

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "nazhir.csv": salah }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain('nazhir.csv baris 2: jenis: jenis harus "perorangan", "organisasi", atau "badan_hukum"');
    expect(hasil.output).toContain("nazhir.csv baris 3: nomor_bwi: nomor_bwi wajib");
    expect(await nazhir()).toEqual([]);
  });
});

describe("npm run import:data-peluncuran: reading the spreadsheet's CSV", () => {
  it("reads a file saved by Excel in an Indonesian locale: semicolons, a byte-order mark, quoted cells with a line break", async () => {
    const { lokasi, admin } = await modul();
    const excel = `\uFEFF${TPU_HEADER.replaceAll(",", ";")}\r\n"TPU; Barat";"Jl. Satu\nBlok B";Kota Jakarta Barat;-6,15;106,75;Dinas;YA\r\n`;

    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "tpu-dki.csv": excel }), "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(await lokasi.tpuDkiList(admin)).toMatchObject([
      { name: "TPU; Barat", address: "Jl. Satu\nBlok B", pin: { lat: -6.15, lng: 106.75 }, menerimaMakamBaru: true },
    ]);
  });

  it("reports a missing source folder as a usage error, not a crash", async () => {
    const hasil = await importDataPeluncuranCommand(["--sumber", "/tidak/ada"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(2);
  });

  it("refuses a folder with none of the four template files, naming them", async () => {
    const hasil = await importDataPeluncuranCommand(["--sumber", folder({ "catatan.txt": "x" })], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("tpu-dki.csv, biaya-pengurusan.csv, layanan-dki.csv, nazhir.csv");
  });
});

describe("npm run import:data-peluncuran: the template the owner fills in", () => {
  const TEMPLATE = fileURLToPath(new URL("../../docs/ops/data-peluncuran", import.meta.url));

  it("passes the dry run with its worked example rows, once the catalog has the example Layanan", async () => {
    const setup = layananOnTestDatabase(db);
    await catalogFixture(setup, { varian: ["Standar"] });

    const hasil = await importDataPeluncuranCommand(["--sumber", TEMPLATE], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(hasil.output).toContain("Biaya Pengurusan: 2 baris dibaca, 2 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(hasil.output).toContain("Layanan DKI: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(hasil.output).toContain("Nazhir: 1 baris dibaca, 1 akan dibuat, 0 akan diubah, 0 sama, 0 ditolak.");
    expect(hasil.exitCode).toBe(0);
  });
});

describe("npm run import:data-peluncuran: which stack it may run on", () => {
  const sumber = () => folder({ "tpu-dki.csv": TPU_CONTOH });

  it("refuses staging without --izinkan-staging, and writes nothing", async () => {
    const hasil = await importDataPeluncuranCommand(["--sumber", sumber(), "--tulis"], env({ APP_ENV: "staging" }), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("Ditolak: di staging perlu --izinkan-staging");
  });

  it("refuses production without --izinkan-production, even with --izinkan-staging", async () => {
    const hasil = await importDataPeluncuranCommand(
      ["--sumber", sumber(), "--tulis", "--izinkan-staging"],
      env({ APP_ENV: "production" }),
      { clock: clock() },
    );

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("Ditolak: di production perlu --izinkan-production");
  });

  it("lets production past the gate only with --izinkan-production (the stack itself is then checked as usual)", async () => {
    const hasil = await importDataPeluncuranCommand(
      ["--sumber", sumber(), "--izinkan-production"],
      env({ APP_ENV: "production" }),
      { clock: clock() },
    );

    expect(hasil.output).not.toContain("perlu --izinkan-production");
  });
});
