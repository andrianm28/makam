/**
 * The Admin Lokasi's two actions on a further burial (ticket 35): log the Pemegang Hak's verbal consent or heirship
 * proof, and confirm once the consent is settled.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeFileStore } from "@/adapters/memory";
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
const PDF = new TextEncoder().encode("%PDF-1.7\nsurat keterangan ahli waris\n%%EOF\n");
const suratWaris = () => new File([PDF], "surat-waris.pdf", { type: "application/pdf" });
const fileStore = () => server.runtime().adapters.files as FakeFileStore;
function form(values: Record<string, string | File>): FormData {
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
    await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "ahli_waris", catatan: "Surat waris dibawa keluarga", bukti: suratWaris() }));
    expect((await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({
      konsen: { state: "disetujui", via: "ahli_waris", catatan: "Surat waris dibawa keluarga" },
      gantiPemegangHakDiingatkan: true,
    });
  });

  it("an heirship proof is logged with its file: the file goes to the private FileStore only, and the order shows that a proof is on file (ticket 125)", async () => {
    const { f, lokasiId, nomor } = await permintaanTanpaEmail();
    const sebelum = new Set(fileStore().stored.keys());

    expect(await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "ahli_waris", catatan: "Surat waris dibawa keluarga", bukti: suratWaris() }))).toEqual({
      status: "berhasil",
      message: "Persetujuan Pemegang Hak dicatat.",
    });

    const baru = [...fileStore().stored.entries()].filter(([kunci]) => !sebelum.has(kunci));
    expect(baru).toHaveLength(1);
    expect(baru[0]![1]).toMatchObject({ contentType: "application/pdf", body: PDF });
    expect((await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({
      konsen: { state: "disetujui", via: "ahli_waris" },
      buktiAhliWarisAda: true,
    });
    const konsen = (await server.runtime().audit.entriesForLokasi(lokasiId)).filter((entri) => entri.action === "pemesanan.konsen_tumpang");
    expect(konsen).toMatchObject([{ after: { via: "ahli_waris", buktiAda: true } }]);
    // The key is never in the Audit Log.
    expect(JSON.stringify(konsen)).not.toContain(baru[0]![0]);
  });

  it("refuses an heirship proof without its file, says what to upload, and keeps the consent open (ticket 125)", async () => {
    const { f, lokasiId, nomor } = await permintaanTanpaEmail();
    const sebelum = fileStore().stored.size;

    const hasil = await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "ahli_waris", catatan: "Surat waris dibawa keluarga" }));

    expect(hasil).toEqual({ status: "gagal", message: "Unggah bukti ahli waris (foto JPG atau PNG, atau PDF) untuk mencatat persetujuan ahli waris." });
    expect(fileStore().stored.size).toBe(sebelum);
    expect((await server.runtime().pemesanan.orderUntukStaf(f.lokasi.adminLokasi, nomor))?.tumpang).toMatchObject({
      konsen: { state: "menunggu_lokasi" },
      buktiAhliWarisAda: false,
    });
  });

  it("refuses a file that is not a PDF, JPG or PNG, and a file sent with a verbal consent, storing neither (ticket 125)", async () => {
    const { lokasiId, nomor } = await permintaanTanpaEmail();
    const sebelum = fileStore().stored.size;
    const teks = new File([new TextEncoder().encode("bukan pdf, hanya teks")], "waris.pdf", { type: "application/pdf" });

    expect(await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "ahli_waris", catatan: "Surat waris", bukti: teks }))).toEqual({
      status: "gagal",
      message: "Bukti ahli waris harus foto JPG atau PNG, atau PDF (isi berkas diperiksa), paling besar 10 MB.",
    });
    expect(await catatKonsenTumpangAction(idle, form({ lokasiId, nomor, via: "verbal", catatan: "Lewat telepon", bukti: suratWaris() }))).toEqual({
      status: "gagal",
      message: "Berkas hanya untuk bukti ahli waris. Pilih bukti ahli waris, atau kosongkan berkas untuk persetujuan lisan.",
    });
    expect(fileStore().stored.size).toBe(sebelum);
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
