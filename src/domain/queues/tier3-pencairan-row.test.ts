/**
 * The Antrean's Tier 3 "Pencairan" row and the counter strip's Pencairan count
 * (spec, Work Queues: "Tier 3: … Pencairan (2 working days after due)", story
 * 144; ticket 32's AC 6).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  adminLokasiOf,
  bayarTagihan,
  buktiTransfer,
  catatPemakaman,
  konfirmasiPesanan,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
} from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Two Lokasi Mitra with a transfer each waiting: two recipients, four items. */
async function duaPenerima() {
  const setup = payoutsOnTestDatabase(db);
  let admin = null;
  for (const [name, email] of [
    ["Makam Wakaf Al-Ikhlas", "pemesan.satu@contoh.id"],
    ["Makam Sawah Besar", "pemesan.dua@contoh.id"],
  ] as const) {
    const fixture = await pesananSaatDukaSiap(setup, { name, email });
    admin ??= fixture.admin;
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayarTagihan(setup, konfirmasi.tagihanId);
    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));
  }
  await setup.payouts.tick();
  if (!admin) throw new Error("no Admin Platform");
  return { setup, admin };
}

describe("the Antrean's Tier 3 Pencairan row", () => {
  it("is one row per recipient with the 2 Hari Kerja deadline, and the counter strip counts it", async () => {
    const { setup, admin } = await duaPenerima();

    const pencairan = (await setup.queues.antrean(admin)).filter((row) => row.type === "pencairan");

    expect(pencairan).toHaveLength(2);
    expect(pencairan[0]).toMatchObject({
      tier: 3,
      label: "Pencairan jatuh tempo",
      subjectKind: "penerima_pencairan",
      // A row per recipient, not per item: the transfer is per recipient.
      subjectId: expect.stringMatching(/^lokasi_mitra:/),
      deadline: wib("2026-10-06 23:59"),
      // Tier 3 never alerts (spec, Work Queues), and nothing is claimed yet.
      alerts: false,
      ambil: null,
    });
    expect(pencairan.map((row) => row.subjectLabel).sort()).toEqual([
      "Makam Sawah Besar · 2 item · Rp 9.500.000",
      "Makam Wakaf Al-Ikhlas · 2 item · Rp 9.500.000",
    ]);
    expect(await setup.queues.counters(admin)).toMatchObject({ pencairanDue: 2, pastDeadline: 0 });

    // Two Hari Kerja on, both rows are past their deadline: that is what "Pencairan
    // jatuh tempo" in the counter strip's name means.
    setup.clock.set(wib("2026-10-07 10:00"));
    const lewat = (await setup.queues.antrean(admin)).filter((row) => row.type === "pencairan");
    expect(lewat.every((row) => row.pastDeadline)).toBe(true);
    expect(await setup.queues.counters(admin)).toMatchObject({ pencairanDue: 2, pastDeadline: 2 });
  });

  it("closes itself the moment the state it reads moves on, and a held-out item is not open work", async () => {
    const { setup, admin } = await duaPenerima();
    const sebelum = (await setup.queues.antrean(admin)).filter((row) => row.type === "pencairan");
    const [row] = await setup.payouts.jalankanPencairan(admin);
    const [item] = row!.items;

    const ditahan = await setup.payouts.tahanPencairan(admin, { itemId: item.id, alasan: "Menunggu rekening baru" });
    expect(ditahan).toMatchObject({ ok: true, ditahan: true });
    // The recipient still has an item waiting, so its row is still there; a hold is
    // a decision already taken, not work to do, so the row asks for less.
    const sesudahTahan = (await setup.queues.antrean(admin)).filter((satu) => satu.type === "pencairan");
    expect(sesudahTahan).toHaveLength(2);
    expect(sesudahTahan.map((satu) => satu.subjectId).sort()).toEqual(sebelum.map((satu) => satu.subjectId).sort());
    expect(await setup.queues.counters(admin)).toMatchObject({ pencairanDue: 2 });

    // Transferring everything that is left closes every row for good.
    for (const baris of await setup.payouts.jalankanPencairan(admin)) {
      if (baris.items.length === 0) continue;
      const hasil = await setup.payouts.terbitkanBuktiPencairan(admin, {
        itemIds: baris.items.map((satu) => satu.id),
        ditransferPada: "2026-10-01",
        bukti: buktiTransfer,
      });
      expect(hasil.ok).toBe(true);
    }
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "pencairan")).toEqual([]);
    expect(await setup.queues.counters(admin)).toMatchObject({ pencairanDue: 0, pastDeadline: 0 });
  });

  it("is Admin Platform's alone: an Admin Lokasi has no Antrean at all", async () => {
    const { setup, admin } = await duaPenerima();
    const [row] = await setup.payouts.jalankanPencairan(admin);
    const adminLokasi = await adminLokasiOf(setup, admin, row!.recipient.lokasiId!, 1);

    expect((await setup.queues.antrean(adminLokasi)).filter((satu) => satu.type === "pencairan")).toEqual([]);
    expect(await setup.queues.counters(adminLokasi)).toMatchObject({ pencairanDue: 0 });
  });
});
