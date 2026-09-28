import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../../../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../../../../../tests/support/database";
import { browser } from "../../../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../../../tests/support/server-sign-in";
import { catatPembayaranLangsung } from "./actions";

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
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A Lokasi Mitra, its own Admin Lokasi signed in, and a Saat Duka Tagihan for it. */
async function lokasiWithTagihan() {
  const admin = await signInAsAdminPlatform(server);
  const { operatorSettings, billing, lokasi } = server.runtime();
  await operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  const created = await lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  const lokasiId = created.lokasiMitra.id;
  const issued = await billing.issueTagihan({
    moment: { kind: "saat_duka", burialAt: wib("2026-10-01 14:00"), paymentWindowHours: 72 },
    addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: created.lokasiMitra.name,
    lines: [
      {
        kind: "harga_hak_pakai",
        label: "Harga Hak Pakai",
        amount: 5_000_000 as Rupiah,
        provider: { kind: "lokasi_mitra", lokasiId, name: created.lokasiMitra.name },
      },
    ],
  });
  if (!issued.ok) throw new Error(issued.reason);
  const adminLokasi = await signInAsAdminLokasi(server, admin, lokasiId);
  return { admin, adminLokasi, lokasiId, tagihan: issued.tagihan };
}

describe("catatPembayaranLangsung (Server Action, ticket 30's AC 2)", () => {
  it("the Tagihan's own Admin Lokasi records a direct payment with a proof file: the Tagihan becomes Lunas", async () => {
    const { lokasiId, tagihan } = await lokasiWithTagihan();

    const result = await catatPembayaranLangsung(
      idle,
      form({ lokasiId, nomor: "MKM-2026-000001", tagihanId: tagihan.id, bukti: new File([jpeg], "bukti.jpg", { type: "image/jpeg" }) }),
    );

    expect(result.status).toBe("berhasil");
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("refused without a proof file, and nothing is settled", async () => {
    const { lokasiId, tagihan } = await lokasiWithTagihan();

    const result = await catatPembayaranLangsung(idle, form({ lokasiId, nomor: "MKM-2026-000001", tagihanId: tagihan.id }));

    expect(result.status).toBe("gagal");
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("another Lokasi Mitra's Admin Lokasi is refused", async () => {
    const { admin, lokasiId, tagihan } = await lokasiWithTagihan();
    const other = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Lain",
      pengelolaName: "Yayasan Lain",
      address: "Jl. Lain No. 2",
      city: "Kota Jakarta Timur",
    });
    if (!other.ok) throw new Error(other.reason);
    await signInAsAdminLokasi(server, admin, other.lokasiMitra.id, "lokasi-lain@contoh.id");

    const result = await catatPembayaranLangsung(
      idle,
      form({ lokasiId, nomor: "MKM-2026-000001", tagihanId: tagihan.id, bukti: new File([jpeg], "bukti.jpg", { type: "image/jpeg" }) }),
    );

    expect(result).toEqual({ status: "gagal", message: "Anda tidak berwenang melakukan ini." });
  });
});
