import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
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
  return { ...test, admin };
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
