import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { Rupiah } from "@/lib/rupiah";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  newLayananFor,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
  type LayananSetup,
} from "../../../tests/support/layanan";

/**
 * The Layanan a booking checkout adds (spec, Layanan > Order; ticket 53): which
 * catalog slice each checkout offers, what its items cost on the checkout's own
 * Tagihan, and the Pekerjaan Layanan they become. Every assertion goes through the
 * module's public interface; nothing reads a table.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB, so "today" in the
 * date rules below is that day and a Pembersihan Makam has a 3-day lead time.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const rp = (amount: number) => amount as Rupiah;

async function siap() {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
  const { pemesan } = await pemesanLayanan(setup);
  return { setup, lokasi, pemesan };
}

/** Offers one more Layanan at the same Lokasi, with the flags this test is about. */
async function tawarkan(
  setup: LayananSetup,
  lokasi: Awaited<ReturnType<typeof lokasiDenganLayanan>>,
  flags: { bisaHariH: boolean; adaDiPetakKosong: boolean },
  nama = flags.bisaHariH ? "Bunga Tabur" : "Perawatan Rumput",
) {
  const { layanan, varian } = await newLayananFor(setup, lokasi.admin, { name: nama, bisaHariH: flags.bisaHariH, adaDiPetakKosong: flags.adaDiPetakKosong });
  const ditawarkan = await setup.layanan.tawarkanLayanan(lokasi.admin, lokasi.lokasiMitra.id, varian.id, {
    amount: 400_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  if (!ditawarkan.ok) throw new Error(`offering refused: ${ditawarkan.reason}`);
  return { layanan, varian };
}

describe("the Layanan a booking checkout offers", () => {
  it("a Saat Duka offers only the items that can be done on the burial day", async () => {
    const { setup, lokasi } = await siap();
    // The fixture's own Layanan is empty-plot only; add a hari-H one beside it.
    const hariH = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });

    const penawaran = await setup.layanan.penawaranCheckout(lokasi.lokasiMitra.id, "saat_duka");
    expect(penawaran.map((grup) => grup.layanan.id)).toEqual([hariH.layanan.id]);
    expect(penawaran[0].varian.map((satu) => satu.harga)).toEqual([400_000]);
  });

  it("a Terencana offers only the items that make sense on an empty plot", async () => {
    const { setup, lokasi } = await siap();
    const hariH = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });

    const penawaran = await setup.layanan.penawaranCheckout(lokasi.lokasiMitra.id, "terencana");
    expect(penawaran.map((grup) => grup.layanan.id)).toEqual([lokasi.layanan.id]);
    expect(penawaran.map((grup) => grup.layanan.id)).not.toContain(hariH.layanan.id);
  });

  it("a Perpanjangan offers the Lokasi's whole offering", async () => {
    const { setup, lokasi } = await siap();
    const hariH = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });

    const penawaran = await setup.layanan.penawaranCheckout(lokasi.lokasiMitra.id, "perpanjangan");
    expect(penawaran.map((grup) => grup.layanan.id).sort()).toEqual([lokasi.layanan.id, hariH.layanan.id].sort());
  });

  it("refuses an item the checkout's own kind may not offer", async () => {
    const { setup, lokasi } = await siap();
    // The fixture's Layanan is empty-plot only, so a Saat Duka may not add it.
    const hasil = await setup.layanan.barisCheckout(
      { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
      "saat_duka",
      [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-05" }],
    );
    expect(hasil).toEqual({ ok: false, reason: "layanan_tidak_tersedia" });
  });
});

describe("pricing a checkout's Layanan", () => {
  it("returns the items' lines with no second Biaya Layanan Platform", async () => {
    const { setup, lokasi } = await siap();
    const bunga = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });

    const hasil = await setup.layanan.barisCheckout(
      { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
      "saat_duka",
      [
        { layananVariantId: bunga.varian.id, targetDate: "2026-10-04" },
        { layananVariantId: bunga.varian.id, targetDate: "2026-10-04", teks: null },
      ],
    );
    if (!hasil.ok) throw new Error(`baris refused: ${hasil.reason}`);
    // Two items, two lines, and never a `biaya_layanan_platform`: the checkout's own
    // Tagihan already carries the one fee the rule allows (AC: one fee per Tagihan).
    expect(hasil.lines.map((line) => line.kind)).toEqual(["layanan", "layanan"]);
    expect(hasil.total).toBe(800_000);
  });

  it("measures a Perpanjangan target date from the Tagihan's due date, so a too-early date is rejected", async () => {
    const { setup, lokasi } = await siap();
    const dueAt = wib("2026-10-10 09:00");
    const lokasiArg = { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name };

    const terlaluAwal = await setup.layanan.barisCheckout(lokasiArg, "perpanjangan", [
      { layananVariantId: lokasi.varian.id, targetDate: "2026-10-11" },
    ], { dueAt });
    expect(terlaluAwal).toEqual({ ok: false, reason: "lead_time_melewati" });

    const tepat = await setup.layanan.barisCheckout(lokasiArg, "perpanjangan", [
      { layananVariantId: lokasi.varian.id, targetDate: "2026-10-13" },
    ], { dueAt });
    expect(tepat).toMatchObject({ ok: true, total: 750_000 });
  });

  it("rejects a Layanan that asks for text when the field is empty", async () => {
    const { setup, lokasi } = await siap();
    const nisan = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });
    // Give the second Layanan a text field by replacing its catalog entry through a new one.
    const denganTeks = await newLayananFor(setup, lokasi.admin, { name: "Batu Nisan", bisaHariH: true, adaDiPetakKosong: false, teksLabel: "Tulisan batu" });
    const ditawarkan = await setup.layanan.tawarkanLayanan(lokasi.admin, lokasi.lokasiMitra.id, denganTeks.varian.id, {
      amount: 500_000,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    if (!ditawarkan.ok) throw new Error("offering refused");

    const hasil = await setup.layanan.barisCheckout(
      { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
      "saat_duka",
      [{ layananVariantId: denganTeks.varian.id, targetDate: "2026-10-04", teks: "" }],
    );
    expect(hasil).toEqual({ ok: false, reason: "teks_kosong" });
    expect(nisan).toBeTruthy();
  });
});

describe("a checkout's Layanan become Pekerjaan Layanan", () => {
  it("are written as one order on the checkout's Tagihan, Dijadwalkan at once", async () => {
    const { setup, lokasi, pemesan } = await siap();
    const bunga = await tawarkan(setup, lokasi, { bisaHariH: true, adaDiPetakKosong: false });
    const petak = await petakDenganHakPakai(setup, lokasi);
    // The checkout's own pay-after Tagihan, issued exactly as a Saat Duka confirmation issues one.
    const tagihan = await setup.billing.issueTagihan({
      moment: { kind: "saat_duka", burialAt: wib("2026-10-02 10:00"), paymentWindowHours: 72 },
      addressee: { name: "Budi Santoso", phoneNumber: "081234567890", accountId: pemesan.accountId },
      nomorPemesanan: "MKM-2026-000001",
      placeName: lokasi.lokasiMitra.name,
      lines: [{ kind: "layanan", label: "Layanan – Bunga Tabur", amount: rp(400_000), provider: { kind: "lokasi_mitra", lokasiId: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name }, targetDate: "2026-10-02", leadTimeDays: 0 }],
    });
    if (!tagihan.ok) throw new Error(`Tagihan refused: ${tagihan.reason}`);
    const tagihanId = tagihan.tagihan.id;

    const hasil = await setup.layanan.jadwalkanCheckout(
      {
        pemesan: { accountId: pemesan.accountId, name: "Budi Santoso", email: pemesan.email, phoneNumber: "081234567890" },
        lokasi: { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
        petak: { id: petak.petakId, nomor: petak.nomor },
        hakPakaiId: petak.hakPakaiId,
        tagihanId,
        createdAt: wib("2026-10-01 09:00"),
        baris: [{ layananId: bunga.layanan.id, layananVariantId: bunga.varian.id, label: "Layanan – Bunga Tabur", amount: 400_000, leadTimeDays: 0, targetDate: "2026-10-04", teks: null }],
      },
      db,
    );
    if (!hasil.ok) throw new Error(`checkout order refused: ${hasil.reason}`);
    expect(hasil.dijadwalkan).toBe(1);

    const order = await setup.layanan.pesananLayananOf(hasil.nomor, { accountId: pemesan.accountId });
    expect(order?.tagihan?.id).toBe(tagihanId);
    expect(order?.item).toHaveLength(1);
    expect(order?.item[0].targetDate).toBe("2026-10-04");
    expect(order?.item[0].pekerjaan?.status).toBe("dijadwalkan");
  });
});
