/**
 * "Dibayar langsung ke Lokasi Mitra" (spec, Billing > Payment: "by the Admin
 * Lokasi with proof, reversible by Admin Platform"; Payouts: "'Dibayar
 * langsung' means no tariff Pencairan and a platform-fee Potongan"; ticket 30's
 * AC 2, 5, 6). The one payment path money never travels on: the family pays the
 * Lokasi Mitra at its own gate, and the Operator only records that it happened.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { paymentMethodText } from "@/lib/billing-labels";
import { wib } from "@/lib/time/jakarta";
import { cellsOf } from "../../../tests/support/inventory";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  orderSaatDuka,
  pemesananOnTestDatabase,
  saatDukaFixture,
  siapkanOperatorPemesanan,
  terverifikasiLokasi,
  type PemesananSetup,
} from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The files under `prefix` the FileStore holds: the fixture's own uploads (an agreement scan, a Kunjungan Verifikasi photo) are none of this feature's. */
function berkas(setup: PemesananSetup, prefix: string) {
  return [...setup.files.stored.entries()].filter(([key]) => key.startsWith(prefix));
}

/** The Lokasi Mitra's own record of the cash: a photo of a receipt, as a staff upload is. */
const notaKas = { body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]), contentType: "image/jpeg" };

/** A confirmed order at the fixture's Lokasi Mitra, whose pay-after Tagihan is still Belum Dibayar. */
async function pesananTerkonfirmasi(setup: PemesananSetup, options: { email?: string } = {}) {
  const fixture = await saatDukaFixture(setup, options);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({
    ...orderSaatDuka(fixture),
    rencanaPemakamanAt: "2026-10-02T10:00",
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const [petak] = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: petak!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  // The order itself names the Tagihan its confirmation issued.
  const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
  if (!order?.tagihanId) throw new Error("no Tagihan on the order");
  return { ...fixture, nomor: placed.pemesanan.nomor, tagihanId: order.tagihanId };
}

describe("the Admin Lokasi records a payment made directly to its Lokasi Mitra", () => {
  it("the Bukti Pembayaran names the Lokasi Mitra that received it, and the order says the money never came to the Operator", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    setup.clock.set(wib("2026-10-03 10:00"));

    const hasil = await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, {
      nomor: fixture.nomor,
      bukti: notaKas,
    });

    expect(hasil).toMatchObject({
      ok: true,
      pembayaran: {
        tagihan: { nomorTagihan: expect.stringMatching(/^TGH\/2026\/\d{6}$/) },
        method: { kind: "langsung_ke_lokasi", lokasiName: "Makam Wakaf Al-Ikhlas" },
      },
    });
    // What the Bukti Pembayaran page reads for its method.
    if (!hasil.ok) return;
    expect(paymentMethodText(hasil.pembayaran.method)).toBe("Dibayar langsung, diterima oleh Lokasi Mitra Makam Wakaf Al-Ikhlas");
    const tagihan = await setup.billing.tagihan(fixture.tagihanId);
    expect(tagihan).toMatchObject({ status: "lunas" });
    // And the order keeps the fact Payouts prices from: no tariff Pencairan, this platform fee owed as a Potongan.
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toEqual({
      nomor: fixture.nomor,
      lokasi: { id: fixture.lokasiMitra.id, name: "Makam Wakaf Al-Ikhlas" },
      tagihanId: fixture.tagihanId,
      partnerShare: 0,
      partnerShareNote: null,
      pembayaran: {
        kind: "langsung_ke_lokasi_mitra",
        pada: wib("2026-10-03 10:00"),
        bukti: true,
        biayaPlatform: 150_000,
      },
    });
    // The proof is the Lokasi Mitra's own file, kept in the private FileStore.
    expect(berkas(setup, "bayar-langsung/").map(([, file]) => file)).toEqual([
      expect.objectContaining({ contentType: "image/jpeg", body: notaKas.body }),
    ]);
    // Audited on the Lokasi, like every staff write about it.
    const entri = (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).filter((entry) => entry.action === "pembayaran.catat_langsung");
    expect(entri).toEqual([
      expect.objectContaining({
        actor: { accountId: fixture.adminLokasi.accountId, role: "admin_lokasi" },
        entity: { kind: "pemesanan_makam", id: expect.any(String) },
        before: { tagihanStatus: "belum_dibayar", bayarLangsungPada: null },
        after: expect.objectContaining({ tagihanStatus: "lunas", lokasi: "Makam Wakaf Al-Ikhlas" }),
      }),
    ]);
  });

  it("it fires the payment's downstream effects once, like every other payment path", async () => {
    const metode: string[] = [];
    const setup = pemesananOnTestDatabase(db, {
      paymentEffects: [{ name: "test.observe", run: async (_tx, payment) => void metode.push(payment.method.kind) }],
    });
    const fixture = await pesananTerkonfirmasi(setup);
    expect(metode).toEqual([]);

    const hasil = await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, { nomor: fixture.nomor, bukti: notaKas });

    expect(hasil.ok).toBe(true);
    expect(metode).toEqual(["langsung_ke_lokasi"]);
  });

  it("the proof is required, and so is a Tagihan to settle: an order still waiting for its plot is refused", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);

    // No proof, so no record: the money being in the Lokasi's cashbox is not a fact yet.
    expect(
      await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, {
        nomor: placed.pemesanan.nomor,
        bukti: { body: new Uint8Array(), contentType: "image/jpeg" },
      }),
    ).toEqual({ ok: false, reason: "input_tidak_valid" });
    // A Tagihan to settle: an order the Lokasi has not confirmed has none.
    expect(await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, bukti: notaKas })).toEqual({
      ok: false,
      reason: "tagihan_belum_ada",
    });
    expect(berkas(setup, "bayar-langsung/")).toEqual([]);
    expect(await setup.pemesanan.pembayaranOrder(placed.pemesanan.nomor)).toMatchObject({ pembayaran: { kind: "belum_dibayar" } });
  });

  it("only that Lokasi Mitra's own Admin Lokasi may record it: not Admin Platform, not another Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    // Admin Platform is the one who reverses such a payment (ticket 31), never the one who records it.
    expect(await setup.pemesanan.catatPembayaranLangsung(fixture.admin, { nomor: fixture.nomor, bukti: notaKas })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.pemesanan.catatPembayaranLangsung(lain.adminLokasi, { nomor: fixture.nomor, bukti: notaKas })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "belum_dibayar" });
    expect(berkas(setup, "bayar-langsung/")).toEqual([]);
  });

  it("a direct payment is recorded once: a second one is refused and changes nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);

    const pertama = await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, { nomor: fixture.nomor, bukti: notaKas });
    const kedua = await setup.pemesanan.catatPembayaranLangsung(fixture.adminLokasi, { nomor: fixture.nomor, bukti: notaKas });

    expect(pertama.ok).toBe(true);
    expect(kedua).toEqual({ ok: false, reason: "sudah_ada_bayar_langsung" });
    const order = await setup.pemesanan.pembayaranOrder(fixture.nomor);
    expect(pertama.ok && kedua.ok ? null : order?.pembayaran).toMatchObject({ pada: setup.clock.now() });
    expect(
      (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).filter((entry) => entry.action === "pembayaran.catat_langsung"),
    ).toHaveLength(1);
  });

  it("an order paid through the Operator is not a direct payment: Payouts reads the other kind", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const paid = await setup.billing.recordPayment(fixture.tagihanId, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error(`not paid: ${paid.reason}`);

    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({
      pembayaran: { kind: "melalui_operator" },
      partnerShare: 0,
    });
  });
});
