import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../../../tests/support/server-sign-in";
import { adminPlatformBeranda } from "./beranda";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

describe("the Admin Platform Beranda", () => {
  it("counts Lokasi Mitra by status", async () => {
    const admin = await signInAsAdminPlatform(server);
    for (const name of ["Makam Wakaf Al-Ikhlas", "TPU Keluarga Sentosa"]) {
      const created = await server.runtime().lokasi.createLokasiMitra(admin, {
        name,
        pengelolaName: "Yayasan",
        address: "Jl. Raya No. 1",
        city: "Kota Jakarta Timur",
      });
      if (!created.ok) throw new Error(created.reason);
    }

    expect((await adminPlatformBeranda()).lokasiMitra).toEqual({
      belum_tayang: 2,
      terverifikasi: 0,
      ditangguhkan: 0,
      berhenti: 0,
    });
  });

  it("counts Akun Staf still active and Undangan Staf not yet accepted", async () => {
    const admin = await signInAsAdminPlatform(server);
    const { identity } = server.runtime();
    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "petugas@contoh.id", role: "petugas_lapangan" });
    await identity.inviteStaff(admin, { phoneNumber: "083333333333", email: "mitra@contoh.id", role: "mitra_jasa" });
    await identity.inviteStaff(admin, { phoneNumber: "084444444444", email: "lama@contoh.id", role: "mitra_jasa" });
    await server.logIn("082222222222");
    const former = (await server.logIn("084444444444")).account;
    const deactivated = await identity.deactivateStaff(admin, { accountId: former.id, reason: "Tidak lagi bekerja sama" });
    if (!deactivated.ok) throw new Error(deactivated.reason);

    expect((await adminPlatformBeranda()).staf).toEqual({ aktif: 2, undanganTerbuka: 1 });
  });

  it("names the next Hari Libur Nasional (the rule itself is tested in the Lokasi module)", async () => {
    const admin = await signInAsAdminPlatform(server);
    expect((await adminPlatformBeranda()).hariLiburBerikutnya).toBeNull();

    // The fake clock stands at 1 October 2026, 09:00 WIB.
    await server.runtime().lokasi.addHariLiburNasional(admin, { date: "2026-12-25", name: "Hari Raya Natal" });
    expect((await adminPlatformBeranda()).hariLiburBerikutnya).toEqual({ date: "2026-12-25", name: "Hari Raya Natal" });
  });

  it("says whether Pengaturan Operator has been filled in", async () => {
    const admin = await signInAsAdminPlatform(server);
    expect((await adminPlatformBeranda()).pengaturanOperatorDiisi).toBe(false);

    const changed = await server.runtime().operatorSettings.change(admin, {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "081234567890",
      csReplyHours: "Dibalas setiap hari pukul 08.00–20.00 WIB",
      reason: null,
    });
    if (!changed.ok) throw new Error(changed.reason);
    expect((await adminPlatformBeranda()).pengaturanOperatorDiisi).toBe(true);
  });
});
