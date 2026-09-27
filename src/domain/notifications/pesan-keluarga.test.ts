import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setTagihanStatusForTest } from "../../../tests/support/billing";
import { notificationsOnTestDatabase } from "../../../tests/support/notifications";
import { schedulerContext } from "../../../tests/support/scheduler";
import { scheduledTicks } from "@/domain/scheduler";
import { efekBuktiPembayaran } from "@/domain/notifications";
import { siapkanOperator, terbitkanPerpanjangan, type NotificationsSetup } from "../../../tests/support/notifications-messages";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Tagihan terbit: the family is emailed, and the message is logged on the order", () => {
  it("a pay-first Tagihan issued reaches the family email with its link, and is logged terkirim on the Tagihan", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan, diingatkan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
    expect(diingatkan).toBe(2);
    const sentBefore = setup.email.sent.length;
    expect(setup.email.sent.length).toBe(sentBefore);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const sent = setup.email.sent.filter((message) => message.to === "keluarga@contoh.id");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ subject: expect.stringContaining(tagihan.nomorTagihan) });
    expect(sent[0]?.text).toContain(`/dokumen/${tagihan.link}`);

    const riwayat = await setup.notifications.pesanTagihan(tagihan.id);
    expect(riwayat).toHaveLength(3);
    expect(riwayat).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ template: "tagihan_terbit", channel: "email", status: "terkirim" }),
        expect.objectContaining({ template: "tagihan_pengingat_h_1", status: "menunggu" }),
        expect.objectContaining({ template: "tagihan_pengingat_hari_h", status: "menunggu" }),
      ]),
    );
  });

  it("reminders wait for 08:00 WIB: nothing at 07:00, the H-1 reminder at 08:00, the due-day reminder on the due day", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    // Due 2026-10-04 10:00 WIB: reminders at 10-03 08:00 and 10-04 08:00.
    const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    setup.clock.set(wib("2026-10-03 07:00"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingatTerkirim(setup, "keluarga@contoh.id")).toEqual([]);

    setup.clock.set(wib("2026-10-03 08:00"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingatTerkirim(setup, "keluarga@contoh.id")).toEqual([
      expect.stringContaining("jatuh tempo besok"),
    ]);

    setup.clock.set(wib("2026-10-04 08:00"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(pengingatTerkirim(setup, "keluarga@contoh.id")).toEqual([
      expect.stringContaining("jatuh tempo besok"),
      expect.stringContaining("jatuh tempo hari ini"),
    ]);
    expect(tagihan.dueAt).toEqual(wib("2026-10-04 10:00"));
  });

  it.each([
    ["lunas", "lunas"],
    ["dibatalkan", "dibatalkan"],
    ["tidak_tertagih", "tidak_tertagih"],
  ] as const)(
    "a reminder stops once its Tagihan is %s: dropped without a send",
    async (_, status) => {
      const setup = notificationsOnTestDatabase(db);
      await siapkanOperator(setup);
      setup.clock.set(wib("2026-10-01 10:00"));
      const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
      await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
      const sentBefore = setup.email.sent.length;

      await setTagihanStatusForTest(db, tagihan.id, status);
      setup.clock.set(wib("2026-10-04 08:00"));
      const hasil = await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

      expect(hasil.dibatalkan).toBe(2);
      expect(setup.email.sent.length).toBe(sentBefore);
      expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ template: "tagihan_pengingat_h_1", status: "dibatalkan" }),
          expect.objectContaining({ template: "tagihan_pengingat_hari_h", status: "dibatalkan" }),
        ]),
      );
    },
  );

  it("a reminder whose send fails at 19:00 waits for 08:00 before its retry", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    setup.clock.set(wib("2026-10-03 19:00"));
    setup.email.failNextSend(1);
    expect((await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).gagal).toBe(0);
    // 15 minutes of backoff would be 19:15, past the window: 08:00 the next day.
    setup.clock.set(wib("2026-10-03 20:30"));
    expect((await setup.notifications.kirimPesanJatuhTempo(setup.clock.now())).ditunda).toBe(1);
    setup.clock.set(wib("2026-10-04 08:00"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ template: "tagihan_pengingat_h_1", status: "terkirim", attempts: 2 }),
      ]),
    );
  });
});

/** Subjects of reminder emails sent to `email` so far. */
function pengingatTerkirim(setup: NotificationsSetup, email: string): string[] {
  return setup.email.sent
    .filter((message) => message.to === email && message.subject.startsWith("Pengingat:"))
    .map((message) => message.subject);
}

describe("Bukti Pembayaran terbit: the settled Tagihan's receipt", () => {
  it("a settled Tagihan queues its receipt through the payment effect, sent with the Bukti number and link, exactly once", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");
    const efek = efekBuktiPembayaran({
      clock: setup.clock,
      dokumenUrl: (link) => `https://makam.test/dokumen/${link}`,
    });

    const payment = {
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: tagihan.nomorPemesanan,
      buktiId: "123e4567-e89b-12d3-a456-426614174000",
      nomorBukti: "BYR/2026/000001",
      paidAt: wib("2026-10-01 10:05"),
      method: { kind: "penyedia_pembayaran", channel: "QRIS" } as const,
    };
    await efek.run(db, payment);
    await efek.run(db, payment);

    setup.clock.set(wib("2026-10-01 10:06"));
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    const sent = setup.email.sent.filter((message) => message.to === "keluarga@contoh.id");
    const receipts = sent.filter((message) => message.subject.includes("BYR/2026/000001"));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.text).toContain(`/dokumen/${tagihan.link}`);
    expect(receipts[0]?.subject).toContain(tagihan.nomorTagihan);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ template: "bukti_pembayaran_terbit", status: "terkirim" }),
      ]),
    );
  });

  it("a Tagihan announced with no email logs its receipt as tanpa_email, with no extra call row", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, null);
    const efek = efekBuktiPembayaran({
      clock: setup.clock,
      dokumenUrl: (link) => `https://makam.test/dokumen/${link}`,
    });

    await efek.run(db, {
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: tagihan.nomorPemesanan,
      buktiId: "123e4567-e89b-12d3-a456-426614174000",
      nomorBukti: "BYR/2026/000001",
      paidAt: wib("2026-10-01 10:05"),
      method: { kind: "penyedia_pembayaran", channel: "QRIS" } as const,
    });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(setup.email.sent.filter((message) => message.subject.includes("BYR/2026/000001"))).toEqual([]);
    expect(await setup.notifications.pesanTagihan(tagihan.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ template: "bukti_pembayaran_terbit", status: "tanpa_email" }),
      ]),
    );
    // Still only the order's own tanpa_email row: a receipt asks nothing, so it opens no call row.
    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);
  });
});

describe("Scheduler: the worker sends due family messages every minute", () => {
  it("the notifications tick is registered and sends what the worker's tick would", async () => {
    const setup = notificationsOnTestDatabase(db);
    await siapkanOperator(setup);
    setup.clock.set(wib("2026-10-01 10:00"));
    const { tagihan } = await terbitkanPerpanjangan(setup, "keluarga@contoh.id");

    const tick = scheduledTicks.find((scheduled) => scheduled.name === "notifications.kirim_pesan");
    if (!tick) throw new Error("notifications.kirim_pesan is not scheduled");
    await tick.tick(schedulerContext({ db, notifications: setup.notifications }), setup.clock.now());

    expect(setup.email.sent.filter((message) => message.to === "keluarga@contoh.id")).toHaveLength(1);
    expect(tagihan.nomorTagihan).toMatch(/^TGH\//);
  });
});
