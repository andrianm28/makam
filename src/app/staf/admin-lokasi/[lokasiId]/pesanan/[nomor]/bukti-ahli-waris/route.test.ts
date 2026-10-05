/**
 * Opening the heirship proof of a further burial (ticket 125): a short-lived signed link, only for the staff who may see the order.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeFileStore } from "@/adapters/memory";
import { resetDatabase, testDatabase } from "../../../../../../../../tests/support/database";
import { browser } from "../../../../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi } from "../../../../../../../../tests/support/server-sign-in";
import type { PemesananSetup } from "../../../../../../../../tests/support/pemesanan";
import { hakPakaiDenganPemegang } from "../../../../../../../../tests/support/tumpang";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const PDF = new TextEncoder().encode("%PDF-1.7\nsurat keterangan ahli waris\n%%EOF\n");

/** A further burial for a grave whose holder has no email, its Lokasi's Admin Lokasi signed in, and the consent logged as an heirship proof (or verbally). */
async function tumpangDenganKonsen(via: "ahli_waris" | "verbal") {
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
  const adminLokasi = await signInAsAdminLokasi(server, f.lokasi.admin, lokasiId);
  const dicatat = await rt.pemesanan.catatKonsenTumpang(adminLokasi, {
    nomor: placed.pesanan.nomor,
    via,
    catatan: "Dicatat untuk uji",
    ...(via === "ahli_waris" ? { bukti: { body: PDF, contentType: "application/pdf" } } : {}),
  });
  if (!dicatat.ok) throw new Error(dicatat.reason);
  return { f, lokasiId, nomor: placed.pesanan.nomor };
}

const open = (lokasiId: string, nomor: string) =>
  GET(new Request(`http://localhost/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}/bukti-ahli-waris`), {
    params: Promise.resolve({ lokasiId, nomor }),
  });

describe("GET /staf/admin-lokasi/<id>/pesanan/<nomor>/bukti-ahli-waris (the heirship proof)", () => {
  it("sends that Lokasi's own Admin Lokasi on to the proof's signed link (303, not cached); the file itself never passes through", async () => {
    const { lokasiId, nomor } = await tumpangDenganKonsen("ahli_waris");

    const response = await open(lokasiId, nomor);

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const files = server.runtime().adapters.files as FakeFileStore;
    expect(files.open(response.headers.get("location")!)).toMatchObject({ body: PDF, contentType: "application/pdf" });
    expect(await response.text()).toBe("");
  });

  it("refuses another Lokasi Mitra's Admin Lokasi (403) and a caller who is not signed in (401), with no link", async () => {
    const { f, lokasiId, nomor } = await tumpangDenganKonsen("ahli_waris");
    const lain = await server.runtime().lokasi.createLokasiMitra(f.lokasi.admin, {
      name: "Makam Sawah Besar",
      pengelolaName: "Yayasan Sawah Besar",
      address: "Jl. Sawah Besar No. 2",
      city: "Kabupaten Bekasi",
    });
    if (!lain.ok) throw new Error(lain.reason);
    await signInAsAdminLokasi(server, f.lokasi.admin, lain.lokasiMitra.id, "lain@contoh.id");

    const asLain = await open(lokasiId, nomor);
    browser.reset();
    const signedOut = await open(lokasiId, nomor);

    expect(asLain.status).toBe(403);
    expect(asLain.headers.get("location")).toBeNull();
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers.get("location")).toBeNull();
  });

  it("finds nothing for a consent with no proof, for an order that is not there, and for a Nomor Pemesanan that is no Nomor", async () => {
    const { lokasiId, nomor } = await tumpangDenganKonsen("verbal");

    expect((await open(lokasiId, nomor)).status).toBe(404);
    expect((await open(lokasiId, "MKM-2026-999999")).status).toBe(404);
    expect((await open(lokasiId, "bukan-nomor")).status).toBe(404);
  });
});
