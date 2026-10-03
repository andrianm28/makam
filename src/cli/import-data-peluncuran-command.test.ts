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
    expect(hasil.output).toContain("TPU DKI: 1 baris dibaca, 1 akan dibuat, 0 diubah, 0 sama, 0 ditolak.");
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
});
