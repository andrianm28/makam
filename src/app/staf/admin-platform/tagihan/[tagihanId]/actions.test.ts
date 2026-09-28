import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../../../../tests/support/database";
import { browser } from "../../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../../tests/support/server-sign-in";
import { batalkanPembayaranLangsungAction, catatPembayaranManualAction, tetapkanHargaKhususAction } from "./actions";

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
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** Admin Platform, signed in, with a Terencana Tagihan carrying a Lokasi Mitra tariff line. */
async function signedInWithTagihan(lokasiId = "7a0c5a52-0000-4000-8000-000000000001") {
  const admin = await signInAsAdminPlatform(server);
  const { operatorSettings, billing } = server.runtime();
  await operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  const issued = await billing.issueTagihan({
    moment: { kind: "terencana", holdExpiresAt: wib("2026-10-03 09:00") },
    addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: "Makam Wakaf Al-Ikhlas",
    lines: [
      { kind: "harga_hak_pakai", label: "Harga Hak Pakai", amount: 5_000_000 as Rupiah, provider: { kind: "lokasi_mitra", lokasiId, name: "Makam Wakaf Al-Ikhlas" } },
      { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: 150_000 as Rupiah, provider: { kind: "operator" } },
    ],
  });
  if (!issued.ok) throw new Error(issued.reason);
  return { admin, tagihan: issued.tagihan };
}

describe("Tagihan Server Actions (ticket 30)", () => {
  it("Catat pembayaran manual: Admin Platform marks the Tagihan Lunas with a proof file", async () => {
    const { tagihan } = await signedInWithTagihan();

    const result = await catatPembayaranManualAction(
      idle,
      form({ tagihanId: tagihan.id, metode: "tunai", bukti: new File([jpeg], "bukti.jpg", { type: "image/jpeg" }) }),
    );

    expect(result.status).toBe("berhasil");
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("Catat pembayaran manual: refused without a proof file, and nothing is settled", async () => {
    const { tagihan } = await signedInWithTagihan();

    const result = await catatPembayaranManualAction(idle, form({ tagihanId: tagihan.id, metode: "tunai" }));

    expect(result.status).toBe("gagal");
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("Catat pembayaran manual: an Admin Lokasi is refused — only Admin Platform records this", async () => {
    const { admin, tagihan } = await signedInWithTagihan();
    const created = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!created.ok) throw new Error(created.reason);
    await signInAsAdminLokasi(server, admin, created.lokasiMitra.id);

    const result = await catatPembayaranManualAction(
      idle,
      form({ tagihanId: tagihan.id, metode: "tunai", bukti: new File([jpeg], "bukti.jpg", { type: "image/jpeg" }) }),
    );

    expect(result).toEqual({ status: "gagal", message: "Anda tidak berwenang melakukan ini." });
  });

  it("Tetapkan Harga Khusus: Admin Platform reissues the Tagihan with a negative line and a reason", async () => {
    const { tagihan } = await signedInWithTagihan();

    const result = await tetapkanHargaKhususAction(idle, form({ tagihanId: tagihan.id, amount: "500000", alasan: "Keluarga kurang mampu" }));

    expect(result.status).toBe("berhasil");
    const reissued = await server.runtime().billing.tagihan(tagihan.id);
    expect(reissued).toMatchObject({ status: "dibatalkan", cancelledReason: "diganti" });
  });

  it("Tetapkan Harga Khusus: a reason is required", async () => {
    const { tagihan } = await signedInWithTagihan();

    const result = await tetapkanHargaKhususAction(idle, form({ tagihanId: tagihan.id, amount: "500000", alasan: "" }));

    expect(result.status).toBe("gagal");
  });

  it("Batalkan pembayaran langsung: reverses a direct payment; refused when the Tagihan was not paid that way", async () => {
    const { tagihan } = await signedInWithTagihan();

    const notDirect = await batalkanPembayaranLangsungAction(idle, form({ tagihanId: tagihan.id }));
    expect(notDirect).toEqual({ status: "gagal", message: "Tagihan ini belum ada pembayaran yang tercatat sama sekali." });

    await server.runtime().billing.recordPayment(tagihan.id, { method: { kind: "langsung_ke_lokasi", lokasiName: "Makam Wakaf Al-Ikhlas" }, reference: null });
    const reversed = await batalkanPembayaranLangsungAction(idle, form({ tagihanId: tagihan.id }));
    expect(reversed.status).toBe("berhasil");
  });
});
