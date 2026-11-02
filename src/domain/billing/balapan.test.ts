import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lapsePayFirstTagihanTick, lewatJatuhTempoPayAfterTagihanTick, type IssueTagihanInput } from "./index";

/*
 * UAT penuh, worst cases of Billing: two people (or one double tap) acting on the
 * same Tagihan at the same moment, and a payment that arrives for a Tagihan an
 * Admin has already cancelled. Each settles to one outcome a person can read back.
 */

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

const terencana = (nomor = "MKM-2026-000001"): IssueTagihanInput => ({
  moment: { kind: "terencana", holdExpiresAt: wib("2026-10-03 09:00") },
  addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
  nomorPemesanan: nomor,
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [
    { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI },
    { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
  ],
});

type Setup = Awaited<ReturnType<typeof billingWithOperatorSettings>>;

async function issued(setup: Setup, input: IssueTagihanInput = terencana()) {
  const result = await setup.billing.issueTagihan(input);
  if (!result.ok) throw new Error(`not issued: ${result.reason}`);
  return result.tagihan;
}

describe("Billing under concurrency (UAT penuh, worst case)", () => {
  it("ten Tagihan issued at the same moment each get their own Nomor Tagihan", async () => {
    const setup = await billingWithOperatorSettings(db);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => setup.billing.issueTagihan(terencana(`MKM-2026-${String(i + 1).padStart(6, "0")}`))),
    );

    const nomor = results.map((result) => (result.ok ? result.tagihan.nomorTagihan : result.reason));
    expect(new Set(nomor).size).toBe(10);
    expect(nomor.every((n) => /^TGH\/2026\/0000(0[1-9]|10)$/.test(n))).toBe(true);
  });

  it("a double tap on Bayar asks the PaymentProvider for one payment and sends both taps to it", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const [first, second] = await Promise.all([setup.billing.bayar(tagihan.link), setup.billing.bayar(tagihan.link)]);

    expect(setup.payments.created).toHaveLength(1);
    const url = setup.payments.created[0]!.paymentUrl;
    expect(first).toEqual({ ok: true, paymentUrl: url });
    expect(second).toEqual({ ok: true, paymentUrl: url });
  });

  it("two Admin Platform setting a Harga Khusus on the same Tagihan at once leave one reissue in force", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);

    const results = await Promise.all([
      setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 1_000_000, alasan: "Keluarga kurang mampu" }),
      setup.billing.tetapkanHargaKhusus(setup.adminPlatform, { tagihanId: original.id, amount: 2_000_000, alasan: "Keringanan pengurus" }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const berlaku = await setup.billing.tagihanBerlaku(original.id);
    expect(berlaku).toMatchObject({ status: "belum_dibayar", replacesNomorTagihan: "TGH/2026/000001" });
    expect([4_150_000, 3_150_000]).toContain(berlaku?.total);
    // The chain is exactly one reissue and the original: no second reissue hangs off the cancelled Tagihan.
    expect(await setup.billing.rantaiTagihan(berlaku!.id)).toEqual([berlaku!.id, original.id]);
  });

  it("two reissues of the same Tagihan at once: one replaces it, the other is refused", async () => {
    const setup = await billingWithOperatorSettings(db);
    const original = await issued(setup);
    const lines = original.lines.map((line) => ({ ...line }));

    const results = await Promise.all([
      setup.billing.reissueTagihan(original.id, { lines }),
      setup.billing.reissueTagihan(original.id, { lines }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await setup.billing.tagihan(original.id)).toMatchObject({ status: "dibatalkan" });
    const berlaku = await setup.billing.tagihanBerlaku(original.id);
    expect(berlaku).toMatchObject({ status: "belum_dibayar", replacesNomorTagihan: "TGH/2026/000001" });
    expect(await setup.billing.rantaiTagihan(berlaku!.id)).toEqual([berlaku!.id, original.id]);
  });

  it("the lapse tick and the Lewat Jatuh Tempo tick running together at the deadline leave a pay-first Tagihan Dibatalkan once", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    await Promise.all([
      lapsePayFirstTagihanTick({ db }, wib("2026-10-03 09:00")),
      lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-03 09:00")),
      lapsePayFirstTagihanTick({ db }, wib("2026-10-03 09:00")),
    ]);

    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "dibatalkan" });
  });
});

describe("a payment for a Tagihan that was cancelled by hand (UAT penuh, worst case)", () => {
  it("a 'paid' webhook after the order was cancelled does not make the Tagihan Lunas and is a Pembayaran Perlu Ditinjau", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const bayar = await setup.billing.bayar(tagihan.link);
    if (!bayar.ok) throw new Error(`Bayar refused: ${bayar.reason}`);
    const payment = setup.payments.created.at(-1)!;
    const dibatalkan = await setup.billing.batalkanTagihan(tagihan.id, { alasan: "pemesanan_dibatalkan" });
    expect(dibatalkan).toMatchObject({ ok: true });

    const received = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));

    expect(received).toMatchObject({ ok: true, outcome: "perlu_ditinjau" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "dibatalkan" });
    expect(await setup.billing.pembayaranPerluDitinjau()).toHaveLength(1);
  });

  it("an Admin cancelling while the 'paid' webhook arrives ends in one readable state: Lunas, or Dibatalkan with the payment to review", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const bayar = await setup.billing.bayar(tagihan.link);
    if (!bayar.ok) throw new Error(`Bayar refused: ${bayar.reason}`);
    const payment = setup.payments.created.at(-1)!;

    const [batal, webhook] = await Promise.all([
      setup.billing.batalkanTagihan(tagihan.id, { alasan: "pemesanan_dibatalkan" }),
      setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid")),
    ]);

    const akhir = await setup.billing.tagihan(tagihan.id);
    const ditinjau = await setup.billing.pembayaranPerluDitinjau();
    if (akhir?.status === "lunas") {
      expect(webhook).toMatchObject({ ok: true, outcome: "lunas" });
      expect(ditinjau).toHaveLength(0);
    } else {
      expect(akhir).toMatchObject({ status: "dibatalkan" });
      expect(batal).toMatchObject({ ok: true });
      expect(ditinjau).toHaveLength(1);
    }
  });
});
