/**
 * The Admin Lokasi's two actions on a further burial (ticket 35): log the Pemegang Hak's verbal consent or heirship
 * proof, and confirm once the consent is settled.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase, testDatabase } from "../../../../../../../tests/support/database";
import { browser } from "../../../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi } from "../../../../../../../tests/support/server-sign-in";
import { hakPakaiDenganPemegang } from "../../../../../../../tests/support/tumpang";
import type { PemesananSetup } from "../../../../../../../tests/support/pemesanan";
import { catatKonsenTumpangAction, konfirmasiTumpangAction } from "./tumpang-actions";
import { tolakPesanan } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../../tests/support/next-request"));
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

/** A grave whose holder has no recorded email, a further burial asked for it, and the Lokasi's own Admin Lokasi signed in. */
async function permintaanTanpaEmail() {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as unknown as PemesananSetup;
  const f = await hakPakaiDenganPemegang(setup, { name: "Siti Aminah", phoneNumber: "081200000001" });
  const keluarga = await server.logIn("keluarga@contoh.id");
  const placed = await rt.pemesanan.ajukanTumpang({
    pemesanAccountId: keluarga.account.id,
    pemesanEmail: "keluarga@contoh.id",
    pemesanName: "Rina Wulandari",
    phoneNumber: "081234567890",
    lokasiId: f.lokasi.lokasiMitra.id,
    hakPakaiId: f.hakPakaiId,
    jenis: "tumpang",
    almarhumName: "Budi Santoso",
    tanggalWafat: "2026-09-30",
  });
  if (!placed.ok) throw new Error(placed.reason);
  const lokasiId = f.lokasi.lokasiMitra.id;
  await signInAsAdminLokasi(server, f.lokasi.admin, lokasiId);
  return { f, lokasiId, nomor: placed.pesanan.nomor };
}

describe("catatKonsenTumpangAction and konfirmasiTumpangAction (Server Actions)", () => {
  it("confirming is refused until the consent is logged, then issues the pay-after Tagihan", async () => {
    const { f, lokasiId, nomor } = await permintaanTanpaEmail();
    expect(await konfirmasiTumpangAction(idle, form({ lokasiId, nomor, pemakamanAt: "2026-10-02T10:00" }))).toEqual({
      status: "gagal",
      message: "Persetujuan Pemegang Hak belum selesai.",
    });
    expect(await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "verbal", catatan: "Lewat telepon" }))).toEqual({
      status: "berhasil",
      message: "Persetujuan Pemegang Hak dicatat.",
    });
    expect(await konfirmasiTumpangAction(idle, form({ lokasiId, nomor, pemakamanAt: "2026-10-02T10:00" }))).toMatchObject({ status: "berhasil" });
    expect(await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor)).toMatchObject({ status: "dikonfirmasi" });
  });

  it("an heirship proof is logged with its note and raises the Ganti Pemegang Hak reminder", async () => {
    const { f, lokasiId, nomor } = await permintaanTanpaEmail();
    await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "ahli_waris", catatan: "Surat waris dibawa keluarga" }));
    expect((await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({
      konsen: { state: "disetujui", via: "ahli_waris", catatan: "Surat waris dibawa keluarga" },
      gantiPemegangHakDiingatkan: true,
    });
  });

  it("is refused for anyone who is not signed in as that Lokasi's Admin Lokasi", async () => {
    const { lokasiId, nomor } = await permintaanTanpaEmail();
    browser.reset();
    expect((await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "verbal", catatan: "x" }))).status).toBe("gagal");
    expect((await konfirmasiTumpangAction(idle, form({ lokasiId, nomor, pemakamanAt: "2026-10-02T10:00" }))).status).toBe("gagal");
  });

  it("the Admin Lokasi can Tolak a further burial with a reason off the fixed list", async () => {
    const { f, lokasiId, nomor } = await permintaanTanpaEmail();
    expect((await tolakPesanan(idle, form({ lokasiId, nomor, alasan: "di_luar_wilayah" }))).status).toBe("berhasil");
    expect(await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor)).toMatchObject({ status: "ditolak" });
  });
});
