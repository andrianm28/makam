/**
 * Declaring a chased Tagihan Tidak Tertagih (spec, Billing > Chasing: "Tidak
 * Tertagih declared by hand from H+30 after at least one logged call"; ticket
 * 29's AC 4). The guard is `declareTidakTertagih`'s own: H+30 of the overdue
 * anchor, and a call already logged (`hasLoggedCall`, composed from
 * Notifications' `teleponPemesanTercatat` at runtime, faked here).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { tagihan as tagihanTable } from "@/domain/billing/schema";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { billingWithOperatorSettings } from "../../../tests/support/billing";
import { perpanjanganCheckout } from "../../../tests/support/notifications-messages";
import type { Rupiah } from "@/lib/rupiah";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;
/** A Saat Duka Tagihan's own line shape (KINDS_YANG_BISA_DITAGIH), whose `lokasi_mitra` provider is what `lokasiIdOf` reads. */
const SAAT_DUKA_LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000002", name: "Taman Makam Contoh" } as const;

/** A Lewat Jatuh Tempo Saat Duka Tagihan, its anchor set directly (a stand-in for `setOverdueAnchor` + the tick, both ticket 25's). */
async function tagihanLewatJatuhTempo(setup: Awaited<ReturnType<typeof billingWithOperatorSettings>>, anchorAt: Date) {
  const issued = await setup.billing.issueTagihan(
    perpanjanganCheckout({
      moment: { kind: "saat_duka", burialAt: anchorAt, paymentWindowHours: 72 },
      lines: [
        { kind: "harga_hak_pakai", label: "Harga Hak Pakai", amount: rp(3_000_000), provider: SAAT_DUKA_LOKASI },
        { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
      ],
    }),
  );
  if (!issued.ok) throw new Error(`Tagihan refused: ${issued.reason}`);
  await db
    .update(tagihanTable)
    .set({ status: "lewat_jatuh_tempo", lewatJatuhTempoAt: anchorAt })
    .where(eq(tagihanTable.id, issued.tagihan.id));
  return issued.tagihan;
}

describe("declareTidakTertagih: Chasing's own guard", () => {
  it("is rejected before H+30 of the overdue anchor, even with a call already logged", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const anchor = wib("2026-10-01 08:00");
    const tagihan = await tagihanLewatJatuhTempo(setup, anchor);
    setup.clock.set(wib("2026-10-30 08:00")); // H+29
    const declared = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(declared).toMatchObject({ ok: false, reason: "belum_h30" });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "lewat_jatuh_tempo" });
  });

  it("is rejected at H+30 with no logged call", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => false });
    const anchor = wib("2026-10-01 08:00");
    const tagihan = await tagihanLewatJatuhTempo(setup, anchor);
    setup.clock.set(wib("2026-10-31 08:00")); // H+30
    const declared = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(declared).toMatchObject({ ok: false, reason: "belum_ada_panggilan" });
  });

  it("succeeds at H+30 with a call logged, and stays payable afterwards", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const anchor = wib("2026-10-01 08:00");
    const tagihan = await tagihanLewatJatuhTempo(setup, anchor);
    setup.clock.set(wib("2026-10-31 08:00")); // exactly H+30
    const declared = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(declared).toMatchObject({ ok: true, tagihan: { status: "tidak_tertagih" } });
    expect(await setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "tidak_tertagih" });

    // Still payable: Bayar and recordPayment refuse nothing new for this status.
    const paid = await setup.billing.recordPayment(tagihan.id, { method: { kind: "transfer_manual" }, reference: null });
    expect(paid.ok).toBe(true);
  });

  it("counts in the Laporan of the month it was declared, not the month it lapsed, and drops out again once it is paid (ticket 33)", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const tagihan = await tagihanLewatJatuhTempo(setup, wib("2026-09-20 08:00"));
    const bulan = (dari: string, sampai: string) => setup.billing.laporan({ dari: wib(dari), sampai: wib(sampai) });

    // H+30 of 20 September is 20 Oktober; Admin Platform gives up on 2 November (WIB).
    setup.clock.set(wib("2026-11-02 08:00"));
    expect((await setup.billing.declareTidakTertagih(tagihan.id)).ok).toBe(true);

    expect((await bulan("2026-11-01", "2026-12-01")).tidakTertagih).toEqual({ jumlah: 1, amount: 3_150_000 });
    expect((await bulan("2026-10-01", "2026-11-01")).tidakTertagih).toEqual({ jumlah: 0, amount: 0 });

    // It stays payable; once paid it is Lunas and no longer given up on.
    expect((await setup.billing.recordPayment(tagihan.id, { method: { kind: "transfer_manual" }, reference: null })).ok).toBe(true);
    expect((await bulan("2026-11-01", "2026-12-01")).tidakTertagih).toEqual({ jumlah: 0, amount: 0 });
  });

  it("is dated from H+30 of its overdue anchor in the Laporan when it was declared before the declaration date was kept (ticket 33)", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const tagihan = await tagihanLewatJatuhTempo(setup, wib("2026-09-20 08:00"));
    setup.clock.set(wib("2026-11-02 08:00"));
    await setup.billing.declareTidakTertagih(tagihan.id);
    // A row from the release before: declared, but with no declaration date on record.
    await db.update(tagihanTable).set({ tidakTertagihAt: null }).where(eq(tagihanTable.id, tagihan.id));

    const oktober = await setup.billing.laporan({ dari: wib("2026-10-01"), sampai: wib("2026-11-01") });
    const november = await setup.billing.laporan({ dari: wib("2026-11-01"), sampai: wib("2026-12-01") });

    expect(oktober.tidakTertagih.jumlah).toBe(1);
    expect(november.tidakTertagih.jumlah).toBe(0);
  });

  it("is idempotent: declaring an already Tidak Tertagih Tagihan again is a no-op that still succeeds", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const anchor = wib("2026-10-01 08:00");
    const tagihan = await tagihanLewatJatuhTempo(setup, anchor);
    setup.clock.set(wib("2026-10-31 08:00"));
    const first = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(first.ok).toBe(true);
    const second = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(second).toMatchObject({ ok: true, tagihan: { status: "tidak_tertagih" } });
  });

  it("is rejected for a Tagihan never Lewat Jatuh Tempo (still Belum Dibayar, or a pay-first kind)", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const belumDibayar = await setup.billing.issueTagihan(perpanjanganCheckout());
    if (!belumDibayar.ok) throw new Error("refused");
    const declared = await setup.billing.declareTidakTertagih(belumDibayar.tagihan.id);
    expect(declared).toMatchObject({ ok: false, reason: "tagihan_tidak_lewat_jatuh_tempo" });
  });

  it("without `hasLoggedCall` wired at all, nothing can ever be declared (the safe default)", async () => {
    const setup = await billingWithOperatorSettings(db);
    const anchor = wib("2026-10-01 08:00");
    const tagihan = await tagihanLewatJatuhTempo(setup, anchor);
    setup.clock.set(wib("2026-11-15 08:00"));
    const declared = await setup.billing.declareTidakTertagih(tagihan.id);
    expect(declared).toMatchObject({ ok: false, reason: "belum_ada_panggilan" });
  });
});

describe("Chasing's overdue reads", () => {
  it("payAfterAnchored lists every pay-after Tagihan with an anchor, whatever its status; tagihanLewatJatuhTempo only Lewat Jatuh Tempo and Tidak Tertagih", async () => {
    const setup = await billingWithOperatorSettings(db, { hasLoggedCall: async () => true });
    const belumLewat = await setup.billing.issueTagihan(
      perpanjanganCheckout({ moment: { kind: "saat_duka", burialAt: wib("2026-10-10 08:00"), paymentWindowHours: 72 } }),
    );
    if (!belumLewat.ok) throw new Error("refused");
    // Anchored (the burial was recorded) but its payment window has not passed yet: still Belum Dibayar.
    await setup.billing.setOverdueAnchor(belumLewat.tagihan.id, wib("2026-10-10 08:00"));
    const lewat = await tagihanLewatJatuhTempo(setup, wib("2026-10-01 08:00"));

    const anchored = await setup.billing.payAfterAnchored();
    expect(anchored.map((t) => t.id).sort()).toEqual([belumLewat.tagihan.id, lewat.id].sort());

    const overdue = await setup.billing.tagihanLewatJatuhTempo();
    expect(overdue.map((t) => t.id)).toEqual([lewat.id]);
    expect(overdue[0]).toMatchObject({ lokasiId: expect.any(String), status: "lewat_jatuh_tempo" });
  });
});
