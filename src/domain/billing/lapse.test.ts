import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lapsePayFirstTagihanTick, type IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas" } as const;
const addressee = { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null };

const terencana: IssueTagihanInput = {
  moment: { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") },
  addressee,
  nomorPemesanan: "MKM-2026-000001",
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [{ kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI }],
};

const saatDuka: IssueTagihanInput = {
  moment: { kind: "saat_duka", burialAt: wib("2026-10-01 14:00"), paymentWindowHours: 72 },
  addressee,
  nomorPemesanan: "MKM-2026-000002",
  placeName: "Makam Wakaf Al-Ikhlas",
  lines: [{ kind: "harga_hak_pakai", label: "Harga Hak Pakai – Makam Standar", amount: rp(5_000_000), provider: LOKASI }],
};

describe("the lapse of unpaid pay-first Tagihan", () => {
  it("a Pemesanan Terencana Tagihan still Belum Dibayar lapses to Dibatalkan when its hold expires, not a minute before", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const issued = await billing.issueTagihan(terencana);
    if (!issued.ok) throw new Error("not issued");

    await lapsePayFirstTagihanTick({ db }, wib("2026-10-02 08:59"));
    expect(await billing.tagihan(issued.tagihan.id)).toMatchObject({ status: "belum_dibayar", cancelledReason: null });

    await lapsePayFirstTagihanTick({ db }, wib("2026-10-02 09:00"));
    expect(await billing.tagihan(issued.tagihan.id)).toMatchObject({
      status: "dibatalkan",
      cancelledReason: "batas_pembayaran_lewat",
    });
  });

  it("running the lapse tick again is harmless", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const issued = await billing.issueTagihan(terencana);
    if (!issued.ok) throw new Error("not issued");
    await lapsePayFirstTagihanTick({ db }, wib("2026-10-02 09:05"));
    const lapsed = await billing.tagihan(issued.tagihan.id);

    await lapsePayFirstTagihanTick({ db }, wib("2026-10-02 09:05"));
    await lapsePayFirstTagihanTick({ db }, wib("2026-10-03 12:00"));

    expect(await billing.tagihan(issued.tagihan.id)).toEqual(lapsed);
  });

  it("a pay-after Saat Duka Tagihan is never lapsed, however long past its due date", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    const issued = await billing.issueTagihan(saatDuka);
    if (!issued.ok) throw new Error("not issued");

    await lapsePayFirstTagihanTick({ db }, wib("2026-11-30 12:00"));

    expect(await billing.tagihan(issued.tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });
});
