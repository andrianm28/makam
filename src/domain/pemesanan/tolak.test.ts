/**
 * A Saat Duka order the Admin Lokasi cannot serve: the Tolak with a reason from
 * a fixed list, and what a Tolak sets off (spec, Pemesanan > Saat Duka: "Tawarkan
 * alternatif … and Tolak with a fixed reason list"; story 118; ticket 24's AC 1,
 * 4 and 7). The alternative itself and the rebook link are their own tests; the
 * Tier 1 call a Tolak opens is tested with the Antrean that shows it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import type { TolakSaatDukaInput } from "./tolak";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One placed Saat Duka order, waiting for its Lokasi's confirmation. */
async function pesananMenunggu(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor };
}

describe("the Admin Lokasi declines a Saat Duka order (Tolak)", () => {
  it("makes the order Ditolak with the reason from the fixed list, and counts the decline on the Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    expect(await setup.pemesanan.ditolak(fixture.lokasiMitra.id)).toBe(0);
    const hasil = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: fixture.nomor, alasan: "petak_tidak_tersedia" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "ditolak", alasan: "petak_tidak_tersedia" } });
    // The order page says the reason in the wording of the list, not as a code.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({
      status: "ditolak",
      alasan: "Petak untuk jenis makam ini sudah tidak tersedia",
    });
    expect(await setup.pemesanan.ditolak(fixture.lokasiMitra.id)).toBe(1);
    // Another Lokasi Mitra's declines are its own count.
    expect(await setup.pemesanan.ditolak(lain.lokasiMitra.id)).toBe(0);

    // The order's own work rows close themselves: a declined order is no longer `diajukan`.
    expect(await setup.pemesanan.antreanKonfirmasi(fixture.lokasiMitra.id)).toEqual([]);
    expect(await setup.pemesanan.orderUntukStafTerbaru(fixture.adminLokasi, fixture.lokasiMitra.id)).toEqual([]);
  });

  it("takes the reason only from the closed list, and only that Lokasi's own Admin Lokasi may decline", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    // Free text is not a reason, however the Admin Lokasi words it. The cast is
    // the point: the list is closed at compile time as well as at run time, so a
    // screen cannot offer it either, and a caller that reaches past both is refused.
    expect(
      await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, {
        nomor: fixture.nomor,
        alasan: "sibuk" as unknown as TolakSaatDukaInput["alasan"],
      }),
    ).toEqual({ ok: false, reason: "input_tidak_valid" });
    // Admin Platform may only chase the Lokasi by phone, never answer for it.
    expect(
      await setup.pemesanan.tolakSaatDuka(fixture.admin, { nomor: fixture.nomor, alasan: "petak_tidak_tersedia" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.pemesanan.tolakSaatDuka(lain.adminLokasi, { nomor: fixture.nomor, alasan: "petak_tidak_tersedia" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: "MKM-2026-999999", alasan: "petak_tidak_tersedia" }),
    ).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    // Nothing was written by any of the refusals.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "diajukan", alasan: null });
  });

  it("refuses an order that has already moved on, and nothing the first decline did is undone by a second", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);

    expect((await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: fixture.nomor, alasan: "kapasitas_penuh" })).ok).toBe(true);
    // The first reason stands; a second Tolak changes nothing.
    expect(
      await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: fixture.nomor, alasan: "tanggal_tidak_bisa" }),
    ).toEqual({ ok: false, reason: "pesanan_sudah_ditutup" });
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order).toMatchObject({ status: "ditolak", alasan: "Kapasitas blok ini sudah penuh" });
    expect(await setup.pemesanan.ditolak(fixture.lokasiMitra.id)).toBe(1);
  });

  it("emails the family that the order was declined and why", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await pesananMenunggu(setup);

    await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: fixture.nomor, alasan: "dokumen_belum_lengkap" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const kabar = setup.email.sent.find((message) => message.to === "pemesan@contoh.id" && message.subject.includes(fixture.nomor) && message.text.includes("kami tandai ditolak"));
    expect(kabar?.text).toContain("Dokumen yang dibutuhkan belum lengkap");
    expect(kabar?.text).toContain(fixture.lokasiMitra.name);
    // The rebook link is the way back into Pilih makam (AC 3; its own test reads what that list does with it).
    expect(kabar?.text).toContain(`/pesan-makam/saat-duka?dari=${fixture.nomor}`);
  });
});
