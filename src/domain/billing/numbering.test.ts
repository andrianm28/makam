import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import type { IssueTagihanInput } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const layananOrder: IssueTagihanInput = {
  moment: { kind: "layanan" },
  addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
  nomorPemesanan: null,
  placeName: "TPU Tanah Kusir",
  lines: [
    {
      kind: "layanan",
      label: "Bunga Tabur",
      amount: 250_000 as Rupiah,
      provider: { kind: "operator" },
      targetDate: "2027-02-20",
      leadTimeDays: 2,
    },
  ],
};

describe("document numbering", () => {
  it("Nomor Tagihan are sequential within a year: TGH/2026/000001, TGH/2026/000002, …", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    const numbers = [];
    for (let i = 0; i < 3; i++) {
      const issued = await billing.issueTagihan(layananOrder);
      numbers.push(issued.ok && issued.tagihan.nomorTagihan);
    }

    expect(numbers).toEqual(["TGH/2026/000001", "TGH/2026/000002", "TGH/2026/000003"]);
  });

  it("each document type has its own series per year, and Nomor Pemesanan is one series MKM-2026-000123 for every order kind", async () => {
    const { billing } = await billingWithOperatorSettings(db);
    await billing.issueTagihan(layananOrder);

    expect(await billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000001");
    expect(await billing.nextDocumentNumber("RFD")).toBe("RFD/2026/000001");
    expect(await billing.nextDocumentNumber("BKP")).toBe("BKP/2026/000001");
    expect(await billing.nextDocumentNumber("BPM")).toBe("BPM/2026/000001");
    expect(await billing.nextDocumentNumber("BPP")).toBe("BPP/2026/000001");
    expect(await billing.nextDocumentNumber("BPM")).toBe("BPM/2026/000002");
    expect(await billing.nextDocumentNumber("TGH")).toBe("TGH/2026/000002");
    expect(await billing.nextNomorPemesanan()).toBe("MKM-2026-000001");
    expect(await billing.nextNomorPemesanan()).toBe("MKM-2026-000002");
  });

  it("the series start again at 000001 with the new year in WIB", async () => {
    const { billing, clock } = await billingWithOperatorSettings(db);
    clock.set(wib("2026-12-31 23:59"));
    await billing.issueTagihan(layananOrder);
    await billing.issueTagihan(layananOrder);
    expect(await billing.nextNomorPemesanan()).toBe("MKM-2026-000001");

    clock.set(wib("2027-01-01 00:00"));
    const first2027 = await billing.issueTagihan(layananOrder);

    expect(first2027).toMatchObject({ ok: true, tagihan: { nomorTagihan: "TGH/2027/000001" } });
    expect(await billing.nextNomorPemesanan()).toBe("MKM-2027-000001");
  });

  it("Tagihan issued at the same time get every number once, with no gaps", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    const issued = await Promise.all(Array.from({ length: 16 }, () => billing.issueTagihan(layananOrder)));

    const numbers = issued.map((result) => (result.ok ? result.tagihan.nomorTagihan : result.reason)).sort();
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, i) => `TGH/2026/${String(i + 1).padStart(6, "0")}`));
  });

  it("a number taken in a transaction that rolls back is given back, so the series stays gap-free", async () => {
    const { billing } = await billingWithOperatorSettings(db);

    await expect(
      db.transaction(async (tx) => {
        expect(await billing.within(tx).nextNomorPemesanan()).toBe("MKM-2026-000001");
        throw new Error("the order is not kept");
      }),
    ).rejects.toThrow("the order is not kept");

    expect(await billing.nextNomorPemesanan()).toBe("MKM-2026-000001");
  });
});
