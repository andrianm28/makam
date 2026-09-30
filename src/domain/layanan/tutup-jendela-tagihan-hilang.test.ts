/**
 * The tick that closes the Keluhan window makes each job's Pencairan due job by job (ticket 93): a job whose Tagihan Billing can
 * no longer find is a broken invariant that is reported, and it never holds the other jobs' Pencairan back.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Billing } from "@/domain/billing";
import { composeLayanan } from "@/composition/layanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

describe("closing the Keluhan window when one job's Tagihan cannot be found (ticket 93)", () => {
  it("reports that job, does not throw, and still makes the other job's Pencairan due", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup);
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup);
    setup.clock.set(wib("2026-10-01 10:00"));

    const pekerjaan: { pekerjaanId: string; tagihanId: string }[] = [];
    for (let i = 0; i < 2; i += 1) {
      const order = await setup.layanan.placePesananLayanan(pemesan, {
        pemesanName: "Budi Santoso",
        phoneNumber: "081234567890",
        lokasiId: lokasi.lokasiMitra.id,
        petakId: petak.petakId,
        item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
      });
      if (!order.ok) throw new Error(`order refused: ${order.reason}`);
      const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
      if (!dibayar.ok) throw new Error("payment refused");
      const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
      if (!kerja) throw new Error("no job");
      pekerjaan.push({ pekerjaanId: kerja.id, tagihanId: order.tagihan.id });
    }
    await setup.payouts.tick();
    setup.clock.set(wib("2026-10-20 10:00"));
    for (const { pekerjaanId } of pekerjaan) {
      for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
        const diunggah = await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, { pekerjaanId, kind, takenAt: wib("2026-10-20 10:00"), file: { body: foto(), contentType: "image/jpeg" } });
        if (!diunggah.ok) throw new Error(`proof refused: ${diunggah.reason}`);
      }
      const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId });
      if (!selesai.ok) throw new Error(`Selesai refused: ${selesai.reason}`);
    }

    // The first job's Tagihan is one Billing cannot find (a broken invariant, so it is simulated on Billing's side of the seam).
    const hilang = pekerjaan[0].tagihanId;
    const tanpaTagihan = (billing: Billing): Billing => ({
      ...billing,
      within: (tx) => {
        const dalam = billing.within(tx);
        return { ...dalam, tagihanBerlaku: async (id: string) => (id === hilang ? null : dalam.tagihanBerlaku(id)) };
      },
    });
    const dilaporkan: unknown[] = [];
    const layanan = composeLayanan({
      db: setup.db,
      clock: setup.clock,
      files: setup.files,
      audit: setup.audit,
      lokasi: setup.lokasi,
      tariffs: setup.tariffs,
      inventory: setup.inventory,
      billing: tanpaTagihan(setup.billing),
      identity: setup.identity,
      refunds: setup.refunds,
      payouts: setup.payouts,
      notifikasi: setup.notifikasi,
      reportError: (error) => dilaporkan.push(error),
    });

    setup.clock.set(wib("2026-10-24 10:00"));
    const hasil = await layanan.tutupJendelaKeluhan(setup.clock.now());

    expect(hasil).toEqual({ ditutup: 2, pencairanJatuhTempo: 1 });
    expect(dilaporkan).toHaveLength(1);
    const run = await setup.payouts.jalankanPencairan(lokasi.admin);
    expect(run.flatMap((baris) => baris.items.map((item) => item.amount))).toEqual([750_000]);
  });
});
