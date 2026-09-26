import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings, setTagihanStatusForTest, TEST_PUBLIC_ORIGIN } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { scheduledTicks } from "@/domain/scheduler";
import { lapsePayFirstTagihanTick, type IssueTagihanInput, type PaymentEffect, type SettledPayment } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

const terencana: IssueTagihanInput = {
  moment: { kind: "terencana", holdExpiresAt: wib("2026-10-03 09:00") },
  addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
  nomorPemesanan: "MKM-2026-000001",
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [
    { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI },
    { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
  ],
};

type Setup = Awaited<ReturnType<typeof billingWithOperatorSettings>>;

async function issued(setup: Setup, input: IssueTagihanInput = terencana) {
  const result = await setup.billing.issueTagihan(input);
  if (!result.ok) throw new Error(`not issued: ${result.reason}`);
  return result.tagihan;
}

describe("Bayar", () => {
  it("the first Bayar asks the PaymentProvider for a payment of the Tagihan's total and sends the payer to it", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const bayar = await setup.billing.bayar(tagihan.link);

    expect(setup.payments.created).toHaveLength(1);
    const [created] = setup.payments.created;
    expect(created).toMatchObject({
      reference: "TGH/2026/000001",
      amountRupiah: 5_150_000,
      returnUrl: `${TEST_PUBLIC_ORIGIN}/dokumen/${tagihan.link}`,
    });
    expect(bayar).toEqual({ ok: true, paymentUrl: created.paymentUrl });
  });

  it("Bayar again while the provider's link is valid reuses the same payment", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const first = await setup.billing.bayar(tagihan.link);
    setup.clock.advance({ hours: 20 });

    const again = await setup.billing.bayar(tagihan.link);

    expect(again).toEqual(first);
    expect(setup.payments.created).toHaveLength(1);
  });

  it("once the provider's link expired, Bayar creates a new payment; the Tagihan's due date is unchanged", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const first = await setup.billing.bayar(tagihan.link);
    // The fake provider's links last 24 h; the Tagihan is due at the hold expiry, two days on.
    setup.clock.advance({ hours: 24 });

    const again = await setup.billing.bayar(tagihan.link);

    expect(setup.payments.created).toHaveLength(2);
    expect(again).toEqual({ ok: true, paymentUrl: setup.payments.created[1].paymentUrl });
    expect(again).not.toEqual(first);
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar", dueAt: tagihan.dueAt });
  });

  it("a lapsed (Dibatalkan) Tagihan can't be paid: Bayar creates no payment", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-03 09:00"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    expect(await setup.billing.bayar(tagihan.link)).toEqual({ ok: false, reason: "tagihan_dibatalkan" });
    expect(setup.payments.created).toEqual([]);
  });

  it("a pay-first Tagihan past its due date can't be paid, even before the lapse tick has run", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    await setup.billing.bayar(tagihan.link);
    setup.clock.set(wib("2026-10-03 09:00"));

    expect(await setup.billing.bayar(tagihan.link)).toEqual({ ok: false, reason: "batas_pembayaran_lewat" });
    expect(setup.payments.created).toHaveLength(1);
    expect(await setup.billing.documentByLink(tagihan.link)).toMatchObject({
      tagihan: { status: "belum_dibayar" },
      notPayableBecause: "batas_pembayaran_lewat",
    });
  });

  it("a pay-after Tagihan past its due date is never lapsed and stays payable", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup, {
      ...terencana,
      moment: { kind: "saat_duka", burialAt: wib("2026-10-01 14:00"), paymentWindowHours: 72 },
    });
    setup.clock.set(wib("2026-10-10 09:00"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    expect(await setup.billing.bayar(tagihan.link)).toMatchObject({ ok: true });
  });

  it("a Tidak Tertagih Tagihan stays payable, through Bayar and the webhook", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup, {
      ...terencana,
      moment: { kind: "saat_duka", burialAt: wib("2026-10-01 14:00"), paymentWindowHours: 72 },
    });
    await setTagihanStatusForTest(db, tagihan.id, "tidak_tertagih");
    setup.clock.set(wib("2026-11-15 09:00"));

    const payment = await paying(setup, tagihan);
    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    expect(received).toMatchObject({ ok: true, outcome: "lunas" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("a Lunas Tagihan is not paid twice: Bayar points to its Bukti Pembayaran instead", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error("not paid");

    expect(await setup.billing.bayar(tagihan.link)).toEqual({ ok: false, reason: "sudah_lunas", buktiLink: paid.bukti.link });
    expect(setup.payments.created).toEqual([]);
  });

  it("a link that is no Tagihan's finds nothing to pay", async () => {
    const setup = await billingWithOperatorSettings(db);

    expect(await setup.billing.bayar("x".repeat(43))).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.billing.bayar("../etc")).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });
});

/** Bayar on the Tagihan, and the provider payment it created (the newest). */
async function paying(setup: Setup, tagihan: { link: string }) {
  const bayar = await setup.billing.bayar(tagihan.link);
  if (!bayar.ok) throw new Error(`Bayar refused: ${bayar.reason}`);
  const payment = setup.payments.created.at(-1);
  if (!payment) throw new Error("no provider payment");
  return payment;
}

describe("the payment webhook", () => {
  it("a signed 'paid' webhook marks the Tagihan Lunas and issues its Bukti Pembayaran with the channel, time and provider reference", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    setup.clock.set(wib("2026-10-01 16:47"));

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { occurredAt: wib("2026-10-01 16:45"), channel: "VA BCA" }),
    );

    expect(received).toMatchObject({
      ok: true,
      outcome: "lunas",
      bukti: {
        nomorBukti: "BYR/2026/000001",
        paidAt: wib("2026-10-01 16:45"),
        amount: 5_150_000,
        method: { kind: "penyedia_pembayaran", channel: "VA BCA" },
        reference: payment.providerPaymentId,
        tagihan: { nomorTagihan: "TGH/2026/000001", status: "lunas", lines: tagihan.lines },
      },
    });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("rejects a webhook whose signature does not check out, and nothing is paid", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    const genuine = setup.payments.webhookFor(payment.providerPaymentId, "paid");
    const tampered = { ...genuine, rawBody: genuine.rawBody.replace("5150000", "1") };
    const unsigned = { rawBody: genuine.rawBody, headers: { "content-type": "application/json" } };

    expect(await setup.billing.receivePaymentWebhook(tampered)).toEqual({ ok: false, reason: "webhook_tidak_valid" });
    expect(await setup.billing.receivePaymentWebhook(unsigned)).toEqual({ ok: false, reason: "webhook_tidak_valid" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("the same event delivered twice yields one Lunas transition and one Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    const webhook = setup.payments.webhookFor(payment.providerPaymentId, "paid");

    const first = await setup.billing.receivePaymentWebhook(webhook);
    const replayed = await setup.billing.receivePaymentWebhook(webhook);

    expect(first).toMatchObject({ ok: true, outcome: "lunas", bukti: { nomorBukti: "BYR/2026/000001" } });
    expect(replayed).toEqual({ ok: true, outcome: "sudah_diproses" });
    expect(await setup.billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
  });

  it("the same event delivered twice at once still issues one Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    const webhook = setup.payments.webhookFor(payment.providerPaymentId, "paid");

    const outcomes = await Promise.all([
      setup.billing.receivePaymentWebhook(webhook),
      setup.billing.receivePaymentWebhook(webhook),
    ]);

    expect(outcomes.map((received) => received.ok && received.outcome).sort()).toEqual(["lunas", "sudah_diproses"]);
    expect(await setup.billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
  });

  it("a second 'paid' event for an already Lunas Tagihan issues no second Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    const another = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    expect(another).toEqual({ ok: true, outcome: "sudah_lunas" });
    expect(await setup.billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
  });

  it("paying on an expired link after Bayar created a new one still settles the Tagihan", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const old = await paying(setup, tagihan);
    setup.clock.advance({ hours: 25 });
    await paying(setup, tagihan);

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(old.providerPaymentId, "paid"));

    expect(received).toMatchObject({ ok: true, outcome: "lunas" });
  });

  it("'expired' and 'failed' events change nothing: the Tagihan stays payable", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);

    expect(await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "expired"))).toEqual({
      ok: true,
      outcome: "diabaikan",
    });
    expect(await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "failed"))).toEqual({
      ok: true,
      outcome: "diabaikan",
    });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(await setup.billing.bayar(tagihan.link)).toMatchObject({ ok: true });
  });

  it("a pay-first Tagihan paid after its due date, before the lapse tick, is a Pembayaran Perlu Ditinjau, never Lunas", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    // Due at the hold expiry, 2026-10-03 09:00; paid a minute later, and the tick has not run.
    setup.clock.set(wib("2026-10-03 09:02"));

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { occurredAt: wib("2026-10-03 09:01") }),
    );

    expect(received).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "batas_pembayaran_lewat" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(await setup.billing.pembayaranPerluDitinjau()).toEqual([
      {
        id: expect.any(String),
        reason: "batas_pembayaran_lewat",
        providerPaymentId: payment.providerPaymentId,
        amount: 5_150_000,
        channel: "QRIS",
        paidAt: wib("2026-10-03 09:01"),
        receivedAt: wib("2026-10-03 09:02"),
        tagihan: { id: tagihan.id, nomorTagihan: "TGH/2026/000001" },
      },
    ]);
    expect(setup.reportedErrors).toEqual([
      { error: expect.any(Error), context: { tags: { module: "billing", event: "pembayaran_perlu_ditinjau", reason: "batas_pembayaran_lewat" } } },
    ]);
  });

  it("a pay-first Tagihan paid after its due date is a Pembayaran Perlu Ditinjau for being late, also once the tick has cancelled it", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    setup.clock.set(wib("2026-10-03 09:05"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { occurredAt: wib("2026-10-03 09:01") }),
    );

    expect(received).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "batas_pembayaran_lewat" });
  });

  it("a pay-first Tagihan paid before its due date but delivered after the lapse tick is a Pembayaran Perlu Ditinjau", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    setup.clock.set(wib("2026-10-03 09:00"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    setup.clock.set(wib("2026-10-03 09:03"));

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { occurredAt: wib("2026-10-03 08:58") }),
    );

    expect(received).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "tagihan_dibatalkan" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "dibatalkan" });
    expect(await setup.billing.pembayaranPerluDitinjau()).toMatchObject([{ reason: "tagihan_dibatalkan", paidAt: wib("2026-10-03 08:58") }]);
  });

  it("a pay-first Tagihan paid before its due date and delivered after it, before the lapse tick, is Lunas", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    setup.clock.set(wib("2026-10-03 09:03"));

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { occurredAt: wib("2026-10-03 08:58") }),
    );

    expect(received).toMatchObject({ ok: true, outcome: "lunas", bukti: { paidAt: wib("2026-10-03 08:58") } });
    expect(await setup.billing.pembayaranPerluDitinjau()).toEqual([]);
  });

  it("a pay-after Tagihan paid long after its due date is Lunas", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup, {
      ...terencana,
      moment: { kind: "saat_duka", burialAt: wib("2026-10-01 14:00"), paymentWindowHours: 72 },
    });
    setup.clock.set(wib("2026-10-20 10:00"));
    const payment = await paying(setup, tagihan);

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    expect(received).toMatchObject({ ok: true, outcome: "lunas" });
  });

  it("a paid amount that differs from the Tagihan's total does not make it Lunas and is reported", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);

    const received = await setup.billing.receivePaymentWebhook(
      setup.payments.webhookFor(payment.providerPaymentId, "paid", { amountRupiah: 5_000_000 }),
    );

    expect(received).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "jumlah_tidak_cocok" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(await setup.billing.pembayaranPerluDitinjau()).toMatchObject([
      { reason: "jumlah_tidak_cocok", amount: 5_000_000, tagihan: { nomorTagihan: "TGH/2026/000001" } },
    ]);
    expect(setup.reportedErrors).toHaveLength(1);
  });

  it("a payment Billing never created is reported and changes nothing", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    // Created at the provider directly, never through Bayar.
    const foreign = await setup.payments.createPayment({ reference: tagihan.nomorTagihan, amountRupiah: tagihan.total, description: "?" });

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(foreign.providerPaymentId, "paid"));

    expect(received).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "pembayaran_tidak_dikenal" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
    expect(await setup.billing.pembayaranPerluDitinjau()).toMatchObject([
      { reason: "pembayaran_tidak_dikenal", providerPaymentId: foreign.providerPaymentId, amount: 5_150_000, tagihan: null },
    ]);
    expect(setup.reportedErrors).toHaveLength(1);
  });

  it("a Tagihan paid twice (on an old link and a new one) keeps one Bukti Pembayaran; the second payment is reported", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const old = await paying(setup, tagihan);
    setup.clock.advance({ hours: 25 });
    const fresh = await paying(setup, tagihan);
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(fresh.providerPaymentId, "paid"));

    const again = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(old.providerPaymentId, "paid"));

    expect(again).toEqual({ ok: true, outcome: "perlu_ditinjau", reason: "sudah_lunas_dibayar_lagi" });
    expect(await setup.billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
    expect(await setup.billing.pembayaranPerluDitinjau()).toMatchObject([
      { reason: "sudah_lunas_dibayar_lagi", providerPaymentId: old.providerPaymentId, tagihan: { id: tagihan.id } },
    ]);
    expect(setup.reportedErrors).toHaveLength(1);
  });

  it("a Pembayaran Perlu Ditinjau delivered twice is recorded once", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);
    const wrong = setup.payments.webhookFor(payment.providerPaymentId, "paid", { amountRupiah: 1 });

    await setup.billing.receivePaymentWebhook(wrong);
    expect(await setup.billing.receivePaymentWebhook(wrong)).toEqual({ ok: true, outcome: "sudah_diproses" });

    expect(await setup.billing.pembayaranPerluDitinjau()).toHaveLength(1);
  });
});

describe("the downstream effects of a payment", () => {
  it("run inside the transaction that makes the Tagihan Lunas, told of the Tagihan and its Bukti Pembayaran", async () => {
    const seen: { payment: SettledPayment; statusInTransaction: string | undefined }[] = [];
    const effect: PaymentEffect = {
      name: "test.observe",
      async run(tx, payment) {
        seen.push({ payment, statusInTransaction: (await setup.billing.within(tx).tagihan(payment.tagihanId))?.status });
      },
    };
    const setup = await billingWithOperatorSettings(db, { paymentEffects: [effect] });
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));
    await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    if (!received.ok || received.outcome !== "lunas") throw new Error("not Lunas");
    expect(seen).toEqual([
      {
        statusInTransaction: "lunas",
        payment: {
          tagihanId: tagihan.id,
          nomorTagihan: "TGH/2026/000001",
          nomorPemesanan: "MKM-2026-000001",
          buktiId: received.bukti.id,
          nomorBukti: "BYR/2026/000001",
          paidAt: received.bukti.paidAt,
          method: { kind: "penyedia_pembayaran", channel: "QRIS" },
        },
      },
    ]);
  });

  it("a failing effect doesn't lose the payment: the Tagihan stays Lunas with its Bukti, only the effect's own changes roll back, and it is reported", async () => {
    const effect: PaymentEffect = {
      name: "test.bukti_pemesanan",
      async run(tx) {
        // Takes a Bukti Pemesanan number, then fails.
        await setup.billing.within(tx).nextDocumentNumber("BPM");
        throw new Error("effect failed");
      },
    };
    const setup = await billingWithOperatorSettings(db, { paymentEffects: [effect] });
    const tagihan = await issued(setup);
    const payment = await paying(setup, tagihan);

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    expect(received).toMatchObject({ ok: true, outcome: "lunas", bukti: { nomorBukti: "BYR/2026/000001" } });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
    expect(await setup.billing.nextDocumentNumber("BPM")).toBe("BPM/2026/000001");
    expect(setup.reportedErrors).toEqual([
      {
        error: expect.any(Error),
        context: { tags: { module: "billing", event: "payment_effect_failed", effect: "test.bukti_pemesanan", nomorTagihan: "TGH/2026/000001" } },
      },
    ]);
  });

  it("the scheduler runs a failed effect again every 10 minutes until it succeeds, once", async () => {
    let failing = true;
    const ran: string[] = [];
    const effect: PaymentEffect = {
      name: "test.flaky",
      async run(_tx, payment) {
        if (failing) throw new Error("not yet");
        ran.push(payment.nomorTagihan);
      },
    };
    const setup = await billingWithOperatorSettings(db, { paymentEffects: [effect] });
    const tagihan = await issued(setup);
    await setup.billing.recordPayment(tagihan.id, { method: { kind: "transfer_manual" }, reference: null });
    const retry = scheduledTicks.find((scheduled) => scheduled.name === "billing.retry_payment_effects");
    expect(retry?.cron).toBe("*/10 * * * *");
    const ctx = { db, paymentEffects: [effect], reportError: () => {} };

    setup.clock.advance({ minutes: 10 });
    await retry!.tick(ctx, setup.clock.now());
    expect(ran).toEqual([]);
    failing = false;
    setup.clock.advance({ minutes: 10 });
    await retry!.tick(ctx, setup.clock.now());
    await retry!.tick(ctx, setup.clock.now());

    expect(ran).toEqual(["TGH/2026/000001"]);
  });

  it("every payment path fires them: a manual payment and a Rp 0 Tagihan (Lunas at issue) too", async () => {
    const methods: string[] = [];
    const setup = await billingWithOperatorSettings(db, {
      paymentEffects: [{ name: "test.observe", run: async (_tx, payment) => void methods.push(payment.method.kind) }],
    });
    const tagihan = await issued(setup);

    await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });
    await issued(setup, { ...terencana, lines: [...terencana.lines, { kind: "penyesuaian_harga_khusus", amount: rp(5_150_000) }] });

    expect(methods).toEqual(["tunai", "tanpa_pembayaran"]);
  });
});

describe("a manual payment of a pay-first Tagihan", () => {
  it("paid after its due date is refused, even before the lapse tick, and the Tagihan stays unpaid", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-03 10:00"));

    const recorded = await setup.billing.recordPayment(tagihan.id, {
      method: { kind: "transfer_manual" },
      reference: null,
      paidAt: wib("2026-10-03 09:30"),
    });

    expect(recorded).toEqual({ ok: false, reason: "batas_pembayaran_lewat" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("paid before its due date and recorded after it, before the lapse tick, is Lunas with that payment time", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-03 10:00"));

    const recorded = await setup.billing.recordPayment(tagihan.id, {
      method: { kind: "transfer_manual" },
      reference: "TRF-1",
      paidAt: wib("2026-10-02 15:00"),
    });

    expect(recorded).toMatchObject({ ok: true, bukti: { paidAt: wib("2026-10-02 15:00"), tagihan: { status: "lunas" } } });
  });

  it("recorded without a payment time counts as paid now: after the due date it is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-03 09:01"));

    expect(await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null })).toEqual({
      ok: false,
      reason: "batas_pembayaran_lewat",
    });
  });

  it("a payment time in the future is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    expect(
      await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null, paidAt: wib("2026-10-01 12:00") }),
    ).toEqual({ ok: false, reason: "waktu_pembayaran_tidak_valid" });
  });
});
