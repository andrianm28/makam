import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { batalkanWakafSaya } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const idle = { status: "idle" } as const;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("Akun Saya, tab Wakaf: Wakif membatalkan Pengajuan", () => {
  it("membatalkan sebelum Menunggu Ikrar; Pengajuan orang lain tidak bisa dibatalkan", async () => {
    const saya = await server.logIn("wakif@contoh.id");
    const lain = await server.logIn("lain@contoh.id");
    const { wakaf } = server.runtime();
    const dibuat = await wakaf.ajukanWakaf(
      { accountId: saya.account.id, email: "wakif@contoh.id" },
      {
        tujuan: "sosial",
        wakifNama: "Haji Slamet",
        wakifTelepon: "0812 3456 7890",
        hubunganDenganTanah: "Pemilik",
        kabKota: "Kota Depok",
        alamat: "Jl. Raya Sawangan No. 12",
        pin: null,
        luasM2: 1500,
        jenisBukti: "SHM",
      },
    );
    if (!dibuat.ok) throw new Error(dibuat.reason);

    browser.store(lain.session.cookies);
    expect((await batalkanWakafSaya(idle, form({ pengajuanId: dibuat.pengajuanId }))).status).toBe("gagal");

    browser.reset();
    browser.store(saya.session.cookies);
    expect(await batalkanWakafSaya(idle, form({ pengajuanId: dibuat.pengajuanId }))).toEqual({ status: "berhasil", message: "Pengajuan dibatalkan." });
    const sesudah = await wakaf.pengajuanSaya({ accountId: saya.account.id, email: "wakif@contoh.id" });
    expect(sesudah[0]?.status).toBe("dibatalkan");
  });
});
