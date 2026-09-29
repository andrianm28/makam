import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { Rupiah } from "@/lib/rupiah";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { billingOnTestDatabase, billingWithOperatorSettings, PENGATURAN_OPERATOR } from "../../../tests/support/billing";
import type { IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;

/** A Saat Duka checkout at a Lokasi Mitra: Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform. */
function saatDukaCheckout(overrides: Partial<IssueTagihanInput> = {}): IssueTagihanInput {
  return {
    moment: { kind: "saat_duka", burialAt: wib("2026-10-02 10:00"), paymentWindowHours: 72 },
    addressee: { name: "Siti Rahmawati", phoneNumber: "0812-3456-7890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: "Makam Wakaf Al-Ikhlas",
    lines: [
      { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI },
      { kind: "biaya_pemakaman", label: "Biaya Pemakaman", amount: rp(1_500_000), provider: LOKASI },
      { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
    ],
    ...overrides,
  };
}

describe("issuing a Tagihan", () => {
  it("a new Tagihan is Belum Dibayar, numbered TGH/2026/000001, addressed to the Pemesan, with its lines, total and due date", async () => {
    const { billing, clock } = await billingWithOperatorSettings(db);
    clock.set(wib("2026-10-01 21:00"));

    const issued = await billing.issueTagihan(saatDukaCheckout());

    expect(issued).toMatchObject({ ok: true });
    if (!issued.ok) return;
    expect(await billing.tagihan(issued.tagihan.id)).toEqual({
      id: issued.tagihan.id,
      nomorTagihan: "TGH/2026/000001",
      status: "belum_dibayar",
      kind: "pay_after",
      issuedAt: wib("2026-10-01 21:00"),
      dueAt: wib("2026-10-05 10:00"),
      addressee: { role: "pemesan", name: "Siti Rahmawati", phoneNumber: "+6281234567890", accountId: null },
      nomorPemesanan: "MKM-2026-000001",
      placeName: "Makam Wakaf Al-Ikhlas",
      // Nothing has been asked back, and asking is a cancellation's own doing (ticket 24).
      pengembalianDiminta: null,
      lines: [
        { kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: 5_000_000, provider: LOKASI },
        { kind: "biaya_pemakaman", label: "Biaya Pemakaman", amount: 1_500_000, provider: LOKASI },
        { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: 150_000, provider: { kind: "operator" } },
      ],
      total: 6_650_000,
      header: {
        legalName: "PT Jaya Korpora Prima",
        address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
        phone: "(021) 555-0101",
        email: "halo@makam.co.id",
      },
      link: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      replacesNomorTagihan: null,
      replacedByNomorTagihan: null,
      cancelledReason: null,
      hargaKhususPorsiMitra: null,
    });
  });

  it("a Perpanjangan Tagihan is addressed to the Pemegang Hak", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    const issued = await billing.issueTagihan({
      moment: { kind: "perpanjangan" },
      addressee: { name: "Ahmad Fauzi", phoneNumber: "081298765432", accountId: "akun-pemegang-hak" },
      nomorPemesanan: null,
      placeName: "Makam Wakaf Al-Ikhlas",
      lines: [
        { kind: "perpanjangan", label: "Perpanjangan Makam – Makam Standar (1 × 5 tahun)", amount: rp(750_000), provider: LOKASI },
        { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
      ],
    });

    expect(issued).toMatchObject({
      ok: true,
      tagihan: {
        kind: "pay_first",
        addressee: { role: "pemegang_hak", name: "Ahmad Fauzi", phoneNumber: "+6281298765432", accountId: "akun-pemegang-hak" },
      },
    });
  });

  it("a Harga Khusus appears as its own negative Penyesuaian Harga Khusus line, lowering the total", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const checkout = saatDukaCheckout();

    const issued = await billing.issueTagihan({
      ...checkout,
      lines: [...checkout.lines, { kind: "penyesuaian_harga_khusus", amount: rp(2_000_000) }],
    });

    expect(issued).toMatchObject({ ok: true, tagihan: { total: 4_650_000 } });
    if (!issued.ok) return;
    expect(issued.tagihan.lines.at(-1)).toEqual({
      kind: "penyesuaian_harga_khusus",
      label: "Penyesuaian Harga Khusus",
      amount: -2_000_000,
      provider: { kind: "operator" },
    });
  });

  it("a Harga Khusus may bring the total to Rp 0 but never below", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const checkout = saatDukaCheckout();

    expect(
      await billing.issueTagihan({ ...checkout, lines: [...checkout.lines, { kind: "penyesuaian_harga_khusus", amount: rp(6_650_000) }] }),
    ).toMatchObject({ ok: true, tagihan: { total: 0 } });
    expect(
      await billing.issueTagihan({ ...checkout, lines: [...checkout.lines, { kind: "penyesuaian_harga_khusus", amount: rp(6_650_001) }] }),
    ).toEqual({ ok: false, reason: "harga_khusus_melebihi_total" });
  });

  it("a Tagihan without lines, or with a malformed line, is refused", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    expect(await billing.issueTagihan(saatDukaCheckout({ lines: [] }))).toEqual({ ok: false, reason: "baris_tidak_valid" });
    expect(
      await billing.issueTagihan(saatDukaCheckout({ lines: [{ kind: "biaya_pemakaman", label: "Biaya Pemakaman", amount: rp(-5), provider: LOKASI }] })),
    ).toEqual({ ok: false, reason: "baris_tidak_valid" });
    expect(
      await billing.issueTagihan({
        ...saatDukaCheckout(),
        moment: { kind: "layanan" },
        lines: [{ kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } }],
      }),
    ).toEqual({ ok: false, reason: "baris_tidak_valid" });
  });

  it("no Tagihan is issued before Admin Platform has entered Pengaturan Operator: it would have no Operator header", async () => {
    const { billing } = billingOnTestDatabase(db);

    expect(await billing.issueTagihan(saatDukaCheckout())).toEqual({ ok: false, reason: "pengaturan_operator_belum_diisi" });
  });

  it("an issued Tagihan keeps the Operator header in force at issue; one issued after a change carries the new values", async () => {
    const { billing, operatorSettings, adminPlatform, clock } = await billingWithOperatorSettings(db);
    const before = await billing.issueTagihan(saatDukaCheckout());

    clock.advance({ days: 1 });
    await operatorSettings.change(adminPlatform, {
      ...PENGATURAN_OPERATOR,
      address: "Jl. Kantor Baru No. 9, Jakarta Pusat 10110",
      reason: "Kantor pindah",
    });
    const after = await billing.issueTagihan(saatDukaCheckout());

    if (!before.ok || !after.ok) throw new Error("not issued");
    expect((await billing.tagihan(before.tagihan.id))?.header.address).toBe("Jl. Contoh No. 1, Jakarta Selatan 12345");
    expect((await billing.tagihan(after.tagihan.id))?.header.address).toBe("Jl. Kantor Baru No. 9, Jakarta Pusat 10110");
  });
});

describe("an issued Tagihan is immutable", () => {
  it("Billing offers no way to change an issued Tagihan's lines: only issue, cancel and reissue, cancel, payment and reads", () => {
    const billing = billingOnTestDatabase(db).billing;

    expect(Object.keys(billing).sort()).toEqual([
      // The Bukti Pemesanan is a document, not a line: it adds no way to change an
      // issued Tagihan either, and is idempotent by the order it names (ticket 25).
      "allBuktiPemesanan",
      // Cancelling a Tagihan never changes its lines either: it ends the bill and
      // records what is owed back, which is the cancellation's own rule (ticket 24).
      "batalkanTagihan",
      "bayar",
      "buktiPemesananById",
      // A read by Nomor Tagihan or Nomor Pemesanan, for staff opening one by hand (ticket 30).
      "cariTagihan",
      // The manual and direct payment paths (ticket 30): both settle through
      // `recordPayment` and record their own Entri Audit, never a line change.
      "catatPembayaranLangsung",
      "catatPembayaranManual",
      "documentByLink",
      "documentPdf",
      "issueBuktiPemesanan",
      "issueTagihan",
      "nextDocumentNumber",
      "nextNomorPemesanan",
      "pembayaranPerluDitinjau",
      "receivePaymentWebhook",
      "recordPayment",
      "reissueTagihan",
      // The pay-after overdue clock, counted from the recorded burial: it sets a
      // column of the Tagihan, never a line, and never the due date it was issued with.
      "setOverdueAnchor",
      "tagihan",
      // A read of every Lunas Tagihan carrying a non-zero Retribusi Pemda line:
      // the Tier 3 "Setor Retribusi" row is a projection of it (ticket 45).
      "tagihanRetribusiLunas",
      // A Harga Khusus (ticket 30) is `reissueTagihan` plus a negative line: a
      // cancel-and-reissue, never a line change on the Tagihan it replaces.
      "tetapkanHargaKhusus",
      "within",
    ]);
  });

  it("a Tagihan reads back exactly as issued, whatever happens to it: paid, reissued or lapsed, only its status moves", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const paid = await billing.issueTagihan(saatDukaCheckout());
    const reissued = await billing.issueTagihan(saatDukaCheckout());
    if (!paid.ok || !reissued.ok) throw new Error("not issued");

    await billing.recordPayment(paid.tagihan.id, { method: { kind: "tunai" }, reference: null });
    await billing.reissueTagihan(reissued.tagihan.id, { lines: saatDukaCheckout().lines.slice(0, 1) });

    expect(await billing.tagihan(paid.tagihan.id)).toEqual({ ...paid.tagihan, status: "lunas" });
    expect(await billing.tagihan(reissued.tagihan.id)).toEqual({
      ...reissued.tagihan,
      status: "dibatalkan",
      cancelledReason: "diganti",
      replacedByNomorTagihan: "TGH/2026/000003",
    });
  });

  it("cancel-and-reissue: the Tagihan is Dibatalkan and replaced by a new one with a new Nomor Tagihan and the new lines", async () => {
    const { billing, clock } = await billingWithOperatorSettings(db);
    clock.set(wib("2026-10-01 21:00"));
    const original = await billing.issueTagihan(saatDukaCheckout());
    if (!original.ok) throw new Error("not issued");

    clock.set(wib("2026-10-03 08:00"));
    const reissued = await billing.reissueTagihan(original.tagihan.id, {
      lines: [...saatDukaCheckout().lines, { kind: "penyesuaian_harga_khusus", amount: rp(1_000_000) }],
    });

    expect(reissued).toMatchObject({
      ok: true,
      tagihan: {
        nomorTagihan: "TGH/2026/000002",
        status: "belum_dibayar",
        issuedAt: wib("2026-10-03 08:00"),
        dueAt: wib("2026-10-05 10:00"),
        total: 5_650_000,
        nomorPemesanan: "MKM-2026-000001",
        addressee: { role: "pemesan", name: "Siti Rahmawati", phoneNumber: "+6281234567890" },
        replacesNomorTagihan: "TGH/2026/000001",
      },
    });
    if (!reissued.ok) return;
    expect(reissued.tagihan.link).not.toBe(original.tagihan.link);
    expect(await billing.tagihan(original.tagihan.id)).toEqual({
      ...original.tagihan,
      status: "dibatalkan",
      cancelledReason: "diganti",
      replacedByNomorTagihan: "TGH/2026/000002",
    });
  });

  it("a reissue never extends the time to pay: a pay-first Tagihan's replacement keeps the original due date", async () => {
    const { billing, clock } = await billingWithOperatorSettings(db);
    clock.set(wib("2026-10-01 10:00"));
    const perpanjangan = {
      moment: { kind: "perpanjangan" },
      addressee: { name: "Ahmad Fauzi", phoneNumber: "081298765432", accountId: null },
      nomorPemesanan: null,
      placeName: "Makam Wakaf Al-Ikhlas",
      lines: [{ kind: "perpanjangan", label: "Perpanjangan Makam", amount: rp(750_000), provider: LOKASI }],
    } satisfies IssueTagihanInput;
    const original = await billing.issueTagihan(perpanjangan);
    if (!original.ok) throw new Error("not issued");

    clock.set(wib("2026-10-03 10:00"));
    const reissued = await billing.reissueTagihan(original.tagihan.id, {
      lines: [...perpanjangan.lines, { kind: "penyesuaian_harga_khusus", amount: rp(250_000) }],
    });

    expect(reissued).toMatchObject({ ok: true, tagihan: { dueAt: wib("2026-10-04 10:00") } });
  });

  it("a pay-first Tagihan already past its due date cannot be reissued, even before the lapse tick has run (ticket 30: a reissue never revives a lapsed bill)", async () => {
    const { billing, clock } = await billingWithOperatorSettings(db);
    clock.set(wib("2026-10-01 10:00"));
    const perpanjangan = {
      moment: { kind: "perpanjangan" },
      addressee: { name: "Ahmad Fauzi", phoneNumber: "081298765432", accountId: null },
      nomorPemesanan: null,
      placeName: "Makam Wakaf Al-Ikhlas",
      lines: [{ kind: "perpanjangan", label: "Perpanjangan Makam", amount: rp(750_000), provider: LOKASI }],
    } satisfies IssueTagihanInput;
    const original = await billing.issueTagihan(perpanjangan);
    if (!original.ok) throw new Error("not issued");
    // Due 3×24 h after issue: exactly at the due date, before the lapse tick runs.
    clock.set(wib("2026-10-04 10:00"));

    expect(
      await billing.reissueTagihan(original.tagihan.id, {
        lines: [...perpanjangan.lines, { kind: "penyesuaian_harga_khusus", amount: rp(250_000) }],
      }),
    ).toEqual({ ok: false, reason: "tagihan_tidak_bisa_diganti" });
    expect(await billing.tagihan(original.tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("a Tagihan that is already Dibatalkan cannot be reissued, and an unknown one is not found", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const original = await billing.issueTagihan(saatDukaCheckout());
    if (!original.ok) throw new Error("not issued");
    await billing.reissueTagihan(original.tagihan.id, { lines: saatDukaCheckout().lines });

    expect(await billing.reissueTagihan(original.tagihan.id, { lines: saatDukaCheckout().lines })).toEqual({
      ok: false,
      reason: "tagihan_tidak_bisa_diganti",
    });
    expect(await billing.reissueTagihan("00000000-0000-4000-8000-000000000000", { lines: saatDukaCheckout().lines })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("a refused reissue changes nothing: the Tagihan stays Belum Dibayar and no number is used", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const original = await billing.issueTagihan(saatDukaCheckout());
    if (!original.ok) throw new Error("not issued");

    expect(
      await billing.reissueTagihan(original.tagihan.id, {
        lines: [...saatDukaCheckout().lines, { kind: "penyesuaian_harga_khusus", amount: rp(9_000_000) }],
      }),
    ).toEqual({ ok: false, reason: "harga_khusus_melebihi_total" });

    expect(await billing.tagihan(original.tagihan.id)).toEqual(original.tagihan);
    expect(await billing.issueTagihan(saatDukaCheckout())).toMatchObject({ tagihan: { nomorTagihan: "TGH/2026/000002" } });
  });
});

describe("the QRIS payment cap", () => {
  /** Bank Indonesia caps QRIS at Rp 10.000.000; v1 takes no order whose Tagihan would exceed it. */
  const overCapCheckout = (): IssueTagihanInput =>
    saatDukaCheckout({
      lines: [{ kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(10_000_001), provider: LOKASI }],
    });

  it("a Tagihan totalling exactly Rp 10.000.000, the QRIS cap, is issued", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const checkout = saatDukaCheckout({
      lines: [{ kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(10_000_000), provider: LOKASI }],
    });

    const issued = await billing.issueTagihan(checkout);

    expect(issued).toMatchObject({ ok: true, tagihan: { total: 10_000_000 } });
  });

  it("a Tagihan that would total Rp 10.000.001 is refused: v1 takes no order above the QRIS cap", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    expect(await billing.issueTagihan(overCapCheckout())).toEqual({ ok: false, reason: "melebihi_batas_qris" });
  });

  it("reissuing a Tagihan above the QRIS cap is refused the same way, and the original Tagihan is untouched", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const original = await billing.issueTagihan(saatDukaCheckout());
    if (!original.ok) throw new Error("not issued");

    expect(
      await billing.reissueTagihan(original.tagihan.id, { lines: overCapCheckout().lines }),
    ).toEqual({ ok: false, reason: "melebihi_batas_qris" });

    expect(await billing.tagihan(original.tagihan.id)).toEqual(original.tagihan);
  });
});

describe("cariTagihan: how staff find a Tagihan to open (ticket 30)", () => {
  it("finds a Tagihan by its Nomor Tagihan or its Nomor Pemesanan, newest first, and by a start of either", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const first = await billing.issueTagihan(saatDukaCheckout());
    if (!first.ok) throw new Error("not issued");

    for (const query of ["TGH/2026/000001", "tgh/2026/0000", "MKM-2026-000001"]) {
      expect(await billing.cariTagihan(query)).toMatchObject([
        { id: first.tagihan.id, nomorTagihan: "TGH/2026/000001", nomorPemesanan: "MKM-2026-000001", status: "belum_dibayar" },
      ]);
    }
  });

  it("finds nothing for a query too short to be a number, an unknown one, or a wildcard", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    await billing.issueTagihan(saatDukaCheckout());

    expect(await billing.cariTagihan("TG")).toEqual([]);
    expect(await billing.cariTagihan("TGH/2027")).toEqual([]);
    expect(await billing.cariTagihan("%%%")).toEqual([]);
  });

  it("a replaced Tagihan is still found beside the one that replaced it", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const original = await billing.issueTagihan(saatDukaCheckout());
    if (!original.ok) throw new Error("not issued");
    await billing.reissueTagihan(original.tagihan.id, { lines: saatDukaCheckout().lines });

    const found = await billing.cariTagihan("MKM-2026-000001");

    expect(found.map((row) => [row.nomorTagihan, row.status])).toEqual([
      ["TGH/2026/000002", "belum_dibayar"],
      ["TGH/2026/000001", "dibatalkan"],
    ]);
  });
});
