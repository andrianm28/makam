/**
 * The Pemegang Hak answers Setujui / Tolak under Perlu tindakan (ticket 35, owner 2026-10-02): signed in with the
 * usual Kode Masuk, with no code of its own.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../../tests/support/server-runtime";
import { hakPakaiDenganPemegang } from "../../../../../../tests/support/tumpang";
import type { PemesananSetup } from "../../../../../../tests/support/pemesanan";
import { jawabKonsenAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../tests/support/next-request"));
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

/** A further burial asked by one family for a grave held by `pemegang@contoh.id`, waiting for the holder. */
async function permintaan() {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as unknown as PemesananSetup;
  const f = await hakPakaiDenganPemegang(setup, { name: "Siti Aminah", phoneNumber: "081200000001", email: "pemegang@contoh.id" });
  const keluarga = await server.logIn("keluarga@contoh.id");
  const pemegang = await server.logIn("pemegang@contoh.id");
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
  return { f, keluarga, pemegang, nomor: placed.pesanan.nomor };
}

describe("jawabKonsenAction (Server Action)", () => {
  it("needs a signed-in Akun, and only the Akun of the recorded holder email may answer", async () => {
    const { keluarga, nomor } = await permintaan();
    expect(await jawabKonsenAction(idle, form({ nomor, jawaban: "setuju" }))).toMatchObject({ status: "gagal", message: "Silakan masuk lagi." });
    browser.reset();
    browser.store(keluarga.session.cookies);
    expect(await jawabKonsenAction(idle, form({ nomor, jawaban: "setuju" }))).toMatchObject({ status: "gagal" });
  });

  it("Setujui leaves the order for the Lokasi, and the request leaves Perlu tindakan", async () => {
    const { f, pemegang, nomor } = await permintaan();
    browser.reset();
    browser.store(pemegang.session.cookies);
    expect(await jawabKonsenAction(idle, form({ nomor, jawaban: "setuju" }))).toEqual({ status: "berhasil", message: "Terima kasih, persetujuan Anda tercatat." });
    const rt = server.runtime();
    expect((await rt.pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor))?.tumpang?.konsen.state).toBe("disetujui");
    expect(await rt.pemesanan.konsenMenungguSaya({ accountId: pemegang.account.id })).toEqual([]);
  });

  it("Tolak ends the order Ditolak with the fixed reason", async () => {
    const { f, pemegang, nomor } = await permintaan();
    browser.reset();
    browser.store(pemegang.session.cookies);
    expect(await jawabKonsenAction(idle, form({ nomor, jawaban: "tolak" }))).toEqual({ status: "berhasil", message: "Permintaan ditolak." });
    expect(await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor)).toMatchObject({ status: "ditolak", alasan: "Pemegang Hak tidak menyetujui" });
  });
});
