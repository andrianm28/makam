/**
 * Placing a Pemesanan Saat Duka (spec, Pemesanan > Saat Duka; stories 21, 22,
 * 26, 28; ticket 22's AC).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  belumTeverifikasiLokasi,
  orderSaatDuka,
  pemesananOnTestDatabase,
  pemesanDenganEmail,
  saatDukaFixture,
} from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the wizard's Kirim places a Pemesanan Saat Duka", () => {
  it("creates a Diajukan order with a Nomor Pemesanan, the confirmation deadline from Jam Operasional and no Tagihan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));

    expect(placed).toEqual({ ok: true, pemesanan: { nomor: "MKM-2026-000001", status: "diajukan", konfirmasiDueAt: wib("2026-10-01 11:00") } });

    const order = await setup.pemesanan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      nomor: "MKM-2026-000001",
      kind: "saat_duka",
      status: "diajukan",
      lokasi: { id: fixture.lokasiMitra.id, name: "Makam Wakaf Al-Ikhlas" },
      jenisMakam: { id: fixture.jenisMakam.id, name: "Reguler 1 × 2 m" },
      pemesan: { name: "Budi Santoso", email: "pemesan@contoh.id", phoneNumber: "+6281234567890" },
      almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
      pemegangHak: { mode: "pemesan", name: "Budi Santoso", phoneNumber: "+6281234567890", email: "pemesan@contoh.id" },
      // Nothing is billed at submission: the Tagihan is issued when the Lokasi confirms.
      tagihanId: null,
      konfirmasiDueAt: wib("2026-10-01 11:00"),
    });
    expect(order?.track).toEqual(["diajukan", "dikonfirmasi", "dimakamkan", "selesai"]);
    expect(order?.diajukanAt).toEqual(wib("2026-10-01 09:00"));
  });

  it("numbers each order in one series for every order kind", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const first = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    const second = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), pemesanName: "Dewi Lestari" });

    expect(first.ok && first.pemesanan.nomor).toBe("MKM-2026-000001");
    expect(second.ok && second.pemesanan.nomor).toBe("MKM-2026-000002");
  });

  it("keeps the planned burial time, the placement wish and a Pemegang Hak other than the Pemesan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const placed = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      rencanaPemakamanAt: wib("2026-10-02 10:00"),
      keinginanPenempatan: "Dekat makam keluarganya",
      pemegangHak: { mode: "lain", name: "Andi Santoso", phoneNumber: "081298765432", email: "Andi@Keluarga.id" },
    });

    expect(placed.ok).toBe(true);
    const order = await setup.pemesanan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      rencanaPemakamanAt: wib("2026-10-02 10:00"),
      keinginanPenempatan: "Dekat makam keluarganya",
      pemegangHak: { mode: "lain", name: "Andi Santoso", phoneNumber: "+6281298765432", email: "andi@keluarga.id" },
    });
  });

  it("refuses a Pemegang Hak who is the Almarhum, whoever typed the name", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const modePemesan = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      pemesanName: "siti  aminah",
      pemegangHak: { mode: "pemesan" },
    });
    const modeLain = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      pemegangHak: { mode: "lain", name: "SITI AMINAH", phoneNumber: "081298765432", email: null },
    });

    expect(modePemesan).toEqual({ ok: false, reason: "pemegang_hak_almarhum" });
    expect(modeLain).toEqual({ ok: false, reason: "pemegang_hak_almarhum" });
    expect(await setup.pemesanan.orderOf("MKM-2026-000001", fixture.pemesan)).toBeNull();
  });

  it("refuses an email that is not the Akun's Email Terverifikasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const lain = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      pemesan: { accountId: fixture.pemesan.accountId, email: "orang.lain@contoh.id" },
    });

    expect(lain).toEqual({ ok: false, reason: "email_bukan_akun_ini" });
  });

  it("refuses a Lokasi Mitra that is not Terverifikasi, and a Jenis Makam that cannot be priced", async () => {
    const setup = pemesananOnTestDatabase(db);
    const belum = await belumTeverifikasiLokasi(setup);
    const fixture = await saatDukaFixture(setup);

    const tidakTerverifikasi = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), lokasiId: belum.lokasiMitra.id });
    const jenisTakAda = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), jenisMakamId: "00000000-0000-4000-8000-000000000000" });

    expect(tidakTerverifikasi).toEqual({ ok: false, reason: "lokasi_tidak_terbuka" });
    expect(jenisTakAda).toEqual({ ok: false, reason: "harga_tidak_tersedia" });
    expect(setup.diumumkan).toEqual([]);
  });

  it("keeps one order private to the Pemesan who placed it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const orangLain = await pemesanDenganEmail(setup, "kerabat@contoh.id");

    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));

    expect(placed.ok).toBe(true);
    expect(await setup.pemesanan.orderOf("MKM-2026-000001", fixture.pemesan)).not.toBeNull();
    expect(await setup.pemesanan.orderOf("MKM-2026-000001", orangLain.pemesan)).toBeNull();
  });

  it("announces the order once, for the Notifications module to send", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));

    expect(setup.diumumkan).toEqual([{ nomor: "MKM-2026-000001", lokasiId: fixture.lokasiMitra.id, email: "pemesan@contoh.id" }]);
  });

  it("counts the confirmation deadline from the Lokasi's Jam Operasional, not the wall clock", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    // 20:00 WIB is past the 15:00 close: the promise is Friday 09:00.
    setup.clock.set(wib("2026-10-01 20:00"));
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));

    expect(placed).toEqual({ ok: true, pemesanan: { nomor: "MKM-2026-000001", status: "diajukan", konfirmasiDueAt: wib("2026-10-02 09:00") } });
  });
});
