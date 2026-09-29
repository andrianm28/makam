/**
 * A Tagihan is announced by the flow that issues it (ticket 89). Notifications
 * only sends a Tagihan's messages to the address recorded when the Tagihan is
 * announced, so a confirmation that issues a Tagihan and never announces it
 * leaves the Pemesan without the "Tagihan terbit" email and every reminder,
 * overdue and refund message after it. These tests drive the real confirmations
 * (Admin Lokasi at a Lokasi Mitra, Admin Platform at a TPU) with the real
 * Notifications module and read only what the fake EmailSender received.
 */
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

/** The Tagihan-terbit emails the fake EmailSender holds for one address. */
const tagihanTerbitUntuk = (setup: { email: { sent: { to: string; subject: string; text: string }[] } }, to: string) =>
  setup.email.sent.filter((message) => message.to === to && message.subject.includes("Tagihan") && message.text.includes("/dokumen/"));

describe("a Saat Duka order confirmed by the Admin Lokasi announces its Tagihan", () => {
  it("sends the Pemesan the Tagihan terbit email with the Tagihan's link, once, and records where its messages go", async () => {
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

    const terbit = tagihanTerbitUntuk(setup, fixture.pemesan.email);
    expect(terbit).toHaveLength(1);
    expect(terbit[0]?.text).toContain(hasil.tagihan.nomorTagihan);
    expect(terbit[0]?.text).toContain(`/dokumen/${tagihan!.link}`);
    expect(await setup.notifications.pesanTagihan(tagihan!.id)).toEqual([
      expect.objectContaining({ template: "tagihan_terbit", status: "terkirim" }),
    ]);
  });
});

describe("a Saat Duka TPU order confirmed by the Admin Platform announces its Tagihan", () => {
  it("sends the Pemesan the Tagihan terbit email with the Tagihan's link, once", async () => {
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

    const terbit = tagihanTerbitUntuk(queues, fixture.pemesan.email);
    expect(terbit).toHaveLength(1);
    expect(terbit[0]?.text).toContain(`/dokumen/${hasil.tagihan.link}`);
  });
});
