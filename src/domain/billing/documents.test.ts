import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings, PENGATURAN_OPERATOR, TEST_DOCUMENT_ORIGIN } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lapsePayFirstTagihanTick, type IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

const terencana: IssueTagihanInput = {
  moment: { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") },
  addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
  nomorPemesanan: "MKM-2026-000001",
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [
    { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI },
    { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
  ],
};

async function issued(setup: Awaited<ReturnType<typeof billingWithOperatorSettings>>) {
  const result = await setup.billing.issueTagihan(terencana);
  if (!result.ok) throw new Error(`not issued: ${result.reason}`);
  return result.tagihan;
}

describe("the Tagihan page", () => {
  it("is found by its unguessable link; any other link finds nothing", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    expect(await setup.billing.documentByLink(tagihan.link)).toEqual({ type: "tagihan", tagihan, buktiLink: null, notPayableBecause: null });
    expect(await setup.billing.documentByLink("x".repeat(43))).toBeNull();
    expect(await setup.billing.documentByLink("TGH/2026/000001")).toBeNull();
  });

  it("Unduh PDF renders the Tagihan's own page through the PdfRenderer, named after its Nomor Tagihan", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const pdf = await setup.billing.documentPdf(tagihan.link);

    expect(pdf).toMatchObject({ fileName: "TGH-2026-000001.pdf" });
    expect(new TextDecoder().decode(pdf?.bytes.slice(0, 5))).toBe("%PDF-");
    expect(setup.pdf.rendered).toEqual([{ url: `${TEST_DOCUMENT_ORIGIN}/dokumen/${tagihan.link}` }]);
  });

  it("an unknown link renders no PDF", async () => {
    const setup = await billingWithOperatorSettings(db);

    expect(await setup.billing.documentPdf("x".repeat(43))).toBeNull();
    expect(setup.pdf.rendered).toEqual([]);
  });
});

describe("Bukti Pembayaran", () => {
  it("a paid Tagihan is Lunas and gets one Bukti Pembayaran repeating its lines, with amount, method, time, reference and Nomor Tagihan", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.set(wib("2026-10-01 16:45"));

    const paid = await setup.billing.recordPayment(tagihan.id, {
      method: { kind: "penyedia_pembayaran", channel: "QRIS" },
      reference: "SP-7781234",
    });

    expect(paid).toMatchObject({
      ok: true,
      bukti: {
        nomorBukti: "BYR/2026/000001",
        paidAt: wib("2026-10-01 16:45"),
        amount: 5_150_000,
        method: { kind: "penyedia_pembayaran", channel: "QRIS" },
        reference: "SP-7781234",
        header: {
          legalName: PENGATURAN_OPERATOR.legalName,
          address: PENGATURAN_OPERATOR.address,
          phone: PENGATURAN_OPERATOR.phone,
          email: PENGATURAN_OPERATOR.email,
        },
        tagihan: { nomorTagihan: "TGH/2026/000001", status: "lunas", lines: tagihan.lines, total: 5_150_000 },
      },
    });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("a Lunas Tagihan's page leads to its Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error("not paid");

    expect(await setup.billing.documentByLink(tagihan.link)).toMatchObject({ type: "tagihan", buktiLink: paid.bukti.link, notPayableBecause: "sudah_lunas" });
  });

  it("is found by its own unguessable link and downloads as a PDF named after its number", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error("not paid");

    expect(paid.bukti.link).not.toBe(tagihan.link);
    expect(await setup.billing.documentByLink(paid.bukti.link)).toEqual({ type: "bukti_pembayaran", bukti: paid.bukti });
    expect(await setup.billing.documentPdf(paid.bukti.link)).toMatchObject({ fileName: "BYR-2026-000001.pdf" });
    expect(setup.pdf.rendered).toEqual([{ url: `${TEST_DOCUMENT_ORIGIN}/dokumen/${paid.bukti.link}` }]);
  });

  it("recording the same payment twice issues no second Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    const payment = { method: { kind: "penyedia_pembayaran", channel: "VA BCA" }, reference: "SP-1" } as const;

    const first = await setup.billing.recordPayment(tagihan.id, payment);
    const second = await setup.billing.recordPayment(tagihan.id, payment);

    expect(second).toEqual(first);
    expect(await setup.billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
  });

  it("a lapsed (Dibatalkan) Tagihan cannot be paid; a Lunas one is never lapsed nor reissued", async () => {
    const setup = await billingWithOperatorSettings(db);
    const lapsed = await issued(setup);
    const paid = await issued(setup);
    await setup.billing.recordPayment(paid.id, { method: { kind: "transfer_manual" }, reference: null });

    await lapsePayFirstTagihanTick({ db }, wib("2026-10-02 09:00"));

    expect(await setup.billing.recordPayment(lapsed.id, { method: { kind: "tunai" }, reference: null })).toEqual({
      ok: false,
      reason: "tagihan_dibatalkan",
    });
    expect(await setup.billing.tagihan(paid.id)).toMatchObject({ status: "lunas" });
    expect(await setup.billing.reissueTagihan(paid.id, { lines: terencana.lines })).toEqual({
      ok: false,
      reason: "tagihan_tidak_bisa_diganti",
    });
  });

  it("a Rp 0 Tagihan (Harga Khusus waiver) is Lunas at once, with its Bukti Pembayaran 'Tanpa pembayaran (Harga Khusus)', and never lapses", async () => {
    const setup = await billingWithOperatorSettings(db);

    const waived = await setup.billing.issueTagihan({
      ...terencana,
      lines: [...terencana.lines, { kind: "penyesuaian_harga_khusus", amount: rp(5_150_000) }],
    });

    expect(waived).toMatchObject({ ok: true, tagihan: { total: 0, status: "lunas" } });
    if (!waived.ok) return;
    expect(await setup.billing.recordPayment(waived.tagihan.id, { method: { kind: "tunai" }, reference: null })).toMatchObject({
      ok: true,
      bukti: { nomorBukti: "BYR/2026/000001", amount: 0, method: { kind: "tanpa_pembayaran" }, paidAt: setup.clock.now() },
    });
    await lapsePayFirstTagihanTick({ db }, wib("2026-10-05 09:00"));
    expect(await setup.billing.tagihan(waived.tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("a reissue whose Harga Khusus brings the total to Rp 0 is Lunas at once with its Bukti Pembayaran", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);

    const reissued = await setup.billing.reissueTagihan(tagihan.id, {
      lines: [...terencana.lines, { kind: "penyesuaian_harga_khusus", amount: rp(5_150_000) }],
    });

    expect(reissued).toMatchObject({ ok: true, tagihan: { total: 0, status: "lunas" }, cancelled: { status: "dibatalkan" } });
    if (!reissued.ok) return;
    expect(await setup.billing.recordPayment(reissued.tagihan.id, { method: { kind: "tunai" }, reference: null })).toMatchObject({
      bukti: { method: { kind: "tanpa_pembayaran" }, tagihan: { nomorTagihan: "TGH/2026/000002" } },
    });
  });

  it("a Bukti Pembayaran is headed with the Operator values in force when it was issued, not the Tagihan's", async () => {
    const setup = await billingWithOperatorSettings(db);
    const tagihan = await issued(setup);
    setup.clock.advance({ hours: 2 });
    await setup.operatorSettings.change(setup.adminPlatform, { ...PENGATURAN_OPERATOR, phone: "(021) 555-0199", reason: null });

    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });

    expect(paid).toMatchObject({ ok: true, bukti: { header: { phone: "(021) 555-0199" }, tagihan: { header: { phone: "(021) 555-0101" } } } });
  });
});
