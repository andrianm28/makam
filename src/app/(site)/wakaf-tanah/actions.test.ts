import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { ajukanWakafSaya } from "./actions";
import type { DraftWakaf } from "./draft";

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

const draft: DraftWakaf = {
  tujuan: "sosial",
  namaKeluarga: "",
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12",
  lat: "-6.4",
  lng: "106.82",
  luasM2: "1500",
  jenisBukti: "SHM",
  nazhirId: "",
  nazhirNama: "",
};

describe("Pengajuan Wakaf di halaman Wakaf Tanah", () => {
  it("meminta Kode Masuk lebih dulu bila pengunjung belum masuk, tanpa mencatat apa pun", async () => {
    expect(await ajukanWakafSaya(draft)).toEqual({ status: "perlu_kode_masuk" });
  });

  it("Wakif yang sudah masuk mengajukan: Pengajuan Diajukan muncul di Wakaf tab-nya dengan nomor", async () => {
    const akun = await server.logIn("wakif@contoh.id");
    browser.store(akun.session.cookies);

    const hasil = await ajukanWakafSaya(draft);

    expect(hasil).toMatchObject({ status: "selesai", nomor: expect.stringMatching(/^WKF-\d{4}-\d{6}$/) });
    const saya = await server.runtime().wakaf.pengajuanSaya({ accountId: akun.account.id, email: "wakif@contoh.id" });
    expect(saya.map((satu) => satu.status)).toEqual(["diajukan"]);
  });

  it("di luar Jabodetabek langsung Dirujuk dan Wakif diberi petunjuk KUA/BWI", async () => {
    const akun = await server.logIn("wakif@contoh.id");
    browser.store(akun.session.cookies);

    const hasil = await ajukanWakafSaya({ ...draft, kabKota: "Kabupaten Sleman" });

    expect(hasil).toMatchObject({ status: "dirujuk", petunjuk: expect.stringContaining("KUA") });
  });

  it("menolak isian yang tidak lengkap dengan pesan", async () => {
    const akun = await server.logIn("wakif@contoh.id");
    browser.store(akun.session.cookies);

    expect(await ajukanWakafSaya({ ...draft, luasM2: "abc" })).toEqual({ status: "gagal", message: "Periksa lagi isian Anda." });
  });
});
