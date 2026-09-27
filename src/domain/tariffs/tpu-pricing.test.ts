import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { signedInAdminPlatform, tariffsOnTestDatabase, type TariffsSetup } from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const at = wib("2026-10-05 09:00");

/**
 * The three global tariffs a TPU order is made of, in force from 1 October
 * 2026, odd amounts so a wrong sum cannot hide behind round numbers. The
 * Biaya Layanan Platform is entered too: a TPU must never be charged it.
 */
async function tpuPricesEntered(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const enter = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await enter("biaya_pengurusan_pemakaman", 1_750_000);
  await enter("biaya_pengurusan_berkas", 750_000);
  await enter("retribusi_pemda_iptm", 0);
  await enter("biaya_layanan_platform", 150_001);
  return admin;
}

describe("the TPU prices the public page and a TPU card show", () => {
  it("are the two Biaya Pengurusan amounts and the Retribusi Pemda as their own line, none of them a Biaya Layanan Platform", async () => {
    const setup = tariffsOnTestDatabase(db);
    await tpuPricesEntered(setup);

    const pricing = await setup.tariffs.tpuPricing(at);

    expect(pricing.pengurusanPemakaman?.total).toBe(1_750_000);
    expect(pricing.pengurusanBerkas?.total).toBe(750_000);
    // The Retribusi Pemda is a line of its own, shown as Rp 0 where the Pemda charges nothing.
    expect(pricing.retribusiIptm).toMatchObject({ total: 0, lines: [{ kind: "retribusi_pemda", amount: 0, provider: { kind: "pemda" } }] });
    for (const box of [pricing.pengurusanPemakaman, pricing.pengurusanBerkas, pricing.retribusiIptm]) {
      expect(box?.lines.map((line) => line.kind)).not.toContain("biaya_layanan_platform");
    }
  });

  it("a TPU card's starting price is the burial Biaya Pengurusan plus the Retribusi Pemda, and still no platform fee", async () => {
    const setup = tariffsOnTestDatabase(db);
    const admin = await tpuPricesEntered(setup);
    await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 250_000, effectiveOn: "2026-10-01", reason: null });

    const pricing = await setup.tariffs.tpuPricing(at);

    expect(pricing.mulaiDari).toBe(1_750_000 + 250_000);
    const quote = await setup.tariffs.quote(
      [{ kind: "biaya_pengurusan", pengurusan: "pemakaman" }, { kind: "retribusi_pemda", retribusi: "iptm" }],
      at,
    );
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.total).toBe(pricing.mulaiDari);
    expect(quote.lines.map((line) => line.kind)).toEqual(["biaya_pengurusan", "retribusi_pemda"]);
  });

  it("shows nothing for a tariff Admin Platform has not entered yet", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_pengurusan_pemakaman", amount: 1_750_000, effectiveOn: "2026-10-01", reason: null });

    const pricing = await setup.tariffs.tpuPricing(at);

    expect(pricing.pengurusanPemakaman?.total).toBe(1_750_000);
    expect(pricing.pengurusanBerkas).toBeNull();
    expect(pricing.retribusiIptm).toBeNull();
    // "mulai Rp X" needs both lines of a burial, so it stays off until they are.
    expect(pricing.mulaiDari).toBeNull();
  });

  it("carries each line's own effective date, so the page can say when a price changed", async () => {
    const setup = tariffsOnTestDatabase(db);
    await tpuPricesEntered(setup);

    const pricing = await setup.tariffs.tpuPricing(at);

    expect(pricing.pengurusanPemakaman).toMatchObject({ inForceSince: "2026-10-01", scheduledChange: null });
    expect(pricing.pengurusanBerkas).toMatchObject({ inForceSince: "2026-10-01", scheduledChange: null });
  });
});
