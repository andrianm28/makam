/**
 * A Tagihan is announced by the flow that issues it (ticket 89). Notifications
 * only sends a Tagihan's messages to the address recorded when the Tagihan is
 * announced, so a confirmation that issues a Tagihan and never announces it
 * leaves the Pemesan without the "Tagihan terbit" email and every reminder,
 * overdue and refund message after it. These tests drive the real confirmations
 * (Admin Lokasi at a Lokasi Mitra, Admin Platform at a TPU) with the real
 * Notifications module and read only what the fake EmailSender received.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { createPengurusan } from "@/domain/pengurusan";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { signedInPetugasLapangan } from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The emails to one address that carry a Tagihan's link: the family gets one, the confirmation's. */
const denganTautanTagihan = (setup: { email: { sent: { to: string; subject: string; text: string }[] } }, to: string) =>
  setup.email.sent.filter((message) => message.to === to && message.text.includes("/dokumen/"));

describe("a Saat Duka order confirmed by the Admin Lokasi announces its Tagihan", () => {
  it("sends the Pemesan one email with the order page link and the Tagihan's link, and records where the Tagihan's messages go", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const petak = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId: petak[0]!.id,
      pemakamanAt: "2026-10-02T10:00",
    });
    if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    const tagihan = await setup.billing.tagihan(order!.tagihanId!);

    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const terbit = denganTautanTagihan(setup, fixture.pemesan.email);
    // One email on confirmation, carrying both the order page and the Tagihan.
    expect(terbit).toHaveLength(1);
    expect(terbit[0]?.text).toContain(hasil.tagihan.nomorTagihan);
    expect(terbit[0]?.text).toContain(`/dokumen/${tagihan!.link}`);
    expect(terbit[0]?.text).toContain(`/pesanan/${placed.pemesanan.nomor}`);
    expect(await setup.notifications.pesanTagihan(tagihan!.id)).toEqual([]);

    // The Tagihan's contact was still recorded: paying it sends the receipt to that address.
    const bayar = await setup.billing.bayar(tagihan!.link);
    if (!bayar.ok) throw new Error("bayar refused");
    const payment = setup.payments.created.at(-1)!;
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(setup.email.sent.filter((message) => message.to === fixture.pemesan.email && message.subject.includes("Bukti Pembayaran"))).toHaveLength(1);
  });
});

describe("a Saat Duka TPU order confirmed by the Admin Platform announces its Tagihan", () => {
  it("sends the Pemesan one email with the order page link and the Tagihan's link", async () => {
    const queues = queuesOnTestDatabase(db);
    const pengurusan = createPengurusan({
      db,
      clock: queues.clock,
      files: queues.files,
      audit: queues.audit,
      lokasi: queues.lokasi,
      tariffs: queues.tariffs,
      billing: queues.billing,
      identity: queues.identity,
      fieldwork: queues.fieldwork,
      layanan: queues.layanan,
      notifikasi: queues.notifications,
    });
    const admin = await siapkanOperatorPemesanan(queues);
    const petugas = await signedInPetugasLapangan(queues, admin, "petugas.terbit@contoh.id");
    queues.clock.set(wib("2026-10-01 10:00"));
    const fixture = await saatDukaTpuFixture(queues);
    queues.clock.set(wib("2026-10-01 10:00"));
    await pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    const hasil = await pengurusan.konfirmasiSaatDukaTpu(admin, {
      nomor: "MKM-2026-000001",
      pemakamanAt: "2026-10-02 09:00",
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      petugasAccountId: petugas.accountId,
      catatan: "",
    });
    if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);

    await queues.notifications.kirimPesanJatuhTempo(queues.clock.now());
    await queues.notifications.kirimPesanJatuhTempo(queues.clock.now());

    const terbit = denganTautanTagihan(queues, fixture.pemesan.email);
    expect(terbit).toHaveLength(1);
    expect(terbit[0]?.text).toContain(`/dokumen/${hasil.tagihan.link}`);
    expect(terbit[0]?.text).toContain("/pengurusan/MKM-2026-000001");
    expect(await queues.notifications.pesanTagihan(hasil.tagihan.id)).toEqual([]);
  });
});

describe("a confirmation is never blocked by its Tagihan's announcement", () => {
  it("still confirms an order whose stored email the schema rejects, and opens the Telepon Pemesan row instead", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    await db.execute(sql`update pemesanan_makam set email = 'bukan-email' where nomor = ${placed.pemesanan.nomor}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const petak = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");

    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId: petak[0]!.id,
      pemakamanAt: "2026-10-02T10:00",
    });

    expect(hasil.ok).toBe(true);
    expect((await setup.notifications.teleponPemesanTerbuka()).some((row) => row.subjectKind === "tagihan" && row.sebab === "tanpa_email")).toBe(true);
    expect(setup.reportedErrors).toHaveLength(1);
    expect(JSON.stringify(setup.reportedErrors)).not.toContain("bukan-email");
  });
});

/** A Saat Duka order confirmed at a Lokasi Mitra, its Tagihan issued: what a Harga Khusus is then set on. */
async function dikonfirmasi(setup: ReturnType<typeof pemesananOnTestDatabase>, emailKosong = false) {
  const fixture = await saatDukaFixture(setup);
  const admin = await siapkanOperatorPemesanan(setup);
  setup.clock.set(wib("2026-10-01 10:00"));
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  if (emailKosong) await db.execute(sql`update pemesanan_makam set email = null where nomor = ${placed.pemesanan.nomor}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const petak = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: petak[0]!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
  return { fixture, admin, tagihan: { id: order!.tagihanId! } };
}

describe("a Harga Khusus reissue announces its new Tagihan", () => {
  it("emails the Pemesan once with the NEW Tagihan's link, and records the new Tagihan's contact for what comes after", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const { fixture, admin, tagihan } = await dikonfirmasi(setup);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const sebelum = denganTautanTagihan(setup, fixture.pemesan.email).length;

    const khusus = await setup.billing.tetapkanHargaKhusus(admin, { tagihanId: tagihan.id, amount: 100_000, alasan: "Keringanan" });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const baru = denganTautanTagihan(setup, fixture.pemesan.email).slice(sebelum);
    expect(baru).toHaveLength(1);
    expect(baru[0]?.text).toContain(`/dokumen/${khusus.tagihan.link}`);
    expect(baru[0]?.text).toContain(khusus.tagihan.nomorTagihan);
    expect((await setup.notifications.pesanTagihan(khusus.tagihan.id)).map((pesan) => pesan.template)).toEqual(["tagihan_terbit"]);

    // The new Tagihan's contact is recorded: paying it sends the receipt to the same address.
    const bayar = await setup.billing.bayar(khusus.tagihan.link);
    if (!bayar.ok) throw new Error("bayar refused");
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(setup.payments.created.at(-1)!.providerPaymentId, "paid"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(setup.email.sent.filter((message) => message.to === fixture.pemesan.email && message.subject.includes("Bukti Pembayaran"))).toHaveLength(1);
  });

  it("a Harga Khusus down to Rp 0 sends the Pemesan the Bukti Pembayaran by email, with no Telepon Pemesan row", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const { fixture, admin, tagihan } = await dikonfirmasi(setup);
    const total = (await setup.billing.tagihan(tagihan.id))!.total;

    const khusus = await setup.billing.tetapkanHargaKhusus(admin, { tagihanId: tagihan.id, amount: total, alasan: "Keringanan penuh" });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(khusus.tagihan.total).toBe(0);
    const bukti = setup.email.sent.filter((message) => message.to === fixture.pemesan.email && message.subject.includes("Bukti Pembayaran"));
    expect(bukti).toHaveLength(1);
    expect((await setup.notifications.teleponPemesanTerbuka()).filter((row) => row.subjectId === khusus.tagihan.id)).toEqual([]);
    expect((await setup.notifications.pesanTagihan(khusus.tagihan.id)).map((pesan) => pesan.template)).not.toContain("tagihan_terbit");
  });

  it("an order with no email opens the Telepon Pemesan row for the new Tagihan, and the Harga Khusus still lands", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const { admin, tagihan } = await dikonfirmasi(setup, true);

    const khusus = await setup.billing.tetapkanHargaKhusus(admin, { tagihanId: tagihan.id, amount: 100_000, alasan: "Keringanan" });

    expect(khusus.ok).toBe(true);
    if (!khusus.ok) return;
    const terbuka = await setup.notifications.teleponPemesanTerbuka();
    expect(terbuka.some((row) => row.subjectKind === "tagihan" && row.subjectId === khusus.tagihan.id && row.sebab === "tanpa_email")).toBe(true);
  });
});
