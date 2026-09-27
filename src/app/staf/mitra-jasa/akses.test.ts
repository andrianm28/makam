/**
 * AC 6 at the server seam: a Mitra Jasa is staff, so it has a session and can
 * reach staff pages — and it must never reach a family document, a family order,
 * a Hak Pakai, or the Audit Log (spec, Identity & Access: "Mitra Jasa and
 * Petugas Lapangan see no audit log"; ticket 55).
 *
 * The refusals are proved where they happen: through the real session cookie and
 * the real Server Actions, and through the modules' own reads as that actor. No
 * DOM, no hidden column — a read that answers is a breach whether or not the page
 * shows it.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../../../tests/support/server-sign-in";
import { orderSaatDuka, saatDukaFixture, type PemesananModul } from "../../../../tests/support/pemesanan";
import type { Actor } from "@/domain/identity";
import { buatMitraJasa, simpanCoverage, simpanProfil, simpanRekening, simpanStatus, tambahTidakTersedia } from "../admin-platform/mitra-jasa/actions";

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

/** The documents a family scans of a paper, as the wizard's upload sends them. */
const ktp = { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const idle = { status: "idle" } as const;

/** A Mitra Jasa signed in in this browser, having accepted the Undangan Staf. */
async function signInAsMitraJasa(admin: Actor, email = "mitra.jasa@contoh.id"): Promise<Actor> {
  const { identity } = server.runtime();
  const invited = await identity.inviteStaff(admin, { email, phoneNumber: "085555555555", role: "mitra_jasa" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  browser.reset();
  browser.store((await server.logIn(email)).session.cookies);
  const actor = await identity.actorFromCookies(browser.cookieHeader());
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** The server's own modules, as the Pemesanan fixtures read them. */
function pemesananSetup(): PemesananModul {
  const runtime = server.runtime();
  return { ...runtime, clock: server.clock, email: server.email() } as unknown as PemesananModul;
}

describe("a Mitra Jasa never reaches a family's document, an order, or the Audit Log", () => {
  it("is refused every staff read of them, and the Antrean, as itself", async () => {
    const setup = pemesananSetup();
    // A Lokasi Mitra with a family order on it, and a family document on that order.
    const fixture = await saatDukaFixture(setup);
    const admin = fixture.admin;
    const checklist = await setup.lokasi.documentChecklistOf(fixture.lokasiMitra.id);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const nama = checklist[0]!;
    const diunggah = await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: placed.pemesanan.nomor, nama, file: ktp });
    if (!diunggah.ok) throw new Error(`document refused: ${diunggah.reason}`);
    // The Admin Platform sees it all, so each refusal below is about the role and not about there being nothing there.
    expect(await setup.pemesanan.urlDokumenUntukStaf(admin, placed.pemesanan.nomor, nama)).toContain("http");
    expect((await setup.lokasi.auditLog(admin, fixture.lokasiMitra.id)).ok).toBe(true);

    const mitra = await signInAsMitraJasa(admin);
    const { pemesanan, lokasi, queues, layanan } = server.runtime();

    // A family document: no signed URL, ever.
    expect(await pemesanan.urlDokumenUntukStaf(mitra, placed.pemesanan.nomor, nama)).toBeNull();
    // The order itself, with the family's own details.
    expect(await pemesanan.orderUntukStaf(mitra, placed.pemesanan.nomor)).toBeNull();
    // The Audit Log, whole or per Lokasi Mitra.
    expect(await lokasi.auditLog(mitra, fixture.lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await lokasi.fullAuditLog(mitra, fixture.lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    // The Antrean and its Catatan Internal, where the family's work waits.
    expect(await queues.antrean(mitra)).toEqual([]);
    expect(await queues.catatanInternal(mitra, "pemesanan", placed.pemesanan.nomor)).toEqual([]);
    // The Akun Staf roster and every other Mitra Jasa.
    expect(await layanan.semuaMitraJasa(mitra)).toEqual([]);
    expect(await layanan.skorSaya(mitra)).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("is refused every Server Action of the Mitra Jasa screens, keeping the record as it was", async () => {
    const admin = await signInAsAdminPlatform(server);
    const dibuat = await server.runtime().layanan.buatMitraJasa(admin, "mitra.jasa@contoh.id", {
      namaLengkap: "Siti Rahayu",
      nik: "3201014503900001",
      area: "Jakarta Timur",
      kontakSiagaNama: null,
      kontakSiagaTelepon: null,
    });
    if (!dibuat.ok) throw new Error(dibuat.reason);
    const mitraJasaId = dibuat.mitraJasaId;

    await signInAsMitraJasa(admin);

    expect(await simpanProfil(idle, form({ mitraJasaId, namaLengkap: "Orang Lain", nik: "3201014503900001", area: "Bekasi" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });
    expect(
      await simpanRekening(idle, form({ mitraJasaId, bankName: "BSI", accountNumber: "7123456789", accountHolder: "Orang Lain" })),
    ).toMatchObject({ status: "gagal" });
    expect(await simpanCoverage(idle, form({ mitraJasaId, tpuDkiIds: "", layananVariantIds: "" }))).toMatchObject({ status: "gagal" });
    expect(await simpanStatus(idle, form({ mitraJasaId, status: "ditangguhkan", alasan: "Sengaja" }))).toMatchObject({ status: "gagal" });
    expect(await buatMitraJasa(idle, form({ email: "lain@contoh.id", nomorTelepon: "081234567890", namaLengkap: "Orang Lain", nik: "3201014503900002", area: "Bekasi" }))).toMatchObject({
      status: "gagal",
    });

    // The one action a Mitra Jasa does own still works, and it touched nothing of Admin Platform's.
    const rentang = await tambahTidakTersedia(idle, form({ dari: "2026-10-03", sampai: "2026-10-07", alasan: "Kota Elsewhere" }));
    expect(rentang).toEqual({ status: "berhasil", message: "Rentang Tidak tersedia disimpan." });

    const dibaca = await server.runtime().layanan.bacaMitraJasa(admin, mitraJasaId);
    if (!dibaca.ok) throw new Error(dibaca.reason);
    expect(dibaca.mitraJasa).toMatchObject({ namaLengkap: "Siti Rahayu", area: "Jakarta Timur", status: "aktif", rekening: null });
    expect(await server.runtime().layanan.semuaMitraJasa(admin)).toHaveLength(1);
  });
});
