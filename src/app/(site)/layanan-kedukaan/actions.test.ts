import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { ajukanKedukaanSaya } from "./actions";
import { draftKosong, type DraftKedukaan } from "./draft";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const mobil: DraftKedukaan = {
  ...draftKosong("mobil_jenazah"),
  nama: "Siti Aminah",
  telepon: "0812 3456 7890",
  kabKota: "Kota Bekasi",
  asal: "RSUD Bekasi",
  tujuan: "Graha Sentosa",
  tanggal: "2026-11-02",
};

describe("Permintaan Kedukaan dari halaman Layanan Kedukaan", () => {
  it("meminta Kode Masuk lebih dulu bila pengunjung belum masuk, tanpa mencatat apa pun", async () => {
    expect(await ajukanKedukaanSaya(mobil)).toEqual({ status: "perlu_kode_masuk" });
  });

  it("keluarga yang sudah masuk mengirim permintaan Mobil Jenazah: Diajukan dengan nomor, tampil di Akun Saya", async () => {
    const akun = await server.logIn("keluarga@contoh.id");
    browser.store(akun.session.cookies);

    const hasil = await ajukanKedukaanSaya(mobil);

    expect(hasil).toMatchObject({ status: "selesai", nomor: expect.stringMatching(/^KDK-\d{4}-\d{6}$/) });
    const saya = await server.runtime().kedukaan.milikSaya(akun.account.id);
    expect(saya.map((satu) => [satu.jenis, satu.status, satu.rincian])).toEqual([
      ["mobil_jenazah", "diajukan", { asal: "RSUD Bekasi", tujuan: "Graha Sentosa", tanggal: "2026-11-02" }],
    ]);
  });

  it("Konsultasi Rencana Pemakaman hanya membawa waktu dihubungi dan lokasi diminati", async () => {
    const akun = await server.logIn("keluarga@contoh.id");
    browser.store(akun.session.cookies);

    const hasil = await ajukanKedukaanSaya({ ...draftKosong("konsultasi"), nama: "Budi", telepon: "081298765432", kabKota: "Kota Bekasi", waktuDihubungi: "sore", lokasiDiminati: "Graha Sentosa" });

    expect(hasil.status).toBe("selesai");
    const [satu] = await server.runtime().kedukaan.milikSaya(akun.account.id);
    expect(satu?.rincian).toEqual({ waktuDihubungi: "sore", lokasiDiminati: "Graha Sentosa" });
  });

  it("menolak isian yang kurang dengan pesan", async () => {
    const akun = await server.logIn("keluarga@contoh.id");
    browser.store(akun.session.cookies);

    expect(await ajukanKedukaanSaya({ ...mobil, tujuan: "" })).toMatchObject({ status: "gagal", message: expect.stringContaining("Periksa lagi") });
    expect(await ajukanKedukaanSaya({ ...mobil, telepon: "12" })).toMatchObject({ status: "gagal", message: expect.stringContaining("Nomor telepon") });
  });
});
